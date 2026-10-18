import type { FlightQuery, GeoArea, TripPlan } from './types'
import { findAirport, findRegion, isAirportInArea } from './airports'
import { cityAirportCodes } from './airport-options'
import { tripCityName } from './trip-cities'
import { tripDays } from './flight-dates'
export interface FlightDraft {
  originAirports?: string[]; arrivalAirports?: string[]; departureAirports?: string[]
  origin: string; destination: string; destinationMode: 'region' | 'airport' | 'map' | 'trip'; arrivalAirport: string; departureAirport: string
  departureDate: string; returnDate: string; minDays: string; maxDays: string; horizonMonths: string; maxAirportDistanceKm: string
  dateMode: 'horizon' | 'months' | 'exact'; startMonth: string; endMonth: string
  weekdayMode: 'any' | 'friday-sunday' | 'custom'; departureWeekdays: number[]; returnWeekdays: number[]
  adults: string; allowOpenJaw: boolean; area?: GeoArea; tripPlan?: TripPlan
}
export const initialFlight: FlightDraft = { origin: '', destination: '', destinationMode: 'region', arrivalAirport: '', departureAirport: '', departureDate: '', returnDate: '', minDays: '10', maxDays: '20', horizonMonths: '12', maxAirportDistanceKm: '', dateMode: 'horizon', startMonth: '', endMonth: '', weekdayMode: 'any', departureWeekdays: [], returnWeekdays: [], adults: '1', allowOpenJaw: true }
export function flightDraftFromQuery(query: FlightQuery): FlightDraft {
  const fridaySunday = query.minDays === 2 && query.maxDays === 2 && query.departureWeekdays?.length === 1 && query.departureWeekdays[0] === 5 && query.returnWeekdays?.length === 1 && query.returnWeekdays[0] === 0
  const region = Boolean(findRegion(query.destination))
  return { ...initialFlight, ...query, ...(query.tripPlan?.startAirport ? { tripPlan: { ...query.tripPlan, requiredAirport: query.tripPlan.requiredAirport || query.tripPlan.startAirport, startAirport: undefined } } : {}), minDays: String(query.minDays), maxDays: String(query.maxDays), horizonMonths: String(query.horizonMonths), adults: String(query.adults),
    arrivalAirport: query.arrivalAirport || query.tripPlan?.startAirport || '', departureAirport: query.departureAirport || '',
    departureDate: query.departureDate || '', returnDate: query.returnDate || '', maxAirportDistanceKm: query.maxAirportDistanceKm ? String(query.maxAirportDistanceKm) : '',
    destinationMode: query.tripPlan ? 'trip' : query.area ? 'map' : region ? 'region' : query.arrivalAirport ? 'airport' : 'region',
    dateMode: query.departureDate ? 'exact' : query.startMonth ? 'months' : 'horizon', startMonth: query.startMonth || '', endMonth: query.endMonth || '',
    weekdayMode: fridaySunday ? 'friday-sunday' : query.departureWeekdays?.length || query.returnWeekdays?.length ? 'custom' : 'any',
    departureWeekdays: query.departureWeekdays ? [...query.departureWeekdays] : [], returnWeekdays: query.returnWeekdays ? [...query.returnWeekdays] : [],
  }
}
export function flightQueryFromDraft(draft: FlightDraft): FlightQuery {
  const exactDays = draft.dateMode === 'exact' ? tripDays(draft.departureDate, draft.returnDate) : NaN
  const weekend = draft.dateMode !== 'exact' && draft.weekdayMode === 'friday-sunday'
  return { origin: draft.origin.trim(), ...(draft.originAirports?.length ? { originAirports: draft.originAirports } : {}), ...(draft.arrivalAirports?.length ? { arrivalAirports: draft.arrivalAirports } : {}), ...(draft.allowOpenJaw && draft.departureAirports?.length ? { departureAirports: draft.departureAirports } : {}), destination: draft.destination.trim(),
    minDays: Number.isInteger(exactDays) && exactDays > 0 ? exactDays : weekend ? 2 : Number(draft.minDays), maxDays: Number.isInteger(exactDays) && exactDays > 0 ? exactDays : weekend ? 2 : Number(draft.maxDays),
    horizonMonths: Number(draft.horizonMonths), adults: Number(draft.adults), allowOpenJaw: draft.allowOpenJaw,
    ...(draft.area && draft.destinationMode !== 'trip' ? { area: draft.area } : {}), ...(draft.destinationMode === 'trip' && draft.tripPlan ? { tripPlan: draft.tripPlan } : {}),
    ...((draft.arrivalAirport || (draft.destinationMode === 'trip' && draft.tripPlan?.startAirport)) ? { arrivalAirport: draft.arrivalAirport || draft.tripPlan?.startAirport } : {}),
    ...(draft.allowOpenJaw && draft.departureAirport ? { departureAirport: draft.departureAirport } : {}),
    ...(draft.allowOpenJaw && draft.maxAirportDistanceKm.trim() ? { maxAirportDistanceKm: Number(draft.maxAirportDistanceKm) } : {}),
    ...(draft.dateMode === 'exact' ? { departureDate: draft.departureDate, returnDate: draft.returnDate } : {}),
    ...(draft.dateMode === 'months' ? { startMonth: draft.startMonth, endMonth: draft.endMonth } : {}),
    ...(draft.dateMode !== 'exact' && draft.weekdayMode !== 'any' ? { departureWeekdays: weekend ? [5] : draft.departureWeekdays, returnWeekdays: weekend ? [0] : draft.returnWeekdays } : {}),
  }
}

/** Editing adopts city selection only when the user saves; stored queries and
 * their histories remain untouched until then. Map limits still apply. */
export function flightCityDraftFromQuery(query:FlightQuery):FlightDraft {
  const draft=flightDraftFromQuery(query)
  const codes=(primary:string,destination=false)=>cityAirportCodes(primary).filter(code=>{
    const airport=findAirport(code)!
    return !destination||(!query.area||isAirportInArea(airport,query.area))&&(!query.tripPlan||query.tripPlan.areas.some(area=>isAirportInArea(airport,area)))
  })
  const origin=codes(draft.origin),arrival=codes(draft.arrivalAirport,true),departure=codes(draft.departureAirport,true)
  return {...draft,origin:origin[0]||draft.origin,originAirports:origin.length>1?origin:undefined,
    arrivalAirport:arrival[0]||draft.arrivalAirport,arrivalAirports:arrival.length>1?arrival:undefined,
    departureAirport:departure[0]||draft.departureAirport,departureAirports:departure.length>1?departure:undefined,
    ...(draft.destinationMode==='airport'?{destination:tripCityName(draft.arrivalAirport)}:{})}
}
