import { describe, expect, it } from 'vitest'
import { destinationChoices, destinationDisplay } from '../src/shared/destination-choices'
import { AIRPORTS, findAirport, matchesRegion } from '../src/shared/airports'
import { flightCityDraftFromQuery, flightDraftFromQuery, flightQueryFromDraft } from '../src/shared/flight-draft'
import { validateMonitor } from '../src/shared/domain'
import { airportCity, cityAirportCodes } from '../src/shared/airport-options'
import { searchTripCities } from '../src/shared/trip-cities'

describe('country, region and airport destination selection',()=>{
 it('offers the United States as a country instead of alphabetic airports and understands EUA/USA',()=>{
  for(const text of ['Estados Unidos','EUA','USA','United States']) {
   const choices=destinationChoices(text)
   expect(choices[0]).toMatchObject({kind:'region',value:'Estados Unidos'})
   expect(choices.every(choice=>choice.kind==='region')).toBe(true)
  }
  expect(destinationChoices('Portugal')[0]).toMatchObject({kind:'region',value:'Portugal'})
  expect(destinationChoices('Japão')[0]).toMatchObject({kind:'region',value:'Japão'})
 })
 it('filters the United States and Caribbean geographically, including Cancun but excluding Mexico City',()=>{
  for(const code of ['DEN','JFK','MIA','LAX'])expect(matchesRegion(findAirport(code)!,'Estados Unidos')).toBe(true)
  for(const code of ['YYZ','MEX','REC','PUJ'])expect(matchesRegion(findAirport(code)!,'USA')).toBe(false)
  for(const code of ['CUN','PUJ','SJU','NAS','MBJ','AUA','CUR','ADZ'])expect(matchesRegion(findAirport(code)!,'Caribe'),code).toBe(true)
  for(const code of ['MEX','LAX','GYN','PTY'])expect(matchesRegion(findAirport(code)!,'Caribe'),code).toBe(false)
  expect(matchesRegion(findAirport('PUJ')!,'América Central e Caribe')).toBe(true)
 })
 it('offers one Orlando city choice with both airports and no airport decisions',()=>{
  const choices=destinationChoices('Orlando')
  expect(choices[0]).toMatchObject({value:'MCO',airports:['MCO','SFB'],title:'Orlando · Estados Unidos'})
  expect(choices.filter(choice=>choice.kind==='airport')).toHaveLength(1)
  expect(choices[0].description).toContain('cidade')
  const query={origin:'GYN',destination:'Orlando',arrivalAirport:'MCO',arrivalAirports:['MCO','SFB'],minDays:5,maxDays:8,horizonMonths:12,adults:2,allowOpenJaw:true}
  expect(flightQueryFromDraft(flightDraftFromQuery(query))).toEqual(query)
 })
 it('treats Denver and its IATA codes as the same city and preserves its airports in an editable alert',()=>{
  const choices=destinationChoices('Denver')
  const together=choices.find(choice=>choice.airports?.length===2)!
  expect(together).toMatchObject({kind:'airport',value:'DEN',airports:['DEN','BJC']})
  expect(choices.filter(choice=>choice.kind==='airport')).toHaveLength(1)
  expect(destinationChoices('BJC')[0].airports).toEqual(['DEN','BJC'])
  expect(destinationChoices('Denver')[0]).toMatchObject({kind:'airport',value:'DEN'})
  expect(destinationChoices('DEN').find(choice=>choice.value==='DEN')?.airports).toEqual(['DEN','BJC'])
  expect(destinationDisplay('DEN',['DEN','BJC'])).toBe('Denver')
  const query={origin:'GYN',destination:'Denver',arrivalAirport:'DEN',arrivalAirports:['DEN','BJC'],minDays:5,maxDays:12,horizonMonths:12,adults:2,allowOpenJaw:true}
  expect(flightQueryFromDraft(flightDraftFromQuery(query))).toEqual(query)
  const saved=validateMonitor({id:'denver',name:'Denver',kind:'flight',query,enabled:true,createdAt:'2026-10-17T21:00:00Z',rule:{dropPercent:30,windowDays:180},channels:{telegram:false}})
  expect(saved.query).toMatchObject({arrivalAirports:['BJC','DEN'],adults:2})
 })
 it('covers every airport city, including unlisted municipalities, without mixing country/state homonyms',()=>{
  for(const airport of AIRPORTS){
   const city=airportCity(airport.code)!
   expect(city,airport.code).toBeDefined()
   expect(city.codes,airport.code).toContain(airport.code)
   expect(city.codes.length).toBeLessThanOrEqual(6)
   expect(city.codes.every(code=>findAirport(code)?.countryCode===airport.countryCode)).toBe(true)
   expect(city.codes.every(code=>airportCity(code)===city)).toBe(true)
  }
  expect(cityAirportCodes('SEA')).toEqual(expect.arrayContaining(['SEA','BFI','LKE']))
  expect(cityAirportCodes('HOU')).toEqual(expect.arrayContaining(['IAH','HOU']))
  expect(cityAirportCodes('AMM')).toEqual(expect.arrayContaining(['AMM','ADJ']))
  expect(destinationChoices('Miami').filter(choice=>choice.kind==='airport')).toHaveLength(1)
  expect(destinationChoices('Miami')[0]).toMatchObject({value:'MIA',airports:['MIA','OPF']})
  for(const code of ['ETR','RSA','SRA','STS'])expect(cityAirportCodes(code)).toEqual([code])
  expect(searchTripCities('Santa Rosa')).toHaveLength(4)
  const springfields=AIRPORTS.filter(airport=>airport.city==='Springfield'&&airport.countryCode==='US')
  expect(new Set(springfields.map(airport=>airportCity(airport.code)) ).size).toBe(springfields.length)
 })

 it('updates legacy airport restrictions to city scope on editing while preserving stored criteria and map boundaries',()=>{
  const legacy={origin:'SDU',destination:'Miami',arrivalAirport:'OPF',minDays:5,maxDays:8,horizonMonths:12,adults:2,allowOpenJaw:true}
  const draft=flightCityDraftFromQuery(legacy)
  expect(flightQueryFromDraft(draft)).toMatchObject({origin:'GIG',originAirports:['GIG','SDU'],arrivalAirport:'MIA',arrivalAirports:['MIA','OPF']})
  expect(legacy.arrivalAirport).toBe('OPF')
  const airport=findAirport('CDG')!
  const limited=flightCityDraftFromQuery({...legacy,destination:'Europa',arrivalAirport:'CDG',area:{lat:airport.lat,lon:airport.lon,radiusKm:1}})
  expect(limited.arrivalAirports).toBeUndefined();expect(limited.arrivalAirport).toBe('CDG')
 })

})
