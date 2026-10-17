import { AIRPORTS, findAirport, isAirportInArea, type Airport } from './airports'
import { railTripOptions } from './rail-network'
import type { GeoArea, TravelMode, TripLeg, TripPlan, TripPreview, TripStop } from './types'

export const TRAVEL_MODES: Record<TravelMode, string> = { train: 'Trem', car: 'Carro', flight: 'Avião' }
export const DEFAULT_TRIP: TripPlan = { countryCount: 3, areas: [], countryCodes: [], transport: 'train', maxLegHours: 6, flexibleOrder: true }
export function withTripStart(plan: TripPlan, code: string): TripPlan {
  const airport = findAirport(code)
  if (!airport) return { ...plan, startAirport: undefined }
  return { ...plan, startAirport: airport.code,
    areas: [{ lat: airport.lat, lon: airport.lon, radiusKm: plan.areas[0]?.radiusKm ?? 800 }, ...plan.areas.slice(1)],
    countryCodes: [airport.countryCode, ...plan.countryCodes.filter(country => country !== airport.countryCode)].slice(0, plan.countryCount),
    flexibleOrder: plan.countryCodes[0] === airport.countryCode ? plan.flexibleOrder : true }
}
export function withRequiredCity(plan: TripPlan, code: string): TripPlan {
  const airport = findAirport(code)
  if (!airport) return { ...plan, requiredAirport: undefined, startAirport: undefined }
  return { ...plan, startAirport: undefined, requiredAirport: airport.code, areas: [{ lat: airport.lat, lon: airport.lon, radiusKm: plan.areas[0]?.radiusKm ?? 800 }, ...plan.areas.slice(1)] }
}
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => d * Math.PI / 180
  const term = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, term)), Math.sqrt(Math.max(0, 1 - term)))
}

/** A planning model, NOT a routing engine, timetable, service or fare lookup. */
export function estimateLeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }, mode: TravelMode): TripLeg {
  const km = distanceKm(a, b)
  const bounds = mode === 'car' ? [km * 1.15 / 95 + .25, km * 1.55 / 65 + .75]
    : mode === 'train' ? [km * 1.15 / 180 + .5, km * 1.6 / 90 + 1]
      : [km / 800 + 3, km / 500 + 5]
  return { distanceKm: Math.round(km), minMinutes: Math.ceil(bounds[0] * 12) * 5, maxMinutes: Math.ceil(bounds[1] * 12) * 5 }
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return hours ? `${hours}h${rest ? String(rest).padStart(2, '0') : ''}` : `${rest}min`
}
export function formatLeg(leg: TripLeg): string { return `≈ ${formatMinutes(leg.minMinutes)}–${formatMinutes(leg.maxMinutes)}` }
export function airportInTrip(airport: Airport, plan: TripPlan): boolean { return plan.areas.some(area => isAirportInArea(airport, area)) }
export function countriesInAreas(areas: GeoArea[]): { code: string; name: string }[] {
  const countries = new Map<string, string>()
  for (const airport of AIRPORTS) if (areas.some(area => isAirportInArea(airport, area))) countries.set(airport.countryCode, airport.country)
  return [...countries].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

const CITY_NAMES: Record<string, string> = { CDG: 'Paris', ORY: 'Paris', BRU: 'Bruxelas', AMS: 'Amsterdã', LHR: 'Londres', LGW: 'Londres', MAD: 'Madri', LIS: 'Lisboa', FCO: 'Roma', VIE: 'Viena', BER: 'Berlim' }
const stop = (airport: Airport): TripStop => ({ airportCode: airport.code, city: CITY_NAMES[airport.code] || airport.city, country: airport.country, countryCode: airport.countryCode, lat: airport.lat, lon: airport.lon })
interface Path { airports: Airport[]; countries: Set<string>; covered: number; score: number }
const BEAM_WIDTH = 96

/** Bounded geographic preview; neither exhaustive nor an optimization of trip cost. */
export function previewTrip(plan: TripPlan, entryCode?: string, exitCode?: string): TripPreview {
  const fail = (status: TripPreview['status'], message: string): TripPreview => ({ status, message, stops: [], legs: [], countryCount: 0, transport: plan.transport })
  if (plan.transport === 'train' && (plan.requiredAirport || plan.startAirport || plan.areas.some(area => area.lat > 30 && area.lat < 72 && area.lon > -25 && area.lon < 45))) {
    if (!plan.areas.length) return fail('empty', 'Marque a área para explorar as cidades do roteiro.')
    return railTripOptions(plan, entryCode, exitCode, 1)[0] || fail('no-route', 'Não encontramos uma sequência na rede de referência com estes países, áreas e tempo por trecho. Ajuste o limite ou as áreas; isso não comprova ausência de trens reais.')
  }
  if (!plan.areas.length) return fail('empty', 'Marque uma ou mais áreas para descobrir os países e visualizar um roteiro.')
  const available = AIRPORTS.filter(airport => airportInTrip(airport, plan))
  const countries = new Set(available.map(airport => airport.countryCode))
  if (countries.size < plan.countryCount || plan.countryCodes.some(code => !countries.has(code))) return fail('insufficient-countries', `As áreas precisam conter ${plan.countryCount} países diferentes e todos os países marcados. Amplie as bolhas ou adicione outra área.`)
  if (plan.startAirport && entryCode && plan.startAirport !== entryCode) return fail('no-route', 'Esta oferta não chega pela primeira cidade escolhida para o roteiro.')
  entryCode = entryCode || plan.startAirport
  const entry = entryCode ? findAirport(entryCode) : undefined
  const exit = exitCode ? findAirport(exitCode) : undefined
  if ((entryCode && (!entry || !airportInTrip(entry, plan))) || (exitCode && (!exit || !airportInTrip(exit, plan)))) return fail('no-route', 'Os aeroportos de chegada e retorno precisam estar nas áreas do roteiro.')
  const fixed = !plan.flexibleOrder && plan.countryCodes.length === plan.countryCount
  const sameCountryReturn = entry && exit && entry.countryCode === exit.countryCode
  if (fixed && entry && entry.countryCode !== plan.countryCodes[0]) return fail('no-route', 'A chegada não corresponde ao primeiro país da ordem escolhida.')

  // Up to one reference airport per country/area, plus the actual fare's ends.
  // This bounds work without claiming that all cities or routes were searched.
  const nearest = new Map<string, Airport>()
  for (const airport of available) plan.areas.forEach((area, index) => {
    if (!isAirportInArea(airport, area)) return
    const key = `${airport.countryCode}:${index}`, previous = nearest.get(key)
    if (!previous || distanceKm(airport, area) < distanceKm(previous, area)) nearest.set(key, airport)
  })
  const requiredCity = plan.requiredAirport ? findAirport(plan.requiredAirport) : undefined
  let nodes = [...new Map([...nearest.values(), ...(requiredCity ? [requiredCity] : []), ...(entry ? [entry] : []), ...(exit ? [exit] : [])].map(airport => [airport.code, airport])).values()]
  const mandatory = new Set([...(requiredCity ? [requiredCity.countryCode] : []), ...plan.countryCodes, ...(exit ? [exit.countryCode] : [])])
  const allowedCountries = [...countries].sort((a, b) => Number(mandatory.has(b)) - Number(mandatory.has(a)) ||
    Math.min(...nodes.filter(n => n.countryCode === a).map(n => Math.min(...plan.areas.map(area => distanceKm(n, area))))) -
    Math.min(...nodes.filter(n => n.countryCode === b).map(n => Math.min(...plan.areas.map(area => distanceKm(n, area)))))).slice(0, 24)
  if (entry && !allowedCountries.includes(entry.countryCode)) allowedCountries.push(entry.countryCode)
  nodes = nodes.filter(node => allowedCountries.includes(node.countryCode) && (!fixed || plan.countryCodes.includes(node.countryCode)))
  const covered = (airport: Airport) => plan.areas.reduce((mask, area, index) => isAirportInArea(airport, area) ? mask | (1 << index) : mask, 0)
  const fullMask = (1 << plan.areas.length) - 1
  const withinLimit = (a: Airport, b: Airport) => estimateLeg(a, b, plan.transport).maxMinutes <= plan.maxLegHours * 60
  let paths: Path[] = (entry ? [entry] : nodes.filter(node => !fixed || node.countryCode === plan.countryCodes[0]))
    .map(airport => ({ airports: [airport], countries: new Set([airport.countryCode]), covered: covered(airport), score: 0 }))
  for (let depth = 1; depth < plan.countryCount; depth++) {
    const next: Path[] = []
    for (const path of paths) for (const node of nodes) {
      if (path.countries.has(node.countryCode) || (fixed && node.countryCode !== plan.countryCodes[depth])) continue
      if (exit && !sameCountryReturn && (depth === plan.countryCount - 1 ? node.code !== exit.code : node.countryCode === exit.countryCode)) continue
      const previous = path.airports.at(-1)!
      if (!withinLimit(previous, node)) continue
      const visited = new Set([...path.countries, node.countryCode])
      if ([...mandatory].filter(code => !visited.has(code)).length > plan.countryCount - depth - 1) continue
      next.push({ airports: [...path.airports, node], countries: visited, covered: path.covered | covered(node), score: path.score + distanceKm(previous, node) })
    }
    // Prefer covering all marked areas before minimizing straight-line distance.
    paths = next.sort((a, b) => bitCount(b.covered) - bitCount(a.covered) || a.score - b.score).slice(0, BEAM_WIDTH)
    if (!paths.length) break
  }
  const valid = paths.filter(path => (!requiredCity || path.airports.includes(requiredCity)) && path.countries.size === plan.countryCount && path.covered === fullMask && [...mandatory].every(code => path.countries.has(code)) &&
    (!exit || !sameCountryReturn || withinLimit(path.airports.at(-1)!, exit)))
    .sort((a, b) => a.score + (sameCountryReturn && exit ? distanceKm(a.airports.at(-1)!, exit) : 0) - b.score - (sameCountryReturn && exit ? distanceKm(b.airports.at(-1)!, exit) : 0))
  const best = valid[0]
  if (!best) return fail('no-route', 'Nenhuma combinação encontrada nesta prévia com o limite de tempo e os países escolhidos. Amplie o tempo por trecho, libere a ordem ou ajuste as áreas. Isso não comprova ausência de rotas reais.')
  const itinerary = [...best.airports, ...(sameCountryReturn && exit ? [exit] : [])]
  return { status: 'ready', transport: plan.transport, stops: itinerary.map(stop), legs: itinerary.slice(1).map((node, index) => estimateLeg(itinerary[index], node, plan.transport)), countryCount: best.countries.size,
    message: 'Prévia geográfica com cidades de referência. Tempos estimados por distância; serviços, conexões e preços internos não foram consultados.' }
}
function bitCount(value: number): number { let count = 0; while (value) { count += value & 1; value >>>= 1 } return count }
