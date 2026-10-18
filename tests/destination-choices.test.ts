import { describe, expect, it } from 'vitest'
import { destinationChoices, destinationDisplay } from '../src/shared/destination-choices'
import { findAirport, matchesRegion } from '../src/shared/airports'
import { flightDraftFromQuery, flightQueryFromDraft } from '../src/shared/flight-draft'
import { validateMonitor } from '../src/shared/domain'

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
 it('explains Orlando airports and lets travelers compare both without choosing a code',()=>{
  const choices=destinationChoices('Orlando')
  expect(choices[0]).toMatchObject({value:'MCO',airports:['MCO','SFB'],title:'Orlando · todos os aeroportos'})
  expect(choices[0].description).toContain('principal')
  expect(choices.find(choice=>choice.value==='MCO'&&!choice.airports)?.title).toContain('principal')
  expect(choices.find(choice=>choice.value==='SFB'&&!choice.airports)?.title).toContain('alternativa')
  const query={origin:'GYN',destination:'Orlando',arrivalAirport:'MCO',arrivalAirports:['MCO','SFB'],minDays:5,maxDays:8,horizonMonths:12,adults:2,allowOpenJaw:true}
  expect(flightQueryFromDraft(flightDraftFromQuery(query))).toEqual(query)
 })
 it('offers Denver together and separately, keeps DEN first for code searches and preserves both in an editable alert',()=>{
  const choices=destinationChoices('Denver')
  const together=choices.find(choice=>choice.airports?.length===2)!
  expect(together).toMatchObject({kind:'airport',value:'DEN',airports:['DEN','BJC']})
  expect(choices.some(choice=>choice.value==='DEN'&&!choice.airports)).toBe(true)
  expect(choices.some(choice=>choice.value==='BJC'&&!choice.airports)).toBe(true)
  expect(destinationChoices('DEN')[0]).toMatchObject({kind:'airport',value:'DEN'})
  expect(destinationChoices('DEN')[0].airports).toBeUndefined()
  expect(destinationDisplay('DEN',['DEN','BJC'])).toContain('todos os aeroportos')
  const query={origin:'GYN',destination:'Denver',arrivalAirport:'DEN',arrivalAirports:['DEN','BJC'],minDays:5,maxDays:12,horizonMonths:12,adults:2,allowOpenJaw:true}
  expect(flightQueryFromDraft(flightDraftFromQuery(query))).toEqual(query)
  const saved=validateMonitor({id:'denver',name:'Denver',kind:'flight',query,enabled:true,createdAt:'2026-10-17T21:00:00Z',rule:{dropPercent:30,windowDays:180},channels:{telegram:false}})
  expect(saved.query).toMatchObject({arrivalAirports:['BJC','DEN'],adults:2})
 })
})
