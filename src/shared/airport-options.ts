import { AIRPORTS, findAirport, searchAirports, shortAirportLabel, type Airport } from './airports'
import type { FlightQuery } from './types'

export interface AirportCity { name:string; codes:string[] }
const METROS: AirportCity[] = [
  { name: 'Rio de Janeiro', codes: ['GIG', 'SDU'] }, { name: 'Paris', codes: ['CDG', 'ORY', 'BVA'] },
  { name: 'São Paulo e Campinas', codes: ['GRU', 'CGH', 'VCP'] }, { name: 'Milão', codes: ['MXP', 'LIN', 'BGY'] },
  { name: 'Londres', codes: ['LHR', 'LGW', 'LCY', 'STN', 'LTN', 'SEN'] }, { name: 'Roma', codes: ['FCO', 'CIA'] },
  { name: 'Nova York', codes: ['JFK', 'LGA', 'EWR'] }, { name: 'Tóquio', codes: ['NRT', 'HND'] },
  { name: 'Denver', codes: ['DEN', 'BJC'] }, { name: 'Orlando', codes: ['MCO', 'SFB'] },
  { name: 'Miami', codes: ['MIA', 'OPF'] }, { name:'Dallas', codes:['DFW','DAL'] },
  { name:'Washington', codes:['IAD','DCA'] }, { name:'Pequim', codes:['PEK','PKX'] },
  { name:'Bangkok', codes:['BKK','DMK'] }, { name:'Seul', codes:['ICN','GMP'] },
  { name:'Istambul', codes:['IST','SAW'] }, { name:'Taipei', codes:['TPE','TSA'] },
  { name:'Jacarta', codes:['CGK','HLP'] }, { name:'Moscou', codes:['SVO','DME','VKO','ZIA'] },
  { name:'Frankfurt', codes:['FRA','HHN'] }, { name:'Veneza', codes:['VCE','TSF'] },
  { name:'Bruxelas', codes:['BRU','CRL'] },
]
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase()
const cityKey=(airport:Airport)=>`${airport.countryCode}:${airport.region}:${normalize(airport.city.split(' (')[0])}`
const cityByCode=new Map<string,AirportCity>()
const byMunicipality=new Map<string,Airport[]>()
for(const airport of AIRPORTS){const key=cityKey(airport);const group=byMunicipality.get(key)||[];group.push(airport);byMunicipality.set(key,group)}
// Explicit served-city links bridge municipalities (e.g. Narita/Tokyo). Every
// other city is grouped from the catalogue, with country/state kept separate.
for(const metro of METROS){
  const known=metro.codes.filter(code=>findAirport(code))
  const keys=new Set(known.map(code=>cityKey(findAirport(code)!)))
  const extras=AIRPORTS.filter(airport=>keys.has(cityKey(airport))&&!known.includes(airport.code)).map(airport=>airport.code)
  const city={name:metro.name,codes:[...known,...extras]}
  for(const code of city.codes)cityByCode.set(code,city)
}
for(const airports of byMunicipality.values()){
  if(airports.every(airport=>cityByCode.has(airport.code)))continue
  // Prefer an international airport over an executive field when choosing an
  // internal representative; all associated codes are still sent together.
  const score=(airport:Airport)=>/executive|heliport|seaplane/i.test(airport.name)?2:/international/i.test(airport.name)?0:1
  const sorted=[...airports].sort((a,b)=>score(a)-score(b)||a.code.localeCompare(b.code))
  const city={name:sorted[0].city.split(' (')[0],codes:sorted.map(airport=>airport.code)}
  for(const airport of airports)if(!cityByCode.has(airport.code))cityByCode.set(airport.code,city)
}
export function airportCity(code:string):AirportCity|undefined{return cityByCode.get(code.trim().toUpperCase())}
export function cityAirportCodes(code:string):string[]{return [...(airportCity(code)?.codes||[])]}
export function airportOptions(code:string){const city=airportCity(code);return city&&city.codes.length>1?city:undefined}
export function searchCityAirports(text:string,limit=8):Airport[]{
  const query=normalize(text);if(!query)return []
  const named=[...new Set(cityByCode.values())].filter(city=>normalize(city.name).includes(query)).map(city=>findAirport(city.codes[0])!)
  const matches=[...searchAirports(text,100),...named]
  const cities=new Map<string,Airport>()
  for(const airport of matches){const code=airportCity(airport.code)!.codes[0];if(!cities.has(code))cities.set(code,findAirport(code)!)}
  return [...cities.values()].slice(0,limit)
}
export function airportSet(primary?: string, alternatives?: string[]): string[] { return [...new Set(alternatives?.length ? alternatives : primary ? [primary] : [])] }
export function airportSetLabel(primary?: string, alternatives?: string[]): string {
  const codes = airportSet(primary, alternatives)
  if (codes.length < 2) return codes[0] ? shortAirportLabel(codes[0]) : 'Qualquer aeroporto'
  const city = airportCity(codes[0])
  return `${city&&codes.every(code=>city.codes.includes(code))?city.name:'Aeroportos selecionados'} (${codes.join(' / ')})`
}
export function queryAirports(query: FlightQuery, field: 'origin' | 'arrival' | 'departure'): string[] {
  return field === 'origin' ? airportSet(query.origin, query.originAirports) : field === 'arrival' ? airportSet(query.arrivalAirport, query.arrivalAirports) : airportSet(query.departureAirport, query.departureAirports)
}
export function knownAirportSet(codes: string[]): boolean { return codes.every(code => Boolean(findAirport(code))) }
