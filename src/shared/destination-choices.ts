import { findAirport, findRegion, searchAirports, searchRegions } from './airports'
import { airportOptions } from './airport-options'
import { tripCityName } from './trip-cities'

export interface DestinationChoice {
  kind:'region'|'airport'
  value:string
  title:string
  description:string
  airports?:string[]
}
export function destinationChoices(text:string): DestinationChoice[] {
  if(!text.trim())return []
  const regions:DestinationChoice[]=searchRegions(text).slice(0,6).map(region=>({kind:'region',value:region.label,title:region.label,
    description:region.id==='anywhere'?'Comparar oportunidades sem fixar o destino':region.countryCode?'País inteiro · comparar cidades':'Região · comparar cidades'}))
  // A country name means the country, not the first airports in alphabetical order.
  if(findRegion(text))return regions
  const airports=searchAirports(text,12)
  const groups=new Map<string,DestinationChoice>()
  for(const airport of airports) {
    const metro=airportOptions(airport.code)
    if(metro && !groups.has(metro.name))groups.set(metro.name,{kind:'airport',value:metro.codes[0],airports:[...metro.codes],title:`${metro.name} · todos os aeroportos`,description:metro.name==='Orlando'?'Comparar MCO (principal) e SFB (Sanford). Você não precisa escolher agora.':`Comparar ${metro.codes.join(' / ')} na mesma busca`})
  }
  const individual:DestinationChoice[]=airports.map(airport=>({kind:'airport',value:airport.code,title:`${tripCityName(airport.code)} · ${airport.country}`,description:`${airport.name} · ${airport.code}`}))
  for(const choice of individual) {
    if(choice.value==='MCO') {choice.title='Orlando Internacional · principal (MCO)';choice.description='Aeroporto principal de chegada a Orlando'}
    if(choice.value==='SFB') {choice.title='Orlando Sanford · alternativa (SFB)';choice.description='Outro aeroporto da região; compare também o deslocamento'}
  }
  individual.sort((a,b)=>Number(airportOptions(b.value)?.codes[0]===b.value)-Number(airportOptions(a.value)?.codes[0]===a.value))
  const exact=findAirport(text.trim())
  return exact ? [...individual.filter(item=>item.value===exact.code),...groups.values(),...individual.filter(item=>item.value!==exact.code),...regions].slice(0,10) : [...regions,...groups.values(),...individual].slice(0,10)
}
export function destinationDisplay(value:string,airports?:string[]):string {
  return findAirport(value) ? `${tripCityName(value)}${airports && airports.length>1?' · todos os aeroportos':''}`:value
}
