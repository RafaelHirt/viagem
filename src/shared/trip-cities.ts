import { airportOptions } from './airport-options'
import { findAirport, searchAirports } from './airports'
import type { TripPlan } from './types'

/** Airport codes identify cities here, not a required flight arrival. */
export function tripCityCode(code: string): string {
  return airportOptions(code)?.codes[0] || ({ BVA: 'CDG', TSF: 'VCE', CRL: 'BRU' } as Record<string, string>)[code] || code
}
export function requiredCityCodes(plan: TripPlan): string[] {
  const codes = plan.requiredAirports ?? (plan.requiredAirport || plan.startAirport ? [plan.requiredAirport || plan.startAirport!] : [])
  return [...new Set(codes.map(tripCityCode))]
}
const CITY_NAMES: Record<string, string> = {
  LYS:'Lyon', SXB:'Estrasburgo', BSL:'Basileia', ZRH:'Zurique', GVA:'Genebra', BRN:'Berna', LUG:'Lugano',
  VCE:'Veneza', TRN:'Turim', BLQ:'Bolonha', FLR:'Florença', CGN:'Colônia', FRA:'Frankfurt', STR:'Stuttgart',
  MUC:'Munique', SZG:'Salzburgo', VIE:'Viena', BUD:'Budapeste', INN:'Innsbruck', LUX:'Luxemburgo',
  BER:'Berlim', HAM:'Hamburgo', PRG:'Praga', MRS:'Marselha', BRU:'Bruxelas', AMS:'Amsterdã', RTM:'Roterdã', ANR:'Antuérpia',
}
export function tripCityName(code: string): string {
  const cityCode = tripCityCode(code)
  return airportOptions(cityCode)?.name || CITY_NAMES[cityCode] || findAirport(cityCode)?.city.split(' (')[0] || cityCode
}
export function tripCityCountry(code: string): string | undefined {
  return code === 'BSL' ? 'CH' : findAirport(code)?.countryCode
}
export function searchTripCities(text: string) {
  const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
  const query = normalize(text)
  if (!query) return []
  const named = Object.keys(CITY_NAMES).filter(code => normalize(CITY_NAMES[code]).includes(query)).flatMap(code => findAirport(code) || [])
  return [...new Map([...named, ...searchAirports(text,32)].map(airport => [tripCityCode(airport.code), findAirport(tripCityCode(airport.code))!])).values()].slice(0,8)
}
