import { describe, expect, it } from 'vitest'
import { DEFAULT_TRIP, withRequiredCity, withRequiredCities, previewTrip } from '../src/shared/trip-planner'
import { requiredCityCodes, tripCityName, tripCityCountry, searchTripCities } from '../src/shared/trip-cities'
import { flightDraftFromQuery, flightQueryFromDraft } from '../src/shared/flight-draft'
import type { FlightQuery } from '../src/shared/types'
import { railConnectionGroups, railConnections, railLeg, railTripOptions } from '../src/shared/rail-network'
import { validateMonitor } from '../src/shared/domain'
const paris=()=>({...withRequiredCity(DEFAULT_TRIP,'CDG'),maxLegHours:3})
describe('required European city and per-leg train constraints',()=>{
 it('lets Paris be arrival, return or an intermediate stop while every edge stays under the selected limit',()=>{
  for(const [entry,exit] of [['CDG','AMS'],['AMS','CDG'],['BRU','LHR']]) {
   const preview=previewTrip(paris(),entry,exit)
   expect(preview.status).toBe('ready');expect(preview.stops[0].airportCode).toBe(entry);expect(preview.stops.at(-1)!.airportCode).toBe(exit)
   expect(preview.stops.some(city=>city.city==='Paris')).toBe(true)
   expect(preview.legs.every(leg=>leg.maxMinutes<=180 && leg.basis==='rail-reference')).toBe(true)
  }
  expect(previewTrip(paris(),'BRU','LHR').stops.findIndex(city=>city.city==='Paris')).toBeGreaterThan(0)
 })
 it('changes map connections when the time changes and never invents Brussels–Milan as a short direct leg',()=>{
  const two=railConnections({...paris(),maxLegHours:2}),many=railConnections({...paris(),maxLegHours:48})
  expect(two.map(city=>city.city)).toContain('Bruxelas');expect(two.map(city=>city.city)).not.toContain('Zurique')
  expect(many.length).toBeGreaterThan(two.length);expect(many.map(city=>city.city)).toContain('Zurique')
  expect(railLeg('BRU','MXP')).toBeUndefined()
  expect(previewTrip({...paris(),countryCodes:['FR','BE','IT'],areas:[{lat:49,lon:5,radiusKm:1200}]}).status).toBe('no-route')
 })
 it('shows northern and southern alternatives; Switzerland–Italy uses enough city stops to meet the bound',()=>{
  const options=railTripOptions(paris())
  expect(options.some(option=>option.stops.some(city=>city.city==='Amsterdã'))).toBe(true)
  const south=options.find(option=>option.stops.some(city=>city.city==='Milão'))!
  expect(south).toBeDefined();expect(new Set(south.stops.map(city=>city.countryCode))).toEqual(new Set(['FR','CH','IT']))
  expect(south.stops.length).toBeGreaterThan(3)
  for(const leg of south.legs)expect(leg.maxMinutes).toBeLessThanOrEqual(180)
  expect(south.message).toContain('não foram consultados')
 })
 it('does not force the required city to become the flight arrival in saved criteria',()=>{
  const monitor=validateMonitor({id:'test',kind:'flight',name:'Europa',enabled:true,createdAt:'2026-10-17T17:00:00Z',query:{origin:'GYN',destination:'Europa',minDays:10,maxDays:20,horizonMonths:12,adults:2,allowOpenJaw:true,tripPlan:paris(),arrivalAirport:'AMS',departureAirport:'LHR'},rule:{dropPercent:30,windowDays:180},channels:{telegram:false}})
  expect(monitor.query).toMatchObject({arrivalAirport:'AMS',departureAirport:'LHR',tripPlan:{requiredAirport:'CDG'}})
 })
})

describe('multiple mandatory cities',()=>{
 it('lists timed train references from both Paris and Vienna instead of only the first selected city',()=>{
  const plan={...withRequiredCities(paris(),['CDG','VIE']),maxLegHours:48,areas:[{lat:49,lon:6,radiusKm:1600}]}
  const groups=railConnectionGroups(plan)
  expect(groups.map(group=>group.origin.city)).toEqual(['Paris','Viena'])
  expect(groups[0].connections.map(item=>item.destination.city)).toContain('Bruxelas')
  expect(groups[1].connections.map(item=>item.destination.city)).toEqual(expect.arrayContaining(['Salzburgo','Budapeste','Praga']))
  for(const group of groups) for(const {destination,leg} of group.connections) {
   expect(leg).toEqual(railLeg(group.origin.airportCode,destination.airportCode))
   expect(leg.maxMinutes).toBeLessThanOrEqual(48*60)
  }
  const options=railTripOptions(plan)
  expect(options.length).toBeGreaterThan(0)
  expect(options.every(option=>['Paris','Viena'].every(city=>option.stops.some(stop=>stop.city===city)))).toBe(true)
 })
 it('updates both mandatory cities when hours or areas change, without treating direct connections as a complete route',()=>{
  const plan={...withRequiredCities(paris(),['CDG','MXP']),areas:[{lat:49,lon:6,radiusKm:1200}]}
  const three=railConnectionGroups(plan),two=railConnectionGroups({...plan,maxLegHours:2})
  expect(three.map(group=>group.origin.city)).toEqual(['Paris','Milão'])
  expect(three[1].connections.map(item=>item.destination.city)).toContain('Veneza')
  expect(two[1].connections.map(item=>item.destination.city)).not.toContain('Veneza')
  expect(two[0].connections.map(item=>item.destination.city)).not.toContain('Lyon')
  expect(three.every(group=>group.connections.every(item=>item.leg.maxMinutes<=180))).toBe(true)
  expect(three[0].connections.some(item=>item.destination.city==='Milão')).toBe(false)
  expect(railTripOptions(plan).every(option=>option.stops.some(stop=>stop.city==='Paris')&&option.stops.some(stop=>stop.city==='Milão'))).toBe(true)
  const restricted=railConnectionGroups({...plan,areas:paris().areas})
  expect(restricted[1].connections.some(item=>item.destination.city==='Veneza')).toBe(false)
 })
 it('keeps an unsupported mandatory city visible with an empty reference list rather than hiding the city',()=>{
  const groups=railConnectionGroups(withRequiredCities(paris(),['CDG','LIS']))
  expect(groups.map(group=>group.origin.city)).toEqual(['Paris','Lisboa'])
  expect(groups[1].connections).toEqual([])
 })
 it('finds familiar city names instead of the airport municipality and groups airports of one city',()=>{
  expect(tripCityName(searchTripCities('Lyon')[0].code)).toBe('Lyon')
  expect(tripCityName(searchTripCities('Estrasburgo')[0].code)).toBe('Estrasburgo')
  expect(tripCityName(searchTripCities('Zurique')[0].code)).toBe('Zurique')
  expect(searchTripCities('Paris').filter(city=>tripCityName(city.code)==='Paris')).toHaveLength(1)
  expect(tripCityCountry(searchTripCities('Basileia')[0].code)).toBe('CH')
 })
 it('includes Paris and Milan in every alternative, with a third country and a time bound on every leg',()=>{
  const plan=withRequiredCities(paris(),['CDG','MXP'])
  const options=railTripOptions(plan)
  expect(options.length).toBeGreaterThan(0)
  for(const option of options) {
   expect(option.stops.map(stop=>stop.city)).toEqual(expect.arrayContaining(['Paris','Milão']))
   expect(new Set(option.stops.map(stop=>stop.countryCode))).toEqual(new Set(['FR','CH','IT']))
   expect(option.legs.every(leg=>leg.maxMinutes<=180)).toBe(true)
  }
  const reverse=previewTrip(plan,'MXP','CDG')
  expect(reverse.status).toBe('ready');expect(reverse.stops[0].airportCode).toBe('MXP');expect(reverse.stops.at(-1)!.airportCode).toBe('CDG')
  expect(previewTrip({...plan,maxLegHours:1}).status).toBe('no-route')
 })
 it('counts Paris and Lyon as one mandatory country while visiting both cities, with two more countries',()=>{
  const options=railTripOptions(withRequiredCities(paris(),['CDG','LYS']))
  expect(options.length).toBeGreaterThan(0)
  for(const option of options) {
   expect(option.stops.map(stop=>stop.city)).toEqual(expect.arrayContaining(['Paris','Lyon']))
   expect(new Set(option.stops.map(stop=>stop.countryCode)).size).toBe(3)
  }
 })
 it('normalizes airports of the same city, expands the area for a newly chosen city and preserves all cities when editing',()=>{
  const plan=withRequiredCities(paris(),['ORY','CDG','FCO'])
  expect(requiredCityCodes(plan)).toEqual(['CDG','FCO'])
  expect(plan.areas[0].radiusKm).toBeGreaterThan(paris().areas[0].radiusKm)
  const query:FlightQuery={origin:'GYN',destination:'Europa',minDays:10,maxDays:20,horizonMonths:12,adults:2,allowOpenJaw:true,tripPlan:plan,arrivalAirport:'MXP'}
  expect(flightQueryFromDraft(flightDraftFromQuery(query)).tripPlan).toEqual(plan)
  const legacy=flightDraftFromQuery({...query,tripPlan:{...paris(),requiredAirport:undefined,startAirport:'CDG'}})
  expect(requiredCityCodes(legacy.tripPlan!)).toEqual(['CDG']);expect(legacy.tripPlan!.startAirport).toBeUndefined()
  expect(requiredCityCodes(withRequiredCities(plan,['FCO']))).toEqual(['FCO'])
  expect(requiredCityCodes(withRequiredCities(plan,[]))).toEqual([])
 })
 it('validates every mandatory city and rejects too many countries, duplicate metros, invalid cities and cities outside the area',()=>{
  const base={id:'multi-city',kind:'flight',name:'Europa',enabled:true,createdAt:'2026-10-17T17:00:00Z',query:{origin:'GYN',destination:'Europa',minDays:10,maxDays:20,horizonMonths:12,adults:2,allowOpenJaw:true},rule:{dropPercent:30,windowDays:180},channels:{telegram:false}}
  const plan=withRequiredCities(paris(),['CDG','MXP'])
  expect((validateMonitor({...base,query:{...base.query,tripPlan:plan}}).query as FlightQuery).tripPlan!.requiredAirports).toEqual(['CDG','MXP'])
  for(const patch of [{requiredAirports:['CDG','ORY']},{requiredAirports:['ZZZ']},{requiredAirports:[]},{requiredAirports:['CDG','MXP','AMS'],countryCount:2},{requiredAirports:['CDG','FCO'],areas:paris().areas}]) {
   expect(()=>validateMonitor({...base,query:{...base.query,tripPlan:{...plan,...patch}}})).toThrow()
  }
 })
 it('also preserves multiple mandatory cities in the geographic car and flight models',()=>{
  for(const transport of ['car','flight'] as const) {
   const plan={...withRequiredCities(paris(),['CDG','LYS']),transport,maxLegHours:12}
   const result=previewTrip(plan)
   expect(result.status).toBe('ready')
   expect(result.stops.map(stop=>stop.airportCode)).toEqual(expect.arrayContaining(['CDG','LYS']))
   expect(result.countryCount).toBe(3);expect(result.legs.every(leg=>leg.maxMinutes<=720)).toBe(true)
  }
 })
})
