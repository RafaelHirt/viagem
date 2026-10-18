import { findAirport, findRegion, searchRegions } from './airports'
import { cityAirportCodes } from './airport-options'
import { searchTripCities, tripCityName } from './trip-cities'

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
  if(findRegion(text))return regions
  const cities=searchTripCities(text)
  const choices=cities.map(airport=>{
    const codes=cityAirportCodes(airport.code)
    const name=tripCityName(airport.code)
    const ambiguous=cities.some(other=>other.code!==airport.code&&tripCityName(other.code)===name&&other.countryCode===airport.countryCode)
    return {kind:'airport' as const,value:airport.code,airports:codes.length>1?codes:undefined,title:`${name} · ${airport.code==='BSL'?'Suíça':airport.country}${ambiguous?` · ${airport.region}`:''}`,
      description:codes.length>1?'Comparar os aeroportos que atendem à cidade':'Buscar passagens para esta cidade'}
  })
  return (findAirport(text)?[...choices,...regions]:[...regions,...choices]).slice(0,10)
}
export function destinationDisplay(value:string,_airports?:string[]):string {
  return findAirport(value) ? tripCityName(value):value
}
