import { findAirport, shortAirportLabel } from './airports'
import type { FlightQuery } from './types'

const METROS = [
  { name: 'Rio de Janeiro', codes: ['GIG', 'SDU'] }, { name: 'Paris', codes: ['CDG', 'ORY'] },
  { name: 'São Paulo e Campinas', codes: ['GRU', 'CGH', 'VCP'] }, { name: 'Milão', codes: ['MXP', 'LIN', 'BGY'] },
  { name: 'Londres', codes: ['LHR', 'LGW', 'LCY', 'STN', 'LTN', 'SEN'] }, { name: 'Roma', codes: ['FCO', 'CIA'] },
  { name: 'Nova York', codes: ['JFK', 'LGA', 'EWR'] }, { name: 'Tóquio', codes: ['NRT', 'HND'] },
]
export function airportOptions(code: string) { return METROS.find(metro => metro.codes.includes(code)) }
export function airportSet(primary?: string, alternatives?: string[]): string[] { return [...new Set(alternatives?.length ? alternatives : primary ? [primary] : [])] }
export function airportSetLabel(primary?: string, alternatives?: string[]): string {
  const codes = airportSet(primary, alternatives)
  if (codes.length < 2) return codes[0] ? shortAirportLabel(codes[0]) : 'Qualquer aeroporto'
  const metro = METROS.find(item => codes.every(code => item.codes.includes(code)))
  return `${metro?.name || 'Aeroportos selecionados'} (${codes.join(' / ')})`
}
export function queryAirports(query: FlightQuery, field: 'origin' | 'arrival' | 'departure'): string[] {
  return field === 'origin' ? airportSet(query.origin, query.originAirports) : field === 'arrival' ? airportSet(query.arrivalAirport, query.arrivalAirports) : airportSet(query.departureAirport, query.departureAirports)
}
export function knownAirportSet(codes: string[]): boolean { return codes.every(code => Boolean(findAirport(code))) }
