import { ArrowRight, Clock3, Info, MapPin } from 'lucide-react'
import type { TravelMode, TripPreview } from '../shared/types'
import { formatLeg, TRAVEL_MODES } from '../shared/trip-planner'
import './trip-planner.css'

export default function TripSummary({ preview, transport }: { preview: TripPreview; transport: TravelMode }) {
  return <section className={`trip-summary ${preview.status !== 'ready' ? 'trip-pending' : ''}`} aria-label="Prévia do roteiro" aria-live="polite">
    <div className="trip-summary-heading"><MapPin size={18} /><div><h4>{preview.status === 'ready' ? `Uma possibilidade por ${preview.countryCount} países` : 'Monte sua prévia de roteiro'}</h4><span>{transport === 'train' && preview.legs.some(leg => leg.basis === 'rail-reference') ? 'Conexões de referência · confirme horários e preços' : 'Planejamento geográfico · sem cotação dos deslocamentos'}</span></div></div>
    {preview.status === 'ready' && <ol className="trip-stops">{preview.stops.map((stop, index) => <li key={`${stop.airportCode}-${index}`}>
      <div className="trip-stop"><span className="trip-stop-number">{index + 1}</span><div><strong>{stop.city}</strong><small>{stop.country} · cidade de referência</small></div></div>
      {preview.legs[index] && <div className="trip-leg"><ArrowRight size={14} /><span><Clock3 size={12} />{formatLeg(preview.legs[index])} de {TRAVEL_MODES[transport].toLowerCase()}</span><small>{preview.legs[index].basis === 'rail-reference' ? <a href={preview.legs[index].sourceUrl} target="_blank" rel="noopener noreferrer">Conferir no operador ↗</a> : `${preview.legs[index].distanceKm.toLocaleString('pt-BR')} km em linha reta`}</small></div>}
    </li>)}</ol>}
    <p className="trip-estimate-note"><Info size={15} />{preview.message}</p>
    {preview.status === 'ready' && !preview.legs.some(leg => leg.basis === 'rail-reference') && <details className="trip-method"><summary>Como calculamos esses tempos?</summary><p>São faixas indicativas a partir da distância em linha reta, velocidades médias e margem para desvios e acesso. Usamos aeroportos como referência aproximada da localização das cidades. Para avião, incluímos de 3 a 5 horas adicionais para acesso, antecedência e desembarque.</p><p>Não consultamos estradas, horários de trem, voos, trânsito ou travessias. O serviço pode não existir entre essas cidades. O limite por trecho usa o extremo maior da faixa estimada. A ordem sugerida reduz distância na amostra; não representa o menor custo total da viagem.</p></details>}
  </section>
}
