import records from './airports.json'
import type { GeoArea } from './types.ts'

export interface Airport {
  code: string
  name: string
  city: string
  country: string
  countryCode: string
  continent: string
  region: string
  lat: number
  lon: number
}

/** OurAirports scheduled-service snapshot; catalogue entries do not imply live fare coverage. */
// Display the city served where a municipality name would confuse travellers.
const servedCities: Record<string, { city: string; name?: string }> = {
  MXP: { city: 'Milão', name: 'Milão–Malpensa' }, LIN: { city: 'Milão', name: 'Milão–Linate' }, BGY: { city: 'Bérgamo / Milão' },
  LIS: { city: 'Lisboa' }, MAD: { city: 'Madri' }, AMS: { city: 'Amsterdã' }, BRU: { city: 'Bruxelas' },
}
export const AIRPORTS: readonly Airport[] = records.map(airport => ({ ...airport, ...servedCities[airport.code] }))
const byCode = new Map(AIRPORTS.map((airport) => [airport.code, airport]))

export const REGIONS = [
  { id: 'europe', label: 'Europa', center: { lat: 49, lon: 12 }, scale: 3.4 },
  { id: 'brazil', label: 'Brasil', center: { lat: -14, lon: -51 }, scale: 2.5 },
  { id: 'south-america', label: 'América do Sul', center: { lat: -20, lon: -60 }, scale: 1.9 },
  { id: 'north-america', label: 'América do Norte', center: { lat: 41, lon: -100 }, scale: 1.7 },
  { id: 'central-america', label: 'América Central e Caribe', center: { lat: 17, lon: -78 }, scale: 4 },
  { id: 'asia', label: 'Ásia', center: { lat: 31, lon: 96 }, scale: 1.6 },
  { id: 'africa', label: 'África', center: { lat: 1, lon: 21 }, scale: 1.8 },
  { id: 'oceania', label: 'Oceania', center: { lat: -25, lon: 145 }, scale: 1.7 },
  { id: 'anywhere', label: 'Qualquer lugar', center: { lat: 16, lon: 0 }, scale: 1 },
] as const

export function findAirport(code: string): Airport | undefined {
  return byCode.get(code.trim().toUpperCase())
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const aliases: Record<string, string> = {
  GRU: 'São Paulo Guarulhos Cumbica', VCP: 'Campinas Viracopos São Paulo', CGH: 'São Paulo Congonhas',
  GYN: 'Goiânia Santa Genoveva', GIG: 'Rio de Janeiro Galeão', CNF: 'Belo Horizonte Confins',
  LIS: 'Lisboa', OPO: 'Porto', MAD: 'Madri', FCO: 'Roma Fiumicino', CIA: 'Roma Ciampino',
  MXP: 'Milão Malpensa', LIN: 'Milão Linate', BGY: 'Milão Bérgamo', VCE: 'Veneza',
  LHR: 'Londres Heathrow', LGW: 'Londres Gatwick', STN: 'Londres Stansted', LTN: 'Londres Luton',
  LCY: 'Londres City', AMS: 'Amsterdã Amsterdão', BRU: 'Bruxelas', BER: 'Berlim',
  MUC: 'Munique', ZRH: 'Zurique', GVA: 'Genebra', VIE: 'Viena', PRG: 'Praga',
  WAW: 'Varsóvia', CPH: 'Copenhague', ARN: 'Estocolmo', ATH: 'Atenas',
  JFK: 'Nova York New York', LGA: 'Nova York New York', EWR: 'Nova York Newark',
  PEK: 'Pequim', PKX: 'Pequim', NRT: 'Tóquio', HND: 'Tóquio', SCL: 'Santiago',
}
const indexed = AIRPORTS.map((airport) => ({
  airport,
  city: normalize(airport.city),
  alias: normalize(aliases[airport.code] ?? ''),
  haystack: normalize(`${airport.code} ${airport.city} ${airport.name} ${airport.country} ${aliases[airport.code] ?? ''}`),
}))

/** Search names/cities in Portuguese or IATA without requiring the traveller to know a code. */
export function searchAirports(text: string, limit = 8): Airport[] {
  const query = normalize(text)
  if (!query || !Number.isFinite(limit) || limit <= 0) return []
  const words = query.split(/\s+/)
  return indexed.flatMap((item) => {
    if (!words.every((word) => item.haystack.includes(word))) return []
    const score = item.airport.code.toLowerCase() === query ? 0
      : item.city === query || item.alias === query ? 1
        : item.city.startsWith(query) || item.alias.startsWith(query) ? 2
          : item.airport.code.toLowerCase().startsWith(query) ? 3 : 4
    return [{ airport: item.airport, score }]
  }).sort((a, b) => a.score - b.score || a.airport.city.localeCompare(b.airport.city, 'pt-BR') ||
    a.airport.code.localeCompare(b.airport.code)).slice(0, Math.floor(limit)).map(({ airport }) => airport)
}

export function labelAirport(code: string): string {
  const airport = findAirport(code)
  return airport ? `${airport.city} · ${airport.name} (${airport.code}) — ${airport.country}` : code
}

export function shortAirportLabel(code: string): string {
  const airport = findAirport(code)
  return airport ? `${code.toUpperCase() === 'MXP' ? 'Milão–Malpensa' : airport.city.split(' (')[0]} (${airport.code})` : code
}

const centralAmerica = new Set(['BZ', 'CR', 'SV', 'GT', 'HN', 'NI', 'PA', 'AI', 'AG', 'AW', 'BS', 'BB',
  'BQ', 'VG', 'KY', 'CU', 'CW', 'DM', 'DO', 'GD', 'GP', 'HT', 'JM', 'MQ', 'MS', 'PR', 'BL', 'KN',
  'LC', 'MF', 'VC', 'SX', 'TT', 'TC', 'VI'])

export function matchesRegion(airport: Airport, region: string): boolean {
  const value = normalize(region)
  const id = REGIONS.find((item) => item.id === value || normalize(item.label) === value)?.id
  switch (id) {
    case 'anywhere': return true
    case 'brazil': return airport.countryCode === 'BR'
    case 'europe': return airport.continent === 'EU'
    case 'south-america': return airport.continent === 'SA'
    case 'north-america': return airport.continent === 'NA' && !centralAmerica.has(airport.countryCode)
    case 'central-america': return centralAmerica.has(airport.countryCode)
    case 'asia': return airport.continent === 'AS'
    case 'africa': return airport.continent === 'AF'
    case 'oceania': return airport.continent === 'OC'
    default: return false
  }
}

export function isAirportInArea(airport: Airport, area: GeoArea): boolean {
  if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon) || !Number.isFinite(area.radiusKm) ||
    Math.abs(area.lat) > 90 || Math.abs(area.lon) > 180 || area.radiusKm <= 0 ||
    !Number.isFinite(airport.lat) || !Number.isFinite(airport.lon) ||
    Math.abs(airport.lat) > 90 || Math.abs(airport.lon) > 180) return false
  const radians = (degrees: number) => degrees * Math.PI / 180
  const term = Math.sin(radians(airport.lat - area.lat) / 2) ** 2 +
    Math.cos(radians(area.lat)) * Math.cos(radians(airport.lat)) *
    Math.sin(radians(airport.lon - area.lon) / 2) ** 2
  const distance = 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, term)), Math.sqrt(Math.max(0, 1 - term)))
  return distance <= area.radiusKm
}
