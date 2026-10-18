import { useMemo } from 'react'
import { Route } from 'lucide-react'
import type { TripPlan } from '../shared/types'
import { requiredCityCodes, tripCityName } from '../shared/trip-cities'
import { previewTrip } from '../shared/trip-planner'
import { railTripOptions } from '../shared/rail-network'
import TripSummary from './TripSummary'

/** The form submits criteria. Looking at an example never fixes that route. */
export default function TripSearchSummary({plan,entryCode,exitCode}:{plan:TripPlan;entryCode?:string;exitCode?:string}) {
  const options=useMemo(()=>plan.transport==='train'?railTripOptions(plan,entryCode,exitCode,6):[previewTrip(plan,entryCode,exitCode)].filter(preview=>preview.status==='ready'),[plan,entryCode,exitCode])
  return <section className="trip-search-summary" aria-label="Combinações para esta busca"><div className="trip-search-summary-heading"><Route size={22}/><div><h4>Uma busca, várias combinações</h4><p>Queremos incluir {requiredCityCodes(plan).map(tripCityName).join(' + ')} em {plan.countryCount} países. A ordem e os destinos livres podem variar.</p></div></div><p>Os exemplos abaixo ajudam a visualizar a viagem. A busca compara combinações compatíveis com as suas escolhas; escolher uma prévia no mapa não fixa esse roteiro.</p>{(entryCode||exitCode)&&<p>Aeroportos definidos por você: {entryCode||'chegada livre'} → {exitCode||'saída livre'}.</p>}
    <div className="trip-example-list">{options.map((option,index)=><details key={option.stops.map(stop=>stop.airportCode).join('-')}><summary><span>Exemplo {index+1}</span>{option.stops.map(stop=>stop.city).join(' → ')}</summary><TripSummary preview={option} transport={plan.transport}/></details>)}</div>
    {!options.length&&<p>Nenhum exemplo encontrado na rede de referência com estas escolhas. Ajuste as cidades, o tempo ou a área.</p>}
    <small>Estes são alguns exemplos de uma busca amostrada. O preço consultado cobre passagens aéreas; trens e hospedagem ficam à parte.</small>
  </section>
}
