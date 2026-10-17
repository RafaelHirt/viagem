import { findAirport, isAirportInArea } from './airports'
import type { TripLeg, TripPlan, TripPreview, TripStop } from './types'

/** Planning references, not a live timetable or proof of service on a travel date. */
export const RAIL_SOURCES = {
  eurostar: 'https://www.eurostar.com/rw-en/travel-info/your-trip/timetables',
  sncf: 'https://www.sncf-connect.com/en-en/',
  sbb: 'https://www.sbb.ch/en', db: 'https://int.bahn.de/en',
  trenitalia: 'https://www.trenitalia.com/en.html', obb: 'https://www.oebb.at/en/',
}
type Source = keyof typeof RAIL_SOURCES
const cityData: Array<[string, string, number, number]> = [
  ['CDG','Paris',48.8566,2.3522], ['BRU','Bruxelas',50.8503,4.3517], ['AMS','Amsterdã',52.3676,4.9041],
  ['LHR','Londres',51.5074,-.1278], ['LIL','Lille',50.6292,3.0573], ['RTM','Roterdã',51.9244,4.4777], ['ANR','Antuérpia',51.2194,4.4025],
  ['LYS','Lyon',45.764,4.8357], ['SXB','Estrasburgo',48.5734,7.7521], ['BSL','Basileia',47.5596,7.5886],
  ['ZRH','Zurique',47.3769,8.5417], ['GVA','Genebra',46.2044,6.1432], ['BRN','Berna',46.948,7.4474], ['LUG','Lugano',46.0037,8.9511],
  ['MXP','Milão',45.4642,9.19], ['TRN','Turim',45.0703,7.6869], ['VCE','Veneza',45.4408,12.3155],
  ['BLQ','Bolonha',44.4949,11.3426], ['FLR','Florença',43.7696,11.2558], ['FCO','Roma',41.9028,12.4964],
  ['CGN','Colônia',50.9375,6.9603], ['FRA','Frankfurt',50.1109,8.6821], ['STR','Stuttgart',48.7758,9.1829],
  ['MUC','Munique',48.1351,11.582], ['SZG','Salzburgo',47.8095,13.055], ['VIE','Viena',48.2082,16.3738],
  ['BUD','Budapeste',47.4979,19.0402], ['INN','Innsbruck',47.2692,11.4041], ['LUX','Luxemburgo',49.6116,6.1319],
  ['BER','Berlim',52.52,13.405], ['HAM','Hamburgo',53.5511,9.9937], ['PRG','Praga',50.0755,14.4378], ['MRS','Marselha',43.2965,5.3698],
]
export const RAIL_CITIES: TripStop[] = cityData.flatMap(([airportCode, city, lat, lon]) => {
  const airport = findAirport(airportCode)
  return airport ? [{ airportCode, city, lat, lon, country: airportCode === 'BSL' ? 'Suíça' : airport.country, countryCode: airportCode === 'BSL' ? 'CH' : airport.countryCode }] : []
})
const aliases: Record<string,string> = { ORY:'CDG', BVA:'CDG', LIN:'MXP', BGY:'MXP', LGW:'LHR', LCY:'LHR', STN:'LHR', LTN:'LHR', SEN:'LHR', CIA:'FCO', TSF:'VCE', CRL:'BRU' }
const byCode = new Map(RAIL_CITIES.map(city => [city.airportCode, city]))
export function railCity(code?: string): TripStop | undefined { return byCode.get(aliases[code || ''] || code || '') }
// Bands deliberately avoid presenting a fastest advertised time as a guaranteed journey.
const references: Array<[string,string,number,number,Source]> = [
  ['CDG','BRU',80,105,'eurostar'], ['BRU','AMS',110,140,'eurostar'], ['CDG','AMS',200,230,'eurostar'],
  ['CDG','LHR',137,165,'eurostar'], ['BRU','LHR',120,155,'eurostar'], ['LIL','LHR',85,110,'eurostar'],
  ['CDG','LIL',60,80,'sncf'], ['LIL','BRU',35,55,'eurostar'], ['BRU','ANR',35,55,'eurostar'],
  ['ANR','RTM',60,85,'eurostar'], ['RTM','AMS',40,60,'eurostar'],
  ['CDG','LYS',115,145,'sncf'], ['CDG','SXB',105,135,'sncf'], ['CDG','BSL',180,215,'sncf'],
  ['CDG','GVA',190,225,'sncf'], ['CDG','ZRH',245,285,'sncf'], ['LYS','GVA',110,145,'sncf'],
  ['SXB','BSL',75,105,'sncf'], ['BSL','ZRH',55,80,'sbb'], ['BSL','BRN',55,80,'sbb'],
  ['BRN','ZRH',55,80,'sbb'], ['BRN','GVA',100,130,'sbb'], ['GVA','ZRH',160,195,'sbb'],
  ['ZRH','LUG',115,145,'sbb'], ['LUG','MXP',75,105,'sbb'], ['ZRH','MXP',195,230,'sbb'], ['GVA','MXP',235,275,'sbb'],
  ['LYS','TRN',230,275,'sncf'], ['TRN','MXP',55,80,'trenitalia'], ['MXP','VCE',135,170,'trenitalia'],
  ['MXP','BLQ',60,90,'trenitalia'], ['BLQ','FLR',35,60,'trenitalia'], ['FLR','FCO',90,120,'trenitalia'],
  ['BRU','CGN',110,145,'db'], ['AMS','CGN',160,195,'db'], ['CGN','FRA',60,100,'db'],
  ['FRA','SXB',110,145,'db'], ['FRA','STR',75,105,'db'], ['STR','MUC',120,160,'db'], ['FRA','BER',235,280,'db'],
  ['BER','HAM',100,135,'db'], ['BER','PRG',245,290,'db'], ['PRG','VIE',240,280,'obb'],
  ['MUC','SZG',90,120,'obb'], ['SZG','VIE',140,175,'obb'], ['VIE','BUD',140,180,'obb'],
  ['MUC','INN',100,140,'obb'], ['ZRH','INN',210,250,'obb'], ['SXB','LUX',100,140,'sncf'],
  ['BRU','LUX',180,220,'sncf'], ['CDG','LUX',130,165,'sncf'], ['LYS','MRS',95,130,'sncf'],
]
const legCache = new Map<string, TripLeg | undefined>()
export function railLeg(from: string, to: string): TripLeg | undefined {
  const a = railCity(from), b = railCity(to)
  if (!a || !b) return undefined
  const key = [a.airportCode, b.airportCode].sort().join(':')
  if (legCache.has(key)) return legCache.get(key)
  const match = references.find(([x,y]) => (x === a.airportCode && y === b.airportCode) || (y === a.airportCode && x === b.airportCode))
  if (!match) { legCache.set(key, undefined); return undefined }
  const rad = (x:number) => x*Math.PI/180
  const h = Math.sin(rad(a.lat-b.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(a.lon-b.lon)/2)**2
  const result: TripLeg = { distanceKm: Math.round(6371*2*Math.asin(Math.sqrt(h))), minMinutes: match[2], maxMinutes: match[3], basis: 'rail-reference', sourceUrl: RAIL_SOURCES[match[4]] }
  legCache.set(key, result); return result
}
function inAreas(city: TripStop, plan: TripPlan) { return plan.areas.some(area => isAirportInArea(findAirport(city.airportCode)!, area)) }
export function railConnections(plan: TripPlan): TripStop[] {
  const city = railCity(plan.requiredAirport || plan.startAirport)
  if (!city) return []
  return RAIL_CITIES.filter(next => inAreas(next,plan) && (railLeg(city.airportCode,next.airportCode)?.maxMinutes ?? Infinity) <= plan.maxLegHours*60)
}
interface Path { stops: TripStop[]; countries: string[]; mask: number; required: boolean; score: number }
const countBits = (value:number) => value.toString(2).replaceAll('0','').length

/** Bounded graph search: only listed edges; every edge obeys the selected upper bound. */
export function railTripOptions(plan: TripPlan, entryCode?: string, exitCode?: string, limit = 3): TripPreview[] {
  if (plan.startAirport && entryCode && plan.startAirport !== entryCode) return []
  const required = railCity(plan.requiredAirport || plan.startAirport)
  if ((plan.requiredAirport || plan.startAirport) && !required) return []
  const entry = railCity(entryCode || plan.startAirport), exit = railCity(exitCode)
  if ((entryCode && !entry) || (exitCode && !exit)) return []
  const nodes = RAIL_CITIES.filter(city => inAreas(city,plan))
  if ((required && !nodes.includes(required)) || (entry && !nodes.includes(entry)) || (exit && !nodes.includes(exit))) return []
  const requiredCountries = new Set([...plan.countryCodes, ...(required ? [required.countryCode] : []), ...(entry ? [entry.countryCode] : []), ...(exit ? [exit.countryCode] : [])])
  if (requiredCountries.size > plan.countryCount) return []
  const fixed = !plan.flexibleOrder && plan.countryCodes.length === plan.countryCount
  const mask = (city:TripStop) => plan.areas.reduce((value,area,index)=>isAirportInArea(findAirport(city.airportCode)!,area)?value|(1<<index):value,0)
  const fullMask = (1<<plan.areas.length)-1
  const leg = (a:TripStop,b:TripStop) => { const result=railLeg(a.airportCode,b.airportCode);return result && result.maxMinutes <= plan.maxLegHours*60 ? result : undefined }
  let paths: Path[] = (entry ? [entry] : nodes).filter(city=>!fixed||city.countryCode===plan.countryCodes[0]).map(city=>({stops:[city],countries:[city.countryCode],mask:mask(city),required:!required||city===required,score:0}))
  const found: Path[] = []
  for(let depth=1;depth<=10 && paths.length;depth++) {
    const next:Path[]=[]
    for(const path of paths) {
      const last=path.stops.at(-1)!
      if(path.countries.length===plan.countryCount && path.mask===fullMask && path.required && plan.countryCodes.every(country=>path.countries.includes(country))) {
        if(!exit || last===exit) found.push(path)
        else {
          // Closing a tour may revisit a city, but may not add an unrequested country or an over-limit edge.
          let returns:Array<{stops:TripStop[];score:number}>=[{stops:[last],score:0}]
          for(let step=0;step<6 && returns.length;step++) {
            const updated:typeof returns=[]
            for(const route of returns) for(const city of nodes) {
              if(!path.countries.includes(city.countryCode)||route.stops.includes(city))continue
              const edge=leg(route.stops.at(-1)!,city);if(!edge)continue
              const candidate={stops:[...route.stops,city],score:route.score+edge.maxMinutes+90}
              if(city===exit) found.push({...path,stops:[...path.stops,...candidate.stops.slice(1)],score:path.score+candidate.score})
              else updated.push(candidate)
            }
            returns=updated.sort((a,b)=>a.score-b.score).slice(0,24)
          }
        }
        continue
      }
      for(const city of nodes) {
        if(path.stops.includes(city))continue
        const edge=leg(last,city);if(!edge)continue
        const isNew=!path.countries.includes(city.countryCode)
        if(isNew && path.countries.length>=plan.countryCount)continue
        const visitedCountries=isNew?[...path.countries,city.countryCode]:path.countries
        if([...requiredCountries].filter(country=>!visitedCountries.includes(country)).length>plan.countryCount-visitedCountries.length)continue
        if(fixed && isNew && city.countryCode!==plan.countryCodes[path.countries.length])continue
        if(fixed && !plan.countryCodes.includes(city.countryCode))continue
        if(exit && city===exit && path.countries.length+(isNew?1:0)<plan.countryCount)continue
        next.push({stops:[...path.stops,city],countries:isNew?[...path.countries,city.countryCode]:path.countries,mask:path.mask|mask(city),required:path.required||city===required,score:path.score+edge.maxMinutes+90})
      }
    }
    const seen=new Set<string>()
    paths=next.sort((a,b)=>Number(b.required)-Number(a.required)||b.countries.length-a.countries.length||countBits(b.mask)-countBits(a.mask)||a.score-b.score).filter(path=>{const key=[path.stops.at(-1)!.airportCode,[...path.countries].sort().join(','),path.mask,path.required,path.stops.map(s=>s.airportCode).sort().join(',')].join('|');if(seen.has(key))return false;seen.add(key);return true}).slice(0,256)
  }
  const signatures=new Set<string>(), candidates:Path[]=[]
  for(const path of found.sort((a,b)=>a.score-b.score)) {
    const key=[...path.countries].sort().join(',')
    if(signatures.has(key))continue
    signatures.add(key);candidates.push(path)
  }
  const anchor=required||entry
  const sector=(path:Path) => {
    if(!anchor)return [...path.countries].sort().join(',')
    const others=path.stops.filter(city=>city!==anchor)
    const latitude=others.reduce((sum,city)=>sum+city.lat,0)/others.length-anchor.lat
    const longitude=others.reduce((sum,city)=>sum+city.lon,0)/others.length-anchor.lon
    return latitude>1?'north':latitude < -1?'south':longitude>0?'east':'west'
  }
  const selected:Path[]=candidates.length?[candidates[0]]:[]
  if(anchor && selected.length && limit>1) {
    const latitude=(path:Path)=>path.stops.reduce((sum,city)=>sum+city.lat,0)/path.stops.length-anchor.lat
    const sign=latitude(selected[0])>=0?1:-1
    const opposite=candidates.filter(path=>sign*latitude(path)<-1).sort((a,b)=>sign*latitude(a)-sign*latitude(b)||a.score-b.score)[0]
    if(opposite && !selected.includes(opposite))selected.push(opposite)
  }
  const directions=new Set(selected.map(sector))
  for(const path of candidates) {if(selected.length>=limit)break;const direction=sector(path);if(directions.has(direction)||selected.includes(path))continue;directions.add(direction);selected.push(path)}
  for(const path of candidates) {if(selected.length>=limit)break;if(!selected.includes(path))selected.push(path)}
  return selected.map(path=>({status:'ready',transport:'train',countryCount:path.countries.length,
    stops:path.stops.map((city,index)=>({...city,...(index===0&&entryCode?{airportCode:entryCode}:index===path.stops.length-1&&exitCode?{airportCode:exitCode}:{})})),
    legs:path.stops.slice(1).map((city,index)=>railLeg(path.stops[index].airportCode,city.airportCode)!),
    message:'Conexões ferroviárias de referência, com limite aplicado a cada trecho. Horários, obras e disponibilidade nas datas não foram consultados. Confira os trechos no operador.'}))
}
