import { randomUUID } from 'node:crypto';
import type { ExploreResult, FlightQuery, FlightSegment, HotelQuery, Offer, Status } from '../src/shared/types';
import { findAirport, haversineKm } from '../src/shared/domain';
import { AIRPORTS, isAirportInArea, matchesRegion, REGIONS, searchAirports } from '../src/shared/airports.ts';
import { airportInTrip, countriesInAreas, previewTrip } from '../src/shared/trip-planner.ts';

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
const nonnegativeInteger = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

function httpsLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || /(^|\.)serpapi\.com$/i.test(url.hostname)) return undefined;
    if ([...url.searchParams.keys()].some((key) => /api.?key|access.?token|secret/i.test(key))) return undefined;
    return url.toString();
  } catch { return undefined; }
}

// The UI runs this search in a background job. Legacy synchronous callers use
// a shorter budget. Discovery gets its own allowance so a slow recommendation
// feed cannot prevent route/date searches; all samples share one deadline.
const SEARCH_BUDGET_MS = 54_000;
const DISCOVERY_TIMEOUT_MS = 20_000;
const EXACT_TIMEOUT_MS = 45_000;
const FALLBACK_TIMEOUT_MS = 32_000;
type SearchBudget = { deadline: number };

async function requestSerpApi(parameters: Record<string, string>, budget: SearchBudget, timeoutMs: number): Promise<Json> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new ProviderError('PROVIDER_SETUP_REQUIRED', 'Configure SERPAPI_API_KEY no servidor para pesquisar passagens reais.');
  const url = new URL('https://serpapi.com/search.json');
  Object.entries(parameters).forEach(([name, value]) => url.searchParams.set(name, value));
  url.searchParams.set('api_key', key);
  const remaining = Math.min(timeoutMs, budget.deadline - Date.now());
  if (remaining <= 0) throw new ProviderError('PROVIDER_TIMEOUT', 'A consulta demorou mais que o esperado. Tente novamente ou escolha uma cidade e datas para uma busca mais rápida.', 504);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 401 || response.status === 403) throw new ProviderError('PROVIDER_AUTH_FAILED', 'A fonte de passagens recusou a credencial. Confira a configuração segura do servidor.', 502);
    if (response.status === 429) throw new ProviderError('PROVIDER_QUOTA_EXCEEDED', 'A fonte de passagens atingiu o limite de consultas. Aguarde ou confira a cota da conta.', 429);
    if (response.status === 408 || response.status === 504) throw new ProviderError('PROVIDER_TIMEOUT', 'A consulta demorou mais que o esperado. Tente novamente ou escolha uma cidade e datas para uma busca mais rápida.', 504);
    if (!response.ok) throw new ProviderError('PROVIDER_UNAVAILABLE', 'Não foi possível consultar a fonte de passagens agora.', 502);
    let data: Json;
    try { data = record(await response.json()); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'A fonte de passagens retornou uma resposta inválida.', 502);
    }
    if (data.error || string(record(data.search_metadata).status).toLowerCase() === 'error') throw new ProviderError('PROVIDER_SEARCH_FAILED', 'A fonte não concluiu esta pesquisa. Confira os aeroportos e as datas ou tente novamente.', 502);
    return data;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) throw new ProviderError('PROVIDER_TIMEOUT', 'A consulta demorou mais que o esperado. Tente novamente ou escolha uma cidade e datas para uma busca mais rápida.', 504);
    throw new ProviderError('PROVIDER_NETWORK_ERROR', 'Não foi possível conectar ao serviço de passagens. Tente novamente em alguns instantes.', 502);
  } finally { clearTimeout(timer); }
}

function textKey(value: string): string { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(); }

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function dateOnly(value: unknown): string {
  const text = string(value);
  const parsed = new Date(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

function localDateTime(value: unknown): string | undefined {
  const text = string(value);
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(text) || !dateOnly(text.slice(0, 10))) return undefined;
  return Number(text.slice(11, 13)) < 24 && Number(text.slice(14, 16)) < 60 ? text : undefined;
}

function flightSegments(segments: Json[]): FlightSegment[] {
  return segments.flatMap(segment => {
    const departure = record(segment.departure_airport);
    const arrival = record(segment.arrival_airport);
    const origin = string(departure.id).toUpperCase();
    const destination = string(arrival.id).toUpperCase();
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return [];
    return [{ origin, destination, departureTime: localDateTime(departure.time), arrivalTime: localDateTime(arrival.time),
      airline: string(segment.airline) || undefined, flightNumber: string(segment.flight_number) || undefined }];
  });
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

function enforceArea(query: FlightQuery, entry: string, exit: string): void {
  if (query.tripPlan) {
    const preview = previewTrip(query.tripPlan, entry, exit);
    if (preview.status !== 'ready') throw new ProviderError('INVALID_TRIP_PLAN', preview.message, 400);
  }
  if (!query.area) return;
  for (const code of [entry, exit]) {
    const airport = findAirport(code);
    if (!airport || !isAirportInArea(airport, query.area)) {
      throw new ProviderError('AIRPORT_OUTSIDE_AREA', 'Os aeroportos de chegada e retorno precisam ficar dentro da área marcada no mapa.', 400);
    }
  }
}

function conditionsWarnings(query: FlightQuery): string[] {
  const warnings = ['Preços candidatos: retorno, bagagem, condições e disponibilidade ainda precisam de confirmação antes de um alerta.'];
  if (query.adults > 1) warnings.push('A pesquisa usa a quantidade de adultos informada. A forma de apresentar o total para vários passageiros ainda precisa ser validada; não tratamos este valor como preço por pessoa.');
  if (query.tripPlan) warnings.push('Roteiro geográfico: tempos são estimativas por distância, sem verificar estradas, horários, travessias ou serviços disponíveis. A cotação é somente da passagem de entrada/retorno, sem trens, carros, voos internos e hotéis. A ordem da prévia reduz distância na amostra; não otimiza o custo total da viagem.');
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
      id: randomUUID(), kind: 'flight', title: `${findAirport(query.origin)?.city.split(' (')[0] || query.origin} → ${findAirport(entry)?.city.split(' (')[0] || entry}`, price, currency: 'BRL',
      passengers: query.adults, priceBasis: 'unknown', itineraryStatus: 'outbound-only',
      flightLegs: [{ direction: 'outbound', segments: flightSegments(segments), durationMinutes: positive(candidate.total_duration), stops: Math.max(0, segments.length - 1) }],
      outboundDate: query.departureDate, returnDate: query.returnDate, origin: actualOrigin,
      arrivalAirport: actualArrival, departureAirport: query.departureAirport || entry,
      airline: airlines.join(' + ') || undefined, url, observedAt, provider: 'SerpApi · Google Flights', confirmed: false,
      details: [`${query.adults} adulto(s) na pesquisa`, 'Tarifa inicial; seleção do retorno e condições pendentes',
        ...(query.departureAirport && query.departureAirport !== entry ? [`Saída solicitada por ${query.departureAirport}; próximo trecho ainda não confirmado`] : []), ...extensions],
    }];
  }).sort((a, b) => a.price - b.price);
}

function matchesDestination(deal: Json, query: FlightQuery): boolean {
  const code = string(deal.arrival_airport_code).toUpperCase();
  const airport = findAirport(code);
  if (query.area && (!airport || !isAirportInArea(airport, query.area))) return false;
  if (query.tripPlan && (!airport || !airportInTrip(airport, query.tripPlan))) return false;
  const requiredAirport = exactEntry(query) || query.departureAirport;
  if (requiredAirport) return code === requiredAirport;
  // In map mode the circle is the destination. Its human label is not a
  // second geographical filter (and may cross country/region borders).
  if (query.area || query.tripPlan) return true;
  const destination = textKey(query.destination);
  const region = REGIONS.find((item) => item.id === destination || textKey(item.label) === destination ||
    (destination === 'europe' && item.id === 'europe'));
  if (region) {
    return Boolean(airport && matchesRegion(airport, region.id));
  }
  if (destination === textKey(string(deal.name)) || destination === textKey(string(deal.country))) return true;
  return searchAirports(query.destination, 100).some((item) => item.code === code);
}

async function exploreFlight(query: FlightQuery, budget: SearchBudget = { deadline: Date.now() + SEARCH_BUDGET_MS }, fallback = false): Promise<ExploreResult> {
  enforceDistance(query); // Reject incompatible pairs before consuming a query.
  if (query.tripPlan) {
    const preview = previewTrip(query.tripPlan);
    if (preview.status !== 'ready') throw new ProviderError('INVALID_TRIP_PLAN', preview.message, 400);
  }
  if (!process.env.SERPAPI_API_KEY) throw new ProviderError('PROVIDER_SETUP_REQUIRED', 'Configure SERPAPI_API_KEY no servidor para pesquisar passagens reais.');
  const base = { currency: 'BRL', gl: 'br', hl: 'pt-BR', adults: String(query.adults), travel_class: '1' };
  const warnings = conditionsWarnings(query);
  if (query.departureDate && query.returnDate) {
    const entry = exactEntry(query);
    if (!entry) throw new ProviderError('EXACT_AIRPORT_REQUIRED', 'Para consultar datas exatas, informe o aeroporto de chegada. Deixe as datas livres para explorar uma região.', 400);
    const exit = query.departureAirport || entry;
    const openJaw = exit !== entry;
    enforceArea(query, entry, exit);
    // Include the entry inferred from destination in the preflight distance check.
    enforceDistance({ ...query, arrivalAirport: entry, departureAirport: exit });
    const parameters: Record<string, string> = openJaw ? {
      ...base, engine: 'google_flights', type: '3',
      multi_city_json: JSON.stringify([
        { departure_id: query.origin, arrival_id: entry, date: query.departureDate },
        { departure_id: exit, arrival_id: query.origin, date: query.returnDate },
      ]),
    } : { ...base, engine: 'google_flights', type: '1', departure_id: query.origin, arrival_id: entry, outbound_date: query.departureDate, return_date: query.returnDate };
    const data = await requestSerpApi(parameters, budget, fallback ? FALLBACK_TIMEOUT_MS : EXACT_TIMEOUT_MS);
    verifyCurrency(data);
    if (!Array.isArray(data.best_flights) && !Array.isArray(data.other_flights)) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Não conseguimos ler os preços retornados. Tente novamente em alguns minutos.', 502);
    const offers = addTripPreviews(normalizeExact(data, query, entry), query);
    if (!offers.length) warnings.push('Nenhuma oferta válida retornou para os aeroportos e datas informados. Isso não prova ausência de tarifas em outras fontes.');
    return { offers, coverage: { complete: !query.tripPlan, description: 'Uma combinação de aeroportos e datas consultada. Os valores são candidatos e ainda não têm retorno e opções de reserva confirmados. Deslocamentos entre países não estão cotados.', queries: 1 }, warnings };
  }
  const entry = exactEntry(query);
  const fixedOpenJaw = Boolean(entry && query.departureAirport && entry !== query.departureAirport);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + query.horizonMonths);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  // Deals is a recommendation feed, not a route inventory. Target the destination
  // in its documented natural-language query; query cannot coexist with trip_length.
  let data: Json = { deals: [] };
  let discoveryFailure: ProviderError | undefined;
  if (!fixedOpenJaw) {
    try {
      data = await requestSerpApi({ ...base, engine: 'google_flights_deals', type: '1', departure_id: query.origin,
        outbound_date: `${startDate},${endDate}`, query: discoveryText(query) }, budget, DISCOVERY_TIMEOUT_MS);
      verifyCurrency(data);
      if (!Array.isArray(data.deals)) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'A busca retornou uma resposta que não conseguimos interpretar. Tente novamente ou consulte uma cidade com datas definidas.', 502);
    } catch (error) {
      // Trying another engine cannot repair an invalid credential, depleted
      // quota or a currency mismatch; do not spend more requests in those cases.
      if (!(error instanceof ProviderError) || ['PROVIDER_AUTH_FAILED', 'PROVIDER_QUOTA_EXCEEDED', 'PROVIDER_INVALID_CURRENCY', 'PROVIDER_SETUP_REQUIRED'].includes(error.code)) throw error;
      discoveryFailure = error;
      data = { deals: [] };
    }
  }
  let discarded = 0;
  const observedAt = new Date().toISOString();
  const candidates = array(data.deals).flatMap((value): Offer[] => {
    const deal = record(value);
    const price = cents(deal.price);
    const outboundDate = dateOnly(deal.start_date || deal.outbound_date);
    const returnDate = dateOnly(deal.end_date || deal.return_date);
    const duration = daysBetween(outboundDate, returnDate);
    const airport = string(deal.arrival_airport_code).toUpperCase();
    if (price === undefined || !outboundDate || !returnDate || outboundDate < startDate || outboundDate > endDate || !Number.isInteger(duration) || duration < query.minDays || duration > query.maxDays || string(deal.departure_airport_code).toUpperCase() !== query.origin || !/^[A-Z]{3}$/.test(airport) || !matchesDestination(deal, query)) { discarded++; return []; }
    return [{ id: randomUUID(), kind: 'flight', title: `${findAirport(query.origin)?.city.split(' (')[0] || query.origin} → ${string(deal.name) || findAirport(airport)?.city || airport}`, price, currency: 'BRL',
      passengers: query.adults, priceBasis: 'unknown', itineraryStatus: 'round-trip-dates',
      flightLegs: [{ direction: 'outbound', segments: [], durationMinutes: positive(deal.flight_duration), stops: nonnegativeInteger(deal.stops) }],
      outboundDate, returnDate, origin: query.origin, arrivalAirport: airport, departureAirport: airport,
      airline: string(deal.airline) || undefined, url: httpsLink(deal.flight_link), details: [`${duration} dias`, `${query.adults} adulto(s) na pesquisa`, 'Chegada e saída pelo mesmo aeroporto; tarifa ainda não confirmada'],
      observedAt, provider: 'SerpApi · Google Flights Deals', confirmed: false }];
  }).sort((a, b) => a.price - b.price);
  let offers = addTripPreviews(candidates, query);
  let queries = fixedOpenJaw ? 0 : 1;
  let combinations = 0;
  if (!offers.length) {
    const samples = sampleQueries(query, start, end);
    combinations = samples.length;
    const attempts = await Promise.allSettled(samples.map(sample => exploreFlight(sample, budget, true)));
    queries += samples.length;
    const failures = attempts.filter(result => result.status === 'rejected');
    offers = attempts.flatMap(result => result.status === 'fulfilled' ? result.value.offers : []).sort((a, b) => a.price - b.price);
    if (!offers.length && failures.length) {
      const reasons = failures.map(result => result.reason).filter((reason): reason is ProviderError => reason instanceof ProviderError);
      const important = reasons.find(reason => ['PROVIDER_AUTH_FAILED', 'PROVIDER_QUOTA_EXCEEDED'].includes(reason.code)) ||
        reasons.find(reason => ['PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR'].includes(reason.code));
      if (important) throw important;
      throw new ProviderError('PROVIDER_SEARCH_FAILED', 'Não conseguimos concluir a consulta de preços. Isso não significa que não existam passagens. Tente novamente em alguns minutos.', 502);
    }
    if (!offers.length && discoveryFailure && !samples.length) throw discoveryFailure;
    if (failures.length) warnings.push('Algumas combinações não puderam ser consultadas. Os preços exibidos correspondem às consultas concluídas.');
    if (samples.length) warnings.push(discoveryFailure ? 'A seleção de promoções estava indisponível. Consultamos diretamente combinações de datas e aeroportos dentro das suas preferências.' : 'Como a seleção de promoções não trouxe opções compatíveis, consultamos combinações de datas e aeroportos dentro das suas preferências.');
  }
  if (query.tripPlan) warnings.push('Foram avaliados no máximo os 20 candidatos aéreos mais baratos da amostra. Somente candidatos com uma prévia geográfica compatível são exibidos. Não é uma busca exaustiva de itinerários ou tarifas multicidade.');
  if (discarded) warnings.push(`${discarded} resultado(s) foram descartados por não comprovar os aeroportos, destino, moeda ou duração solicitados.`);
  if (!offers.length) warnings.push('Nenhuma oferta compatível foi encontrada nesta amostra. A fonte não garante cobertura de todas as datas ou destinos.');
  if (query.allowOpenJaw && !combinations) warnings.push('Nesta seleção, chegada e retorno são pelo mesmo aeroporto. Para comparar cidades diferentes, escolha os aeroportos nas preferências.');
  warnings.push('A janela foi enviada à fonte, mas a cobertura de cada mês e de todas as combinações não é garantida. Esta amostra não alimenta a média histórica nem dispara alertas.');
  return { offers, coverage: { complete: false, queries, requestedHorizonMonths: query.horizonMonths,
    description: combinations ? `Preços consultados em ${combinations} combinações de datas e aeroportos. Não representa todas as datas do período escolhido.` : 'Seleção de preços para as suas preferências. Não representa todas as datas do período escolhido.' }, warnings,
    search: { received: array(data.deals).length, matched: offers.length, sampled: combinations > 0, combinations,
      message: offers.length ? (combinations ? 'Encontramos opções em algumas combinações de datas. Você pode ajustar as preferências para comparar outras.' : 'Preços disponíveis para as preferências escolhidas.')
        : array(data.deals).length ? 'Os preços recebidos não corresponderam às suas preferências. Isso não significa que não existam passagens.' : 'A seleção de promoções e as combinações consultadas não trouxeram preços. Isso não significa que não existam passagens para esse destino.' } };
}

const REGION_SEARCH: Record<string, string> = { 'europe': 'Europe', 'brazil': 'Brazil', 'south-america': 'South America', 'north-america': 'North America', 'central-america': 'Central America and the Caribbean', 'asia': 'Asia', 'africa': 'Africa', 'oceania': 'Oceania', 'anywhere': 'anywhere' };
function discoveryText(query: FlightQuery): string {
  const airport = exactEntry(query) ? findAirport(exactEntry(query)!) : undefined;
  const region = REGIONS.find(item => item.id === query.destination || textKey(item.label) === textKey(query.destination));
  const countries = query.tripPlan ? (query.tripPlan.countryCodes.length ? query.tripPlan.countryCodes.map(code => ({ code })) : countriesInAreas(query.tripPlan.areas)) : query.area ? countriesInAreas([query.area]) : [];
  const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const target = airport ? `${airport.city}, ${airport.country}` : countries.length ? countries.slice(0, 8).map(item => countryNames.of(item.code)).join(' or ') : region ? REGION_SEARCH[region.id] : query.destination;
  return `Flights to ${target}. Trips lasting ${query.minDays} to ${query.maxDays} days.`;
}

/** A bounded fallback, never an exhaustive calendar or a claim of cheapest fare. */
function sampleQueries(query: FlightQuery, start: Date, end: Date): FlightQuery[] {
  const hubs = ['LIS', 'CDG', 'MAD', 'FCO', 'AMS', 'LHR', 'FRA', 'GRU', 'GIG', 'BSB', 'EZE', 'SCL', 'JFK', 'MIA', 'MEX', 'PTY', 'NRT', 'SIN', 'DXB', 'CAI', 'JNB', 'SYD'];
  const explicit = exactEntry(query);
  const accepted = (code: string) => code !== query.origin && matchesDestination({ arrival_airport_code: code }, { ...query, departureAirport: undefined });
  let airports = explicit ? [explicit] : hubs.filter(accepted);
  if (!airports.length) airports = AIRPORTS.filter(airport => accepted(airport.code)).sort((a, b) => query.area ? haversineKm(a, query.area) - haversineKm(b, query.area) : a.code.localeCompare(b.code)).slice(0, 3).map(airport => airport.code);
  const durations = [query.minDays, Math.round((query.minDays + query.maxDays) / 2), query.maxDays];
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return [.1, .45, .8].flatMap((fraction, index): FlightQuery[] => {
    const arrivalAirport = airports[index % airports.length];
    if (!arrivalAirport) return [];
    let departureAirport = query.departureAirport || arrivalAirport;
    if (query.tripPlan && query.allowOpenJaw && !query.departureAirport) {
      const preview = previewTrip(query.tripPlan, arrivalAirport);
      if (preview.status !== 'ready') return [];
      departureAirport = preview.stops.at(-1)!.airportCode;
    }
    const candidate = { ...query, arrivalAirport, departureAirport };
    try { enforceArea(candidate, arrivalAirport, departureAirport); enforceDistance(candidate); } catch { return []; }
    const departure = new Date(start.getTime() + Math.round(span * fraction) * 86_400_000);
    const returning = new Date(departure.getTime() + durations[index] * 86_400_000);
    return [{ ...candidate, departureDate: departure.toISOString().slice(0, 10), returnDate: returning.toISOString().slice(0, 10) }];
  });
}

function addTripPreviews(offers: Offer[], query: FlightQuery): Offer[] {
  const plan = query.tripPlan;
  if (!plan) return offers;
  const cache = new Map<string, ReturnType<typeof previewTrip>>();
  return offers.slice(0, 20).flatMap(offer => {
    if (!offer.arrivalAirport || !offer.departureAirport) return [];
    const key = `${offer.arrivalAirport}:${offer.departureAirport}`;
    const preview = cache.get(key) ?? previewTrip(plan, offer.arrivalAirport, offer.departureAirport);
    cache.set(key, preview);
    if (preview.status !== 'ready') return [];
    return [{ ...offer, confirmed: false, tripPreview: preview, details: [...offer.details, `${plan.countryCount} países na prévia geográfica; deslocamentos internos não incluídos no preço`] }];
  });
}

export async function explore(kind: 'flight' | 'hotel', query: FlightQuery | HotelQuery, options: { budgetMs?: number } = {}): Promise<ExploreResult> {
  if (kind === 'hotel') throw new ProviderError('BOOKING_ADAPTER_PENDING', 'Booking é a fonte escolhida para hotéis. A conexão autenticada e o adaptador de preços ainda precisam ser disponibilizados neste servidor.');
  const budgetMs = Number.isFinite(options.budgetMs) ? Math.max(1, Math.min(SEARCH_BUDGET_MS, options.budgetMs!)) : SEARCH_BUDGET_MS;
  return exploreFlight(query as FlightQuery, { deadline: Date.now() + budgetMs });
}
