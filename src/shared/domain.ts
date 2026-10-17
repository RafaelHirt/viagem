import type { FlightQuery, GeoArea, HotelQuery, Monitor, Observation, TripPlan } from './types.ts'
import { AIRPORTS, findAirport } from './airports.ts'
export { AIRPORTS, findAirport } from './airports.ts'
export type { Airport } from './airports.ts'

export interface Coordinates {
  lat: number
  lon: number
}

export function parseIata(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value.trim().toUpperCase())) {
    throw new Error('Informe o código IATA do aeroporto com três letras, como GRU.')
  }
  return value.trim().toUpperCase()
}

/** Straight-line distance, not travel time or the cost of ground transport. */
export function haversineKm(first: Coordinates, second: Coordinates): number {
  for (const point of [first, second]) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
      Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
      throw new Error('Coordenadas do aeroporto inválidas.')
    }
  }
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDifference = radians(second.lat - first.lat)
  const longitudeDifference = radians(second.lon - first.lon)
  const term = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) *
    Math.sin(longitudeDifference / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, term)), Math.sqrt(Math.max(0, 1 - term)))
}

export interface Baseline {
  mean: number | null
  validDays: number
  windowDays: number
}

/**
 * One minimum per complete calendar day, excluding today in the monitor's zone.
 * Repeated polls do not give a day more weight. Missing days are not zero fares.
 */
export function getBaseline(
  observations: readonly Observation[],
  windowDays: number,
  now: Date | string | number = new Date(),
  timezone = 'America/Sao_Paulo',
): Baseline {
  const empty = { mean: null, validDays: 0, windowDays }
  if (!Number.isSafeInteger(windowDays) || windowDays < 1) return empty
  const current = new Date(now)
  if (!Number.isFinite(current.getTime())) return empty
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const localDay = (date: Date): number => {
    const parts = formatter.formatToParts(date)
    const part = (name: string) => Number(parts.find((item) => item.type === name)?.value)
    return Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000
  }
  const today = localDay(current)
  const minima = new Map<number, number>()
  for (const observation of observations) {
    if (!observation || observation.complete !== true || observation.currency !== 'BRL' ||
      !Number.isSafeInteger(observation.price) || observation.price <= 0 ||
      typeof observation.observedAt !== 'string') continue
    const timestamp = new Date(observation.observedAt)
    if (!Number.isFinite(timestamp.getTime())) continue
    const day = localDay(timestamp)
    if (day >= today || day < today - windowDays) continue
    minima.set(day, Math.min(minima.get(day) ?? Infinity, observation.price))
  }
  const prices = [...minima.values()]
  if (!prices.length) return empty
  // Running mean avoids overflowing an integer sum for a long history.
  const mean = prices.reduce((average, price, index) => average + (price - average) / (index + 1), 0)
  return { mean: Math.round(mean), validDays: prices.length, windowDays }
}

/** Positive means cheaper than the baseline; negative means more expensive. */
export function getPriceDrop(currentCents: number, baselineMean: number | null): number | null {
  if (!Number.isSafeInteger(currentCents) || currentCents <= 0 || baselineMean === null ||
    !Number.isSafeInteger(baselineMean) || baselineMean <= 0) return null
  return Math.round(((baselineMean - currentCents) / baselineMean) * 10_000) / 100
}

type RecordValue = Record<string, unknown>

function object(value: unknown, message: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as RecordValue
}

function text(value: unknown, label: string, maxLength = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`Informe ${label} com até ${maxLength} caracteres.`)
  }
  return value.trim()
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} deve ser um número inteiro entre ${minimum} e ${maximum}.`)
  }
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Informe ${label}.`)
  return value
}

function optionalDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} deve usar o formato AAAA-MM-DD.`)
  }
  const timestamp = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} é inválida.`)
  }
  return value
}

function dates(first: string | undefined, second: string | undefined): void {
  if (Boolean(first) !== Boolean(second)) throw new Error('Informe as duas datas ou deixe ambas livres.')
  if (first && second && first >= second) throw new Error('A data final deve ser posterior à data inicial.')
}

function optionalIata(value: unknown): string | undefined {
  return value === undefined || value === '' ? undefined : parseIata(value)
}

function optionalArea(value: unknown): GeoArea | undefined {
  if (value === undefined) return undefined
  const area = object(value, 'Escolha uma área válida no mapa.')
  if (typeof area.lat !== 'number' || !Number.isFinite(area.lat) || Math.abs(area.lat) > 90 ||
    typeof area.lon !== 'number' || !Number.isFinite(area.lon) || Math.abs(area.lon) > 180 ||
    typeof area.radiusKm !== 'number' || !Number.isFinite(area.radiusKm) ||
    area.radiusKm <= 0 || area.radiusKm > 20_050) {
    throw new Error('A área do mapa deve ter coordenadas válidas e raio maior que zero e até 20.050 km.')
  }
  return { lat: area.lat, lon: area.lon, radiusKm: area.radiusKm,
    ...(area.label === undefined ? {} : { label: text(area.label, 'um nome para a área', 120) }) }
}

function optionalTripPlan(value: unknown): TripPlan | undefined {
  if (value === undefined) return undefined
  const plan = object(value, 'Informe um roteiro válido.')
  if (!Array.isArray(plan.areas) || plan.areas.length < 1 || plan.areas.length > 5) throw new Error('Marque de uma a cinco áreas no roteiro.')
  const areas = plan.areas.map(area => { const parsed = optionalArea(area); if (!parsed) throw new Error('Área do roteiro inválida.'); return parsed })
  const countryCount = integer(plan.countryCount, 'A quantidade de países', 2, 5)
  if (areas.length > countryCount) throw new Error('Use no máximo uma área por país desejado; uma área pode abranger vários países.')
  const knownCountries = new Set(AIRPORTS.map(airport => airport.countryCode))
  if (!Array.isArray(plan.countryCodes) || plan.countryCodes.length > countryCount || plan.countryCodes.some(code => typeof code !== 'string' || !knownCountries.has(code)) || new Set(plan.countryCodes).size !== plan.countryCodes.length) throw new Error('Escolha países válidos e diferentes para o roteiro.')
  if (!['train', 'car', 'flight'].includes(plan.transport as string)) throw new Error('Escolha trem, carro ou avião para os deslocamentos.')
  if (typeof plan.maxLegHours !== 'number' || !Number.isFinite(plan.maxLegHours) || plan.maxLegHours < 1 || plan.maxLegHours > 48) throw new Error('O limite por trecho deve estar entre 1 e 48 horas.')
  const flexibleOrder = boolean(plan.flexibleOrder, 'se a ordem dos países é livre')
  if (!flexibleOrder && plan.countryCodes.length !== countryCount) throw new Error('Escolha todos os países para fixar a ordem do roteiro.')
  return { countryCount, areas, countryCodes: [...plan.countryCodes] as string[], transport: plan.transport as TripPlan['transport'], maxLegHours: plan.maxLegHours, flexibleOrder }
}

function flightQuery(value: unknown): FlightQuery {
  const query = object(value, 'Informe os critérios da viagem.')
  const minDays = integer(query.minDays, 'A duração mínima', 1, 365)
  const maxDays = integer(query.maxDays, 'A duração máxima', 1, 365)
  if (minDays > maxDays) throw new Error('A duração mínima não pode superar a máxima.')
  const departureDate = optionalDate(query.departureDate, 'A data de ida')
  const returnDate = optionalDate(query.returnDate, 'A data de volta')
  dates(departureDate, returnDate)
  const allowOpenJaw = boolean(query.allowOpenJaw, 'se permite aeroportos diferentes na chegada e na saída')
  const arrivalAirport = optionalIata(query.arrivalAirport)
  const departureAirport = optionalIata(query.departureAirport)
  if (!allowOpenJaw && arrivalAirport && departureAirport && arrivalAirport !== departureAirport) {
    throw new Error('Ative aeroportos diferentes para chegar e sair por locais distintos.')
  }
  let maxAirportDistanceKm: number | undefined
  if (query.maxAirportDistanceKm !== undefined) {
    if (typeof query.maxAirportDistanceKm !== 'number' || !Number.isFinite(query.maxAirportDistanceKm) ||
      query.maxAirportDistanceKm <= 0 || query.maxAirportDistanceKm > 20_050) {
      throw new Error('A distância máxima entre aeroportos deve ser maior que zero e até 20.050 km.')
    }
    maxAirportDistanceKm = query.maxAirportDistanceKm
  }
  if (maxAirportDistanceKm !== undefined && arrivalAirport && departureAirport) {
    const arrival = findAirport(arrivalAirport)
    const departure = findAirport(departureAirport)
    if (arrival && departure && haversineKm(arrival, departure) > maxAirportDistanceKm) {
      throw new Error('Os aeroportos escolhidos excedem a distância máxima informada.')
    }
  }
  const area = optionalArea(query.area)
  const tripPlan = optionalTripPlan(query.tripPlan)
  if (area && tripPlan) throw new Error('Escolha uma área simples ou um roteiro com vários países.')
  return {
    origin: parseIata(query.origin),
    destination: text(query.destination, 'um destino ou região'),
    arrivalAirport, departureAirport, departureDate, returnDate,
    minDays, maxDays,
    horizonMonths: integer(query.horizonMonths, 'O horizonte da pesquisa', 1, 12),
    maxAirportDistanceKm,
    adults: integer(query.adults, 'A quantidade de adultos', 1, 9),
    allowOpenJaw,
    area, tripPlan,
  }
}

function hotelQuery(value: unknown): HotelQuery {
  const query = object(value, 'Informe os critérios da hospedagem.')
  const checkIn = optionalDate(query.checkIn, 'A data de entrada')
  const checkOut = optionalDate(query.checkOut, 'A data de saída')
  dates(checkIn, checkOut)
  if (query.pattern !== 'weekend' && query.pattern !== 'weekdays' && query.pattern !== 'both') {
    throw new Error('Escolha fins de semana, dias de semana ou ambos para a hospedagem.')
  }
  return {
    property: text(query.property, 'o hotel'),
    propertyId: query.propertyId === undefined || query.propertyId === ''
      ? undefined : text(query.propertyId, 'o identificador do hotel', 200),
    propertyVerified: query.propertyVerified === undefined ? undefined
      : boolean(query.propertyVerified, 'se o hotel foi encontrado no Booking'),
    checkIn, checkOut,
    pattern: query.pattern,
    adults: integer(query.adults, 'A quantidade de adultos', 1, 30),
    horizonMonths: query.horizonMonths === undefined ? undefined
      : integer(query.horizonMonths, 'O horizonte da pesquisa', 1, 12),
  }
}

/** Validate untrusted API input and return only the supported fields. */
export function validateMonitor(input: unknown): Monitor {
  const monitor = object(input, 'Monitor inválido.')
  if (monitor.kind !== 'flight' && monitor.kind !== 'hotel') throw new Error('Tipo de monitor inválido.')
  const id = text(monitor.id, 'o identificador do monitor', 100)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Identificador do monitor inválido.')
  const rule = object(monitor.rule, 'Informe a regra do alerta.')
  if (typeof rule.dropPercent !== 'number' || !Number.isFinite(rule.dropPercent) ||
    rule.dropPercent <= 0 || rule.dropPercent >= 100) {
    throw new Error('A queda percentual deve ser maior que zero e menor que 100%.')
  }
  const channels = object(monitor.channels, 'Informe os canais de alerta.')
  const email = channels.email === undefined || channels.email === '' ? undefined
    : text(channels.email, 'um e-mail', 254)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.')
  const createdAt = text(monitor.createdAt, 'a data de criação', 40)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('A data de criação do monitor é inválida.')
  }
  return {
    id,
    kind: monitor.kind,
    name: text(monitor.name, 'um nome para o monitor'),
    query: monitor.kind === 'flight' ? flightQuery(monitor.query) : hotelQuery(monitor.query),
    rule: {
      dropPercent: rule.dropPercent,
      windowDays: integer(rule.windowDays, 'A janela do histórico', 1, 3650),
    },
    channels: { email, telegram: boolean(channels.telegram, 'se deseja receber pelo Telegram') },
    enabled: boolean(monitor.enabled, 'se o monitor está ativo'),
    createdAt,
  }
}
