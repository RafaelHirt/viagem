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

export interface DestinationRegion {
  id: string
  label: string
  center: { lat: number; lon: number }
  scale: number
  countryCode?: string
  aliases?: readonly string[]
}
const regionPresets: readonly DestinationRegion[] = [
  { id: 'europe', label: 'Europa', center: { lat: 49, lon: 12 }, scale: 3.4 },
  { id: 'brazil', label: 'Brasil', countryCode:'BR', center: { lat: -14, lon: -51 }, scale: 2.5 },
  { id: 'caribbean', label: 'Caribe', aliases:['Caribbean'], center:{lat:18,lon:-74},scale:4 },
  { id: 'brazil-northeast', label: 'Nordeste', center: { lat: -8.5, lon: -41.5 }, scale: 5.4 },
  { id: 'brazil-north', label: 'Norte', center: { lat: -3.5, lon: -59 }, scale: 3.4 },
  { id: 'brazil-southeast', label: 'Sudeste', center: { lat: -20.5, lon: -44.5 }, scale: 6 },
  { id: 'brazil-south', label: 'Sul', center: { lat: -27.5, lon: -51 }, scale: 6.5 },
  { id: 'brazil-central-west', label: 'Centro-Oeste', center: { lat: -15, lon: -54.5 }, scale: 4.3 },
  { id: 'south-america', label: 'América do Sul', center: { lat: -20, lon: -60 }, scale: 1.9 },
  { id: 'north-america', label: 'América do Norte', center: { lat: 41, lon: -100 }, scale: 1.7 },
  { id: 'central-america', label: 'América Central e Caribe', center: { lat: 17, lon: -78 }, scale: 4 },
  { id: 'asia', label: 'Ásia', center: { lat: 31, lon: 96 }, scale: 1.6 },
  { id: 'africa', label: 'África', center: { lat: 1, lon: 21 }, scale: 1.8 },
  { id: 'oceania', label: 'Oceania', center: { lat: -25, lon: 145 }, scale: 1.7 },
  { id: 'anywhere', label: 'Qualquer lugar', center: { lat: 16, lon: 0 }, scale: 1 },
]
const countryAirports = new Map<string, Airport[]>()
for (const airport of AIRPORTS) countryAirports.set(airport.countryCode, [...(countryAirports.get(airport.countryCode) || []), airport])
const countryCameras: Record<string, DestinationRegion['center'] & { scale:number }> = {
  US:{lat:39,lon:-99,scale:2.1}, CA:{lat:56,lon:-104,scale:1.8}, MX:{lat:23,lon:-102,scale:3.5},
}
const englishCountries = new Intl.DisplayNames(['en'], { type:'region' })
const countryRegions: DestinationRegion[] = [...countryAirports].filter(([code])=>code!=='BR').map(([code,airports])=>{
  const lat=airports.reduce((sum,airport)=>sum+airport.lat,0)/airports.length
  const x=airports.reduce((sum,airport)=>sum+Math.cos(airport.lon*Math.PI/180),0)
  const y=airports.reduce((sum,airport)=>sum+Math.sin(airport.lon*Math.PI/180),0)
  const lon=Math.atan2(y,x)*180/Math.PI
  const span=Math.max(...airports.map(airport=>Math.abs(((airport.lon-lon+540)%360)-180)),...airports.map(airport=>Math.abs(airport.lat-lat)*1.5))*2
  return { id:`country-${code.toLowerCase()}`,label:airports[0].country,countryCode:code,
    aliases:[englishCountries.of(code)||'',...(code==='US'?['EUA','USA','Estados Unidos da América']:[])],
    center:countryCameras[code]||{lat,lon},scale:countryCameras[code]?.scale||Math.max(.9,Math.min(10,160/(span+15))) }
}).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'))
/** Destinations are geographic filters; map cameras do not define their membership. */
export const REGIONS: readonly DestinationRegion[] = [...regionPresets,...countryRegions]

export function findAirport(code: string): Airport | undefined {
  return byCode.get(code.trim().toUpperCase())
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export function findRegion(value:string): DestinationRegion | undefined {
  const query=normalize(value)
  if(!query)return undefined
  return REGIONS.find(region=>region.id===query||normalize(region.label)===query) || REGIONS.find(region=>region.aliases?.some(alias=>normalize(alias)===query))
}
export function searchRegions(value:string): DestinationRegion[] {
  const query=normalize(value)
  if(!query)return []
  const exact=findRegion(value)?.id
  return REGIONS.filter(region=>[region.label,...(region.aliases||[])].some(label=>normalize(label).includes(query)))
    .sort((a,b)=>Number(exact===b.id)-Number(exact===a.id)||a.label.localeCompare(b.label,'pt-BR'))
}
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

const caribbeanIslands = new Set(['AI','AG','AW','BS','BB','BQ','VG','KY','CU','CW','DM','DO','GD','GP','HT','JM','MQ','MS','PR','BL','KN','LC','MF','VC','SX','TT','TC','VI'])
const centralAmerica = new Set(['BZ', 'CR', 'SV', 'GT', 'HN', 'NI', 'PA', ...caribbeanIslands])

// IBGE macro-regions, matched to the catalogue's ISO 3166-2 state codes.
// Camera centres above only affect the map; they never define regional membership.
const brazilStatesByRegion: Record<string, readonly string[]> = {
  'brazil-northeast': ['BR-AL', 'BR-BA', 'BR-CE', 'BR-MA', 'BR-PB', 'BR-PE', 'BR-PI', 'BR-RN', 'BR-SE'],
  'brazil-north': ['BR-AC', 'BR-AP', 'BR-AM', 'BR-PA', 'BR-RO', 'BR-RR', 'BR-TO'],
  'brazil-southeast': ['BR-ES', 'BR-MG', 'BR-RJ', 'BR-SP'],
  'brazil-south': ['BR-PR', 'BR-RS', 'BR-SC'],
  'brazil-central-west': ['BR-DF', 'BR-GO', 'BR-MT', 'BR-MS'],
}

export function matchesRegion(airport: Airport, region: string): boolean {
  const destination=findRegion(region)
  const id=destination?.id
  if(destination?.countryCode)return airport.countryCode===destination.countryCode
  if (id && brazilStatesByRegion[id]) {
    return airport.countryCode === 'BR' && brazilStatesByRegion[id].includes(airport.region)
  }
  switch (id) {
    case 'caribbean': return caribbeanIslands.has(airport.countryCode) || (airport.countryCode==='MX' && airport.region==='MX-ROO') || (airport.countryCode==='CO' && airport.region==='CO-SAP')
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
