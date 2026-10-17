import { randomUUID } from 'node:crypto';
import type { ExploreResult, FlightQuery, HotelQuery, Offer, Status } from '../src/shared/types';
import { AIRPORTS, findAirport, haversineKm } from '../src/shared/domain';

/** Only safe, user-facing messages cross the API boundary. */
export class ProviderError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly userMessage: string;
  constructor(code: string, userMessage: string, statusCode = 503) {
    super(userMessage);
    this.name = 'ProviderError';
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const positive = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

function httpsLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || /(^|\.)serpapi\.com$/i.test(url.hostname)) return undefined;
    if ([...url.searchParams.keys()].some((key) => /api.?key|access.?token|secret/i.test(key))) return undefined;
    return url.toString();
  } catch { return undefined; }
}

async function requestSerpApi(parameters: Record<string, string>): Promise<Json> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new ProviderError('PROVIDER_SETUP_REQUIRED', 'Configure SERPAPI_API_KEY no servidor para pesquisar passagens reais.');
  const url = new URL('https://serpapi.com/search.json');
  Object.entries(parameters).forEach(([name, value]) => url.searchParams.set(name, value));
  url.searchParams.set('api_key', key);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new ProviderError('PROVIDER_UNAVAILABLE', 'A fonte de passagens não respondeu a tempo. Tente novamente mais tarde.', 502);
  }
  if (response.status === 401 || response.status === 403) throw new ProviderError('PROVIDER_AUTH_FAILED', 'A fonte de passagens recusou a credencial. Confira a configuração segura do servidor.', 502);
  if (response.status === 429) throw new ProviderError('PROVIDER_QUOTA_EXCEEDED', 'A fonte de passagens atingiu o limite de consultas. Aguarde ou confira a cota da conta.', 429);
  if (!response.ok) throw new ProviderError('PROVIDER_UNAVAILABLE', 'Não foi possível consultar a fonte de passagens agora.', 502);
  let data: Json;
  try { data = record(await response.json()); }
  catch { throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'A fonte de passagens retornou uma resposta inválida.', 502); }
  if (data.error || string(record(data.search_metadata).status).toLowerCase() === 'error') throw new ProviderError('PROVIDER_SEARCH_FAILED', 'A fonte não concluiu esta pesquisa. Confira os aeroportos e as datas ou tente novamente.', 502);
  return data;
}

// Transcontinental countries require airport-level geography before classifying
// their unknown airports as Europe; a country name alone is insufficient.
const EUROPE_COUNTRIES = new Set(['albania', 'andorra', 'austria', 'belarus', 'belgium', 'bosnia and herzegovina', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'iceland', 'ireland', 'italy', 'kosovo', 'latvia', 'liechtenstein', 'lithuania', 'luxembourg', 'malta', 'moldova', 'monaco', 'montenegro', 'netherlands', 'north macedonia', 'norway', 'poland', 'portugal', 'romania', 'san marino', 'serbia', 'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland', 'ukraine', 'united kingdom', 'vatican city']);

function textKey(value: string): string { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(); }

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function dateOnly(value: unknown): string {
  const text = string(value);
  const parsed = new Date(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

export function getProviderStatus(): Status['providers'] {
  return {
    flights: { configured: Boolean(process.env.SERPAPI_API_KEY), name: 'SerpApi · Google Flights' },
    hotels: { configured: false, name: 'Booking' },
  };
}

function cents(value: unknown): number | undefined {
  const price = positive(value);
  const normalized = price === undefined ? NaN : Math.round(price * 100);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : undefined;
}

function verifyCurrency(data: Json): void {
  const currency = string(record(data.search_parameters).currency);
  if (currency && currency !== 'BRL') throw new ProviderError('PROVIDER_INVALID_CURRENCY', 'A fonte retornou outra moeda. O preço não foi convertido nem salvo como reais.', 502);
}

function enforceDistance(query: FlightQuery): number | undefined {
  const entry = query.arrivalAirport;
  const exit = query.departureAirport;
  if (!entry || !exit || entry === exit) return entry && exit ? 0 : undefined;
  if (!query.allowOpenJaw) throw new ProviderError('INVALID_QUERY', 'Ative a opção de aeroportos diferentes para esta rota.', 400);
  const first = findAirport(entry);
  const second = findAirport(exit);
  if (query.maxAirportDistanceKm !== undefined && (!first || !second)) throw new ProviderError('AIRPORT_COORDINATES_REQUIRED', 'Não há coordenadas locais para validar a distância entre estes aeroportos. Escolha aeroportos cadastrados ou remova o limite de distância.', 400);
  const distance = first && second ? haversineKm(first, second) : undefined;
  if (distance !== undefined && query.maxAirportDistanceKm !== undefined && distance > query.maxAirportDistanceKm) throw new ProviderError('AIRPORT_DISTANCE_EXCEEDED', 'Os aeroportos de chegada e saída excedem a distância máxima informada.', 400);
  return distance;
}

function conditionsWarnings(query: FlightQuery): string[] {
  const warnings = ['Preços candidatos: retorno, bagagem, condições e disponibilidade ainda precisam de confirmação antes de um alerta.'];
  if (query.adults > 1) warnings.push('A pesquisa usa a quantidade de adultos informada. A forma de apresentar o total para vários passageiros ainda precisa ser validada; não tratamos este valor como preço por pessoa.');
  return warnings;
}

function exactEntry(query: FlightQuery): string | undefined {
  const value = query.arrivalAirport || (/^[A-Z]{3}$/i.test(query.destination.trim()) ? query.destination.trim().toUpperCase() : '');
  return value || undefined;
}

function normalizeExact(data: Json, query: FlightQuery, entry: string): Offer[] {
  const observedAt = new Date().toISOString();
  const url = httpsLink(record(data.search_metadata).google_flights_url);
  return [...array(data.best_flights), ...array(data.other_flights)].flatMap((value): Offer[] => {
    const candidate = record(value);
    const segments = array(candidate.flights).map(record);
    const first = segments[0];
    const last = segments.at(-1);
    const price = cents(candidate.price);
    if (!first || !last || price === undefined) return [];
    const actualOrigin = string(record(first.departure_airport).id);
    const actualArrival = string(record(last.arrival_airport).id);
    if (actualOrigin !== query.origin || actualArrival !== entry) return [];
    const flightDate = string(record(first.departure_airport).time).slice(0, 10);
    if (flightDate && flightDate !== query.departureDate) return [];
    const airlines = [...new Set(segments.map((segment) => string(segment.airline)).filter(Boolean))];
    const extensions = array(candidate.extensions).filter((item): item is string => typeof item === 'string').slice(0, 8);
    return [{
      id: randomUUID(), kind: 'flight', title: `${query.origin} → ${entry}`, price, currency: 'BRL',
      outboundDate: query.departureDate, returnDate: query.returnDate, origin: actualOrigin,
      arrivalAirport: actualArrival, departureAirport: query.departureAirport || entry,
      airline: airlines.join(' + ') || undefined, url, observedAt, provider: 'SerpApi · Google Flights', confirmed: false,
      details: [`${query.adults} adulto(s) na pesquisa`, 'Tarifa inicial; seleção do retorno e condições pendentes',
        ...(query.departureAirport && query.departureAirport !== entry ? [`Saída solicitada por ${query.departureAirport}; próximo trecho ainda não confirmado`] : []), ...extensions],
    }];
  }).sort((a, b) => a.price - b.price);
}

function matchesDestination(deal: Json, query: FlightQuery): boolean {
  const airport = string(deal.arrival_airport_code).toUpperCase();
  const requiredAirport = exactEntry(query) || query.departureAirport;
  if (requiredAirport) return airport === requiredAirport;
  const destination = textKey(query.destination);
  if (destination === 'europa' || destination === 'europe') {
    const country = textKey(string(deal.country));
    // Known non-Brazil airports in the starter table are all European. Country
    // evidence permits other European airports without inventing coordinates.
    return EUROPE_COUNTRIES.has(country) || Boolean(findAirport(airport) && findAirport(airport)?.country !== 'Brasil');
  }
  if (destination === textKey(string(deal.name)) || destination === textKey(string(deal.country))) return true;
  const known = AIRPORTS.filter((item) => textKey(item.name.split(' · ')[0]) === destination || textKey(item.country) === destination);
  return known.some((item) => item.code === airport);
}

async function exploreFlight(query: FlightQuery): Promise<ExploreResult> {
  enforceDistance(query); // Reject incompatible pairs before consuming a query.
  if (!process.env.SERPAPI_API_KEY) throw new ProviderError('PROVIDER_SETUP_REQUIRED', 'Configure SERPAPI_API_KEY no servidor para pesquisar passagens reais.');
  const base = { currency: 'BRL', gl: 'br', hl: 'pt-BR', adults: String(query.adults), travel_class: '1' };
  const warnings = conditionsWarnings(query);
  if (query.departureDate && query.returnDate) {
    const entry = exactEntry(query);
    if (!entry) throw new ProviderError('EXACT_AIRPORT_REQUIRED', 'Para consultar datas exatas, informe o aeroporto de chegada. Deixe as datas livres para explorar uma região.', 400);
    const exit = query.departureAirport || entry;
    const openJaw = exit !== entry;
    // Include the entry inferred from destination in the preflight distance check.
    enforceDistance({ ...query, arrivalAirport: entry, departureAirport: exit });
    const parameters: Record<string, string> = openJaw ? {
      ...base, engine: 'google_flights', type: '3',
      multi_city_json: JSON.stringify([
        { departure_id: query.origin, arrival_id: entry, date: query.departureDate },
        { departure_id: exit, arrival_id: query.origin, date: query.returnDate },
      ]),
    } : { ...base, engine: 'google_flights', type: '1', departure_id: query.origin, arrival_id: entry, outbound_date: query.departureDate, return_date: query.returnDate };
    const data = await requestSerpApi(parameters);
    verifyCurrency(data);
    const offers = normalizeExact(data, query, entry);
    if (!offers.length) warnings.push('Nenhuma oferta válida retornou para os aeroportos e datas informados. Isso não prova ausência de tarifas em outras fontes.');
    return { offers, coverage: { complete: true, description: 'Uma combinação de aeroportos e datas consultada. Os valores são candidatos e ainda não têm retorno e opções de reserva confirmados.', queries: 1 }, warnings };
  }
  const entry = exactEntry(query);
  if (entry && query.departureAirport && entry !== query.departureAirport) return {
    offers: [], coverage: { complete: false, queries: 0, requestedHorizonMonths: query.horizonMonths, description: 'A descoberta flexível ainda não pesquisa pares de entrada e saída fixos diferentes. Informe datas para consultar esse itinerário multicidade.' },
    warnings: [...warnings, 'Nenhuma consulta foi consumida. Para entrada e saída diferentes com datas livres, a estratégia de coleta multicidade ainda precisa ser ampliada.'],
  };
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + query.horizonMonths);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const data = await requestSerpApi({ ...base, engine: 'google_flights_deals', type: '1', departure_id: query.origin,
    outbound_date: `${startDate},${endDate}`, trip_length: `${query.minDays},${query.maxDays}` });
  verifyCurrency(data);
  let discarded = 0;
  const observedAt = new Date().toISOString();
  const offers = array(data.deals).flatMap((value): Offer[] => {
    const deal = record(value);
    const price = cents(deal.price);
    const outboundDate = dateOnly(deal.start_date || deal.outbound_date);
    const returnDate = dateOnly(deal.end_date || deal.return_date);
    const duration = daysBetween(outboundDate, returnDate);
    const airport = string(deal.arrival_airport_code).toUpperCase();
    if (price === undefined || !outboundDate || !returnDate || outboundDate < startDate || outboundDate > endDate || !Number.isInteger(duration) || duration < query.minDays || duration > query.maxDays || string(deal.departure_airport_code).toUpperCase() !== query.origin || !/^[A-Z]{3}$/.test(airport) || !matchesDestination(deal, query)) { discarded++; return []; }
    return [{ id: randomUUID(), kind: 'flight', title: `${query.origin} → ${string(deal.name) || airport}`, price, currency: 'BRL',
      outboundDate, returnDate, origin: query.origin, arrivalAirport: airport, departureAirport: airport,
      airline: string(deal.airline) || undefined, url: httpsLink(deal.flight_link), details: [`${duration} dias`, `${query.adults} adulto(s) na pesquisa`, 'Chegada e saída pelo mesmo aeroporto; tarifa ainda não confirmada'],
      observedAt, provider: 'SerpApi · Google Flights Deals', confirmed: false }];
  }).sort((a, b) => a.price - b.price);
  if (discarded) warnings.push(`${discarded} resultado(s) foram descartados por não comprovar os aeroportos, destino, moeda ou duração solicitados.`);
  if (!offers.length) warnings.push('Nenhuma oferta compatível foi encontrada nesta amostra. A fonte não garante cobertura de todas as datas ou destinos.');
  if (query.allowOpenJaw) warnings.push('Esta descoberta considera ida e volta pelo mesmo aeroporto. As combinações com cidades de entrada e saída diferentes ainda não foram exploradas.');
  warnings.push('A janela foi enviada à fonte, mas a cobertura de cada mês e de todas as combinações não é garantida. Esta amostra não alimenta a média histórica nem dispara alertas.');
  return { offers, coverage: { complete: false, queries: 1, requestedHorizonMonths: query.horizonMonths,
    description: 'Amostra de ofertas com duração variável e datas futuras. Cobertura parcial: sem varredura de cada dia, sem garantia de todos os meses e sem busca multicidade.' }, warnings };
}

export async function explore(kind: 'flight' | 'hotel', query: FlightQuery | HotelQuery): Promise<ExploreResult> {
  if (kind === 'hotel') throw new ProviderError('BOOKING_ADAPTER_PENDING', 'Booking é a fonte escolhida para hotéis. A conexão autenticada e o adaptador de preços ainda precisam ser disponibilizados neste servidor.');
  return exploreFlight(query as FlightQuery);
}
