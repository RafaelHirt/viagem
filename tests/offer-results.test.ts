import { describe, expect, it } from 'vitest'
import { uniqueOffers, sortOffers, outboundSchedule } from '../src/shared/offer-results'
import type { Offer } from '../src/shared/types'
const fare: Offer = {id:'one',kind:'flight',title:'Goiânia → Rio',price:288200,currency:'BRL',passengers:2,origin:'GYN',arrivalAirport:'SDU',departureAirport:'SDU',outboundDate:'2027-01-15',returnDate:'2027-01-17',flightLegs:[{direction:'outbound',durationMinutes:180,stops:1,segments:[{origin:'GYN',destination:'SDU',departureTime:'2027-01-15 13:00',arrivalTime:'2027-01-15 16:00',flightNumber:'LA1'}]}],details:['Sem bagagem despachada'],observedAt:'2026-10-17T17:00:00Z',provider:'Test',confirmed:false}
describe('comparable flight results',()=>{
 it('removes proven duplicates across changing IDs but retains distinct schedules, fares and prices',()=>{
  const later={...fare,id:'later',flightLegs:[{...fare.flightLegs![0],segments:[{...fare.flightLegs![0].segments[0],departureTime:'2027-01-15 18:00'}]}]}
  const result=uniqueOffers([fare,{...fare,id:'repeated',observedAt:'2026-10-17T17:01:00Z'},later,{...fare,id:'price',price:300000},{...fare,id:'bag',details:['Inclui bagagem despachada']}])
  expect(result.map(offer=>offer.id)).toEqual(['one','later','price','bag'])
  expect(uniqueOffers([{...fare,flightLegs:[]},{...fare,id:'sparse',flightLegs:[]}])).toHaveLength(2)
 })
 it('sorts without mutating the source and places unknown durations after known flights',()=>{
  const source=[{...fare,id:'unknown',price:100,flightLegs:[]},{...fare,id:'short',price:200,flightLegs:[{...fare.flightLegs![0],durationMinutes:60}]},fare]
  expect(sortOffers(source,'duration').map(o=>o.id)).toEqual(['short','one','unknown'])
  expect(sortOffers(source,'price-desc')[0].id).toBe('one')
  expect(source[0].id).toBe('unknown')
 })
 it('shows actual local flight hours and next-day arrival without inventing missing times',()=>{
  expect(outboundSchedule(fare)).toBe('13:00 → 16:00')
  expect(outboundSchedule({...fare,flightLegs:[{...fare.flightLegs![0],segments:[{...fare.flightLegs![0].segments[0],arrivalTime:'2027-01-16 09:00'}]}]})).toBe('13:00 → 09:00 (+1)')
  expect(outboundSchedule({...fare,flightLegs:[]})).toBeNull()
 })
})
