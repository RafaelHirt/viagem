import { useMemo, useState } from 'react'
import { Plus, Route, Trash2 } from 'lucide-react'
import { AIRPORTS, findAirport, REGIONS } from '../shared/airports'
import type { TripPlan } from '../shared/types'
import { countriesInAreas, previewTrip, TRAVEL_MODES, withRequiredCity } from '../shared/trip-planner'
import AreaMap from './AreaMap'
import { railCity, railConnections, railTripOptions } from '../shared/rail-network'
import AirportAutocomplete from './AirportAutocomplete'
import TripSummary from './TripSummary'
import './trip-planner.css'

export default function TripPlanner({ value, onChange, region = 'Europa' }: { value: TripPlan; onChange: (plan: TripPlan) => void; region?: string }) {
  const [active, setActive] = useState(0)
  const [cameraRegion, setCameraRegion] = useState(region)
  const [option, setOption] = useState(0)
  const options = useMemo(() => value.transport === 'train' ? railTripOptions(value) : [], [value])
  const preview = useMemo(() => options.length ? options[Math.min(option, options.length - 1)] : previewTrip(value), [value, options, option])
  const connections = useMemo(() => value.transport === 'train' ? railConnections(value) : undefined, [value])
  const requiredCode = value.requiredAirport || value.startAirport
  const requiredCity = railCity(requiredCode)
  const countries = useMemo(() => countriesInAreas(value.areas), [value.areas])
  const selectedIndex = Math.min(active, value.areas.length)
  const otherAreas = value.areas.flatMap((area, index) => index === selectedIndex ? [] : [{ area, index }])
  function update(patch: Partial<TripPlan>) { onChange({ ...value, ...patch }) }
  function useExample() {
    const areas = ['CDG', 'BRU', 'AMS'].map(code => { const airport = findAirport(code)!; return { lat: airport.lat, lon: airport.lon, radiusKm: 125 } })
    onChange({ countryCount: 3, requiredAirport: 'CDG', areas, countryCodes: ['FR', 'BE', 'NL'], transport: 'train', maxLegHours: 6, flexibleOrder: true })
    setActive(0); setCameraRegion('Europa')
  }
  return <section className="trip-planner" aria-label="Planejar viagem por vários países">
    <div className="trip-intro"><Route size={22} /><div><h4>Uma viagem, vários países</h4><p>Escolha uma cidade que não pode faltar e o tempo de cada deslocamento.</p></div></div>
    <AirportAutocomplete cityOnly label="Cidade obrigatória do roteiro" placeholder="Ex.: Paris, Milão ou Lisboa" value={requiredCode || ''} onChange={code => {
      const next = withRequiredCity(value, code); onChange(next); setActive(0)
      const airport = findAirport(code)
      if (airport) setCameraRegion(airport.countryCode === 'BR' ? 'Brasil' : ({ EU: 'Europa', SA: 'América do Sul', NA: 'América do Norte', AS: 'Ásia', AF: 'África', OC: 'Oceania' }[airport.continent] || 'Qualquer lugar'))
    }} />
    <div className="trip-controls">
      <label className="field"><span>Quero visitar</span><select aria-label="Quero visitar" value={value.countryCount} onChange={event => { const count = Number(event.target.value); update({ countryCount: count, areas: value.areas.slice(0, count), countryCodes: value.countryCodes.slice(0, count), flexibleOrder: true }); setActive(0) }}>{[2, 3, 4, 5].map(count => <option key={count} value={count}>{count} países</option>)}</select></label>
      <label className="field"><span>Entre os países, prefiro</span><select aria-label="Entre os países, prefiro" value={value.transport} onChange={event => update({ transport: event.target.value as TripPlan['transport'] })}>{Object.entries(TRAVEL_MODES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="field"><span>Tempo máximo por trecho</span><select aria-label="Tempo máximo por trecho" value={value.maxLegHours} onChange={event => update({ maxLegHours: Number(event.target.value) })}>{[1, 2, 3, 4, 6, 8, 12, 24, 48].map(hours => <option key={hours} value={hours}>Até {hours} horas estimadas</option>)}</select></label>
    </div>
    {!requiredCode && <button type="button" className="text-button" onClick={useExample}>Ver exemplo de 3 países</button>}
    {requiredCode && <>
      <p className="trip-start-note">Incluindo <strong>{requiredCity?.city || findAirport(requiredCode!)?.city.split(' (')[0] || requiredCode}</strong> na entrada, na saída ou no meio do roteiro.</p>
      {connections && <div className="rail-connections" aria-live="polite"><strong>Conexões com {requiredCity?.city || 'a cidade'} · até {value.maxLegHours}h por trecho</strong><p>{connections.length ? connections.map(city => city.city).join(' · ') : 'Nenhuma conexão de referência cabe neste tempo e nesta área.'}</p></div>}
      {options.length > 1 && <div className="trip-route-options" role="group" aria-label="Possibilidades de roteiro">{options.map((route,index) => <button type="button" key={route.stops.map(stop=>stop.airportCode).join('-')} aria-pressed={Math.min(option,options.length-1)===index} onClick={()=>setOption(index)}><strong>Possibilidade {index+1}</strong><span>{route.stops.map(stop=>stop.city).join(' → ')}</span><small>Ver no mapa · deslocamentos à parte</small></button>)}</div>}
      <AreaMap heading={selectedIndex ? `Área extra ${selectedIndex}` : "Área para explorar"} value={value.areas[selectedIndex]} otherAreas={otherAreas} areaNumber={selectedIndex + 1} onSelectArea={setActive} tripPreview={preview} region={cameraRegion} focusAirport={requiredCode} connectionStops={connections} connectionAnchor={requiredCity} onChange={area => {
        if (!area) return
        const areas = [...value.areas]; areas[selectedIndex] = area; update({ areas })
      }} />
      <details className="trip-map-options"><summary>Outras áreas e ajuste do mapa <span>(opcional)</span></summary>
        <p>Uma única área pode conter vários países. O raio define onde procurar cidades; o tempo limita cada deslocamento estimado.</p>
        <div className="trip-area-tabs" role="group" aria-label="Áreas do roteiro">
          {value.areas.map((area, index) => <button type="button" key={index} aria-pressed={selectedIndex === index} onClick={() => setActive(index)}><span>{index + 1}</span>{index ? `Área extra ${index}` : 'Área principal'}<small>{Math.round(area.radiusKm)} km</small></button>)}
          {value.areas.length < value.countryCount && <button type="button" className="trip-add-area" aria-pressed={selectedIndex === value.areas.length} onClick={() => setActive(value.areas.length)}><Plus size={15} />Incluir outra área</button>}
        </div>
        <div className="trip-map-toolbar"><label className="field"><span>Mostrar no mapa</span><select value={cameraRegion} onChange={event => setCameraRegion(event.target.value)}>{REGIONS.map(item => <option key={item.id} value={item.label}>{item.label}</option>)}</select></label><button type="button" className="text-button" onClick={() => { onChange(withRequiredCity(value, requiredCode!)); setActive(0) }}>Recentrar na cidade obrigatória</button></div>
        {value.areas[selectedIndex] && selectedIndex > 0 && <button type="button" className="trip-remove-area" onClick={() => { update({ areas: value.areas.filter((_, index) => index !== selectedIndex) }); setActive(Math.max(0, selectedIndex - 1)) }}><Trash2 size={13} />Remover área extra</button>}
      </details>
    </>}
    <details className="trip-country-picker" open={value.countryCodes.some(code => !countries.some(country => country.code === code)) || undefined}><summary>Escolher países e ordem <span>(opcional)</span></summary><p>Marque os países que não podem faltar.</p>
      {countries.length ? <div className="trip-country-options" role="group" aria-label="Países nas áreas">{countries.map(country => <button type="button" key={country.code} aria-pressed={value.countryCodes.includes(country.code)} disabled={!value.countryCodes.includes(country.code) && value.countryCodes.length >= value.countryCount} onClick={() => { const countryCodes = value.countryCodes.includes(country.code) ? value.countryCodes.filter(code => code !== country.code) : [...value.countryCodes, country.code]; update({ countryCodes, flexibleOrder: countryCodes.length !== value.countryCount ? true : value.flexibleOrder }) }}>{value.countryCodes.includes(country.code) && <span>{value.countryCodes.indexOf(country.code) + 1}</span>}{country.name}</button>)}</div> : <p className="wizard-hint">Os países aparecem depois que você marcar uma área com aeroportos cadastrados.</p>}
      {value.countryCodes.filter(code => !countries.some(country => country.code === code)).map(code => <button className="trip-missing-country" type="button" key={code} onClick={() => update({ countryCodes: value.countryCodes.filter(item => item !== code), flexibleOrder: true })}>{AIRPORTS.find(airport => airport.countryCode === code)?.country || code} ficou fora das áreas · remover</button>)}
      <label className="trip-free-order"><input type="checkbox" checked={value.flexibleOrder} disabled={value.countryCodes.length !== value.countryCount} onChange={event => update({ flexibleOrder: event.target.checked })} /><span>Deixar a ordem dos países livre<small>{value.countryCodes.length === value.countryCount ? 'Desmarque para seguir a ordem de seleção.' : 'Selecione todos os países para fixar a ordem.'}</small></span></label>
    </details>
    {requiredCode && <TripSummary preview={preview} transport={value.transport} />}
    <details className="trip-model-explanation"><summary>Como o roteiro é calculado?</summary><p>A cidade obrigatória pode aparecer em qualquer posição. Para trem na Europa, usamos uma rede de conexões de referência e aplicamos o limite ao maior tempo de cada faixa. Aumentar o raio muda a área; mudar as horas muda as conexões. Horários, obras, disponibilidade e preços para as datas escolhidas ainda precisam ser conferidos nos operadores.</p></details>
    <p className="trip-fare-note">O preço da busca inclui somente a passagem aérea. Deslocamentos entre os países e hotéis são pagos à parte.</p>
  </section>
}
