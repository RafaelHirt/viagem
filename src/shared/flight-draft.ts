import type { FlightQuery, GeoArea, TripPlan } from './types'
import { REGIONS } from './airports'
import { tripDays } from './flight-dates'
export interface FlightDraft {
  origin: string; destination: string; destinationMode: 'region' | 'airport' | 'map' | 'trip'; arrivalAirport: string; departureAirport: string
  departureDate: string; returnDate: string; minDays: string; maxDays: string; horizonMonths: string; maxAirportDistanceKm: string
  dateMode: 'horizon' | 'months' | 'exact'; startMonth: string; endMonth: string
  weekdayMode: 'any' | 'friday-sunday' | 'custom'; departureWeekdays: number[]; returnWeekdays: number[]
  adults: string; allowOpenJaw: boolean; area?: GeoArea; tripPlan?: TripPlan
}
export const initialFlight: FlightDraft = { origin: '', destination: 'Europa', destinationMode: 'map', arrivalAirport: '', departureAirport: '', departureDate: '', returnDate: '', minDays: '10', maxDays: '20', horizonMonths: '12', maxAirportDistanceKm: '', dateMode: 'horizon', startMonth: '', endMonth: '', weekdayMode: 'any', departureWeekdays: [], returnWeekdays: [], adults: '1', allowOpenJaw: true }
export function flightDraftFromQuery(query: FlightQuery): FlightDraft {
  const fridaySunday = query.departureWeekdays?.length === 1 && query.departureWeekdays[0] === 5 && query.returnWeekdays?.length === 1 && query.returnWeekdays[0] === 0
  const region = REGIONS.some(region => region.label === query.destination || region.id === query.destination)
  return { ...initialFlight, ...query, minDays: String(query.minDays), maxDays: String(query.maxDays), horizonMonths: String(query.horizonMonths), adults: String(query.adults),
    arrivalAirport: query.arrivalAirport || query.tripPlan?.startAirport || '', departureAirport: query.departureAirport || '',
    departureDate: query.departureDate || '', returnDate: query.returnDate || '', maxAirportDistanceKm: query.maxAirportDistanceKm ? String(query.maxAirportDistanceKm) : '',
    destinationMode: query.tripPlan ? 'trip' : query.area || region ? 'map' : query.arrivalAirport ? 'airport' : 'map',
    dateMode: query.departureDate ? 'exact' : query.startMonth ? 'months' : 'horizon', startMonth: query.startMonth || '', endMonth: query.endMonth || '',
    weekdayMode: fridaySunday ? 'friday-sunday' : query.departureWeekdays?.length || query.returnWeekdays?.length ? 'custom' : 'any',
    departureWeekdays: query.departureWeekdays ? [...query.departureWeekdays] : [], returnWeekdays: query.returnWeekdays ? [...query.returnWeekdays] : [],
  }
}
export function flightQueryFromDraft(draft: FlightDraft): FlightQuery {
  const exactDays = draft.dateMode === 'exact' ? tripDays(draft.departureDate, draft.returnDate) : NaN
  return { origin: draft.origin.trim(), destination: draft.destination.trim(),
    minDays: Number.isInteger(exactDays) && exactDays > 0 ? exactDays : Number(draft.minDays), maxDays: Number.isInteger(exactDays) && exactDays > 0 ? exactDays : Number(draft.maxDays),
    horizonMonths: Number(draft.horizonMonths), adults: Number(draft.adults), allowOpenJaw: draft.allowOpenJaw,
    ...(draft.area && draft.destinationMode !== 'trip' ? { area: draft.area } : {}), ...(draft.destinationMode === 'trip' && draft.tripPlan ? { tripPlan: draft.tripPlan } : {}),
    ...((draft.arrivalAirport || (draft.destinationMode === 'trip' && draft.tripPlan?.startAirport)) ? { arrivalAirport: draft.arrivalAirport || draft.tripPlan?.startAirport } : {}),
    ...(draft.allowOpenJaw && draft.departureAirport ? { departureAirport: draft.departureAirport } : {}),
    ...(draft.allowOpenJaw && draft.maxAirportDistanceKm.trim() ? { maxAirportDistanceKm: Number(draft.maxAirportDistanceKm) } : {}),
    ...(draft.dateMode === 'exact' ? { departureDate: draft.departureDate, returnDate: draft.returnDate } : {}),
    ...(draft.dateMode === 'months' ? { startMonth: draft.startMonth, endMonth: draft.endMonth } : {}),
    ...(draft.dateMode !== 'exact' && draft.weekdayMode !== 'any' ? { departureWeekdays: draft.departureWeekdays, returnWeekdays: draft.returnWeekdays } : {}),
  }
}
