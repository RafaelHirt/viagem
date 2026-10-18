import { tripCityName } from '../shared/trip-cities'
import AirportAutocomplete from './AirportAutocomplete'
import type { FlightDraft } from '../shared/flight-draft'
import { tripDays, WEEKDAYS } from '../shared/flight-dates'
import { SlidersHorizontal } from 'lucide-react'
import MonthRange from './MonthRange'

export default function FlightPreferences({ value, onChange }: { value: FlightDraft; onChange: (draft: FlightDraft) => void }) {
  const update = (patch: Partial<FlightDraft>) => onChange({ ...value, ...patch })
  function chooseWeekdays(mode: FlightDraft['weekdayMode']) {
    update({ weekdayMode: mode, ...(mode === 'friday-sunday' ? { departureWeekdays: [5], returnWeekdays: [0], minDays: '2', maxDays: '2' } : mode === 'custom' ? { departureWeekdays: value.departureWeekdays.length ? value.departureWeekdays : [5], returnWeekdays: value.returnWeekdays.length ? value.returnWeekdays : [0] } : {}) })
  }
  const duration = tripDays(value.departureDate, value.returnDate)
  return <>
    <label className="field"><span>Quando quer viajar?</span><select aria-label="Quando quer viajar?" value={value.dateMode} onChange={event => update({ dateMode: event.target.value as FlightDraft['dateMode'] })}>
      <option value="horizon">Nos próximos meses</option><option value="months">Entre meses específicos</option><option value="exact">Em datas exatas</option>
    </select></label>
    {value.dateMode === 'horizon' && <label className="field"><span>Pesquisar viagens nos próximos</span><select aria-label="Pesquisar viagens nos próximos" value={value.horizonMonths} onChange={event => update({ horizonMonths: event.target.value })}>{[1, 3, 6, 9, 12].map(months => <option key={months} value={months}>{months} {months === 1 ? 'mês' : 'meses'}</option>)}</select></label>}
    {value.dateMode === 'months' && <MonthRange start={value.startMonth} end={value.endMonth} onChange={(startMonth, endMonth) => update({ startMonth, endMonth })} />}
    {value.dateMode === 'exact' ? <><div className="field-grid"><label className="field"><span>Data de ida</span><input type="date" required value={value.departureDate} onChange={event => update({ departureDate: event.target.value })} /></label><label className="field"><span>Data de volta</span><input type="date" required min={value.departureDate || undefined} value={value.returnDate} onChange={event => update({ returnDate: event.target.value })} /></label></div>{Number.isInteger(duration) && duration > 0 && <p className="wizard-hint">{duration} {duration === 1 ? 'dia de viagem' : 'dias de viagem'}.</p>}</> : <>
      <label className="field"><span>Dias da semana</span><select aria-label="Dias da semana" value={value.weekdayMode} onChange={event => chooseWeekdays(event.target.value as FlightDraft['weekdayMode'])}><option value="any">Qualquer dia</option><option value="friday-sunday">Sair na sexta e voltar no domingo</option><option value="custom">Escolher os dias de ida e volta</option></select></label>
      {value.weekdayMode === 'custom' && <div className="weekday-fields">{(['departureWeekdays', 'returnWeekdays'] as const).map(key => <fieldset key={key}><legend>{key === 'departureWeekdays' ? 'Dias para sair' : 'Dias para voltar'}</legend><div className="weekday-options">{WEEKDAYS.map(day => <button type="button" key={day.value} aria-label={`${key === 'departureWeekdays' ? 'Ida' : 'Volta'}: ${day.name}`} aria-pressed={value[key].includes(day.value)} onClick={() => update({ [key]: value[key].includes(day.value) ? value[key].filter(item => item !== day.value) : [...value[key], day.value] })}>{day.label}</button>)}</div></fieldset>)}</div>}
      {value.weekdayMode === 'friday-sunday' ? <p className="weekend-summary"><strong>Fim de semana · sexta a domingo</strong><span>Duração de 2 dias já definida.</span></p> : <div className="field-grid"><label className="field"><span>Ficar pelo menos</span><div className="input-suffix"><input type="number" required min={1} max={365} aria-label="Ficar pelo menos" value={value.minDays} onChange={event => update({ minDays: event.target.value })} /><span>dias</span></div></label><label className="field"><span>Ficar no máximo</span><div className="input-suffix"><input type="number" required min={1} max={365} aria-label="Ficar no máximo" value={value.maxDays} onChange={event => update({ maxDays: event.target.value })} /><span>dias</span></div></label></div>}
    </>}
    <div className="flight-airports"><h4>{value.destinationMode==='airport'?'Cidade de volta':'Cidades de chegada e volta'}</h4>
      <div className="field-grid">{value.destinationMode!=='airport'&&<AirportAutocomplete optional label="Chegar por" value={value.arrivalAirport} placeholder="Qualquer cidade da região" onChange={(arrivalAirport,arrivalAirports)=>update({arrivalAirport,arrivalAirports})} />}
      {value.allowOpenJaw ? <AirportAutocomplete optional label="Voltar por" value={value.departureAirport} placeholder={value.destinationMode==='airport'?`Mesma cidade: ${tripCityName(value.arrivalAirport)}`:'Qualquer cidade da região'} onChange={(departureAirport,departureAirports)=>update({departureAirport,departureAirports})} /> : <p className="same-airport-note">Volta pela mesma cidade de chegada.</p>}</div>
      <label className="checkbox-label"><input type="checkbox" checked={value.allowOpenJaw} onChange={event => update({ allowOpenJaw: event.target.checked, ...(event.target.checked ? {} : { departureAirport: '', departureAirports: undefined }) })} /><span>Posso voltar por outra cidade</span></label>
      <p className="wizard-hint">Os aeroportos das cidades escolhidas são comparados automaticamente.</p>
    </div>
    <label className="field"><span>Quantos adultos vão viajar?</span><input type="number" required min={1} max={9} value={value.adults} onChange={event => update({ adults: event.target.value })} /></label>
    {value.allowOpenJaw && <details className="advanced-fields"><summary><SlidersHorizontal size={16} />Limitar distância entre aeroportos</summary><label className="field"><span>Distância máxima (opcional)</span><div className="input-suffix"><input type="number" min={1} max={20050} placeholder="Sem limite adicional" value={value.maxAirportDistanceKm} onChange={event => update({ maxAirportDistanceKm: event.target.value })} /><span>km</span></div><small>Distância em linha reta. O mapa continua limitando a área da viagem.</small></label></details>}
  </>
}
