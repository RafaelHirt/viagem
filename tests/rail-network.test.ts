import { describe, expect, it } from 'vitest'
import { DEFAULT_TRIP, withRequiredCity, previewTrip } from '../src/shared/trip-planner'
import { railConnections, railLeg, railTripOptions } from '../src/shared/rail-network'
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
