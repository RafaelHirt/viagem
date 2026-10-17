import { useMemo, useState } from 'react'
import { Plus, Route, Trash2, X } from 'lucide-react'
import { AIRPORTS, findAirport, REGIONS } from '../shared/airports'
import type { TripPlan } from '../shared/types'
import { countriesInAreas, formatLeg, previewTrip, TRAVEL_MODES, withRequiredCities } from '../shared/trip-planner'
import { requiredCityCodes, tripCityCode, tripCityCountry, tripCityName } from '../shared/trip-cities'
import AreaMap from './AreaMap'
import { railConnectionGroups, railTripOptions } from '../shared/rail-network'
import AirportAutocomplete from './AirportAutocomplete'
import TripSummary from './TripSummary'
import './trip-planner.css'

export default function TripPlanner({ value, onChange, region = 'Europa' }: { value: TripPlan; onChange: (plan: TripPlan) => void; region?: string }) {
  const [active, setActive] = useState(0)
  const [cameraRegion, setCameraRegion] = useState(region)
  const [option, setOption] = useState(0)
  const [cityError, setCityError] = useState('')
  const [showConnections, setShowConnections] = useState(false)
  const options = useMemo(() => value.transport === 'train' ? railTripOptions(value) : [], [value])
  const preview = useMemo(() => options.length ? options[Math.min(option, options.length - 1)] : previewTrip(value), [value, options, option])
  const connectionGroups = useMemo(() => value.transport === 'train' ? railConnectionGroups(value) : undefined, [value])
  const requiredCodes = requiredCityCodes(value)
  const requiredCode = requiredCodes[0]
  const requiredCountries = new Set([...value.countryCodes, ...requiredCodes.flatMap(code => tripCityCountry(code) || [])])
  const freeCountries = Math.max(0, value.countryCount - requiredCountries.size)
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
    <div className="trip-intro"><Route size={22} /><div><h4>Uma viagem, vários países</h4><p>Escolha as cidades que não podem faltar. Podemos variar a entrada, a saída e os países restantes.</p></div></div>
    {requiredCodes.length > 0 && <div className="trip-required-cities" role="group" aria-label="Cidades obrigatórias">{requiredCodes.map(code => <span key={code}><strong>{tripCityName(code)}</strong><button type="button" aria-label={`Remover ${tripCityName(code)} das cidades obrigatórias`} onClick={() => { onChange(withRequiredCities(value, requiredCodes.filter(item => item !== code))); setCityError('') }}><X size={15} /></button></span>)}</div>}
    {requiredCodes.length < 5 && <AirportAutocomplete key={requiredCodes.join('-')} cityOnly label={requiredCodes.length ? 'Adicionar cidade obrigatória' : 'Cidade obrigatória do roteiro'} placeholder={requiredCodes.length ? 'Ex.: Milão — pode ser no meio do roteiro' : 'Ex.: Paris, Milão ou Lisboa'} value="" onChange={code => {
      if (!code) return
      if (requiredCodes.includes(tripCityCode(code))) { setCityError('Esta cidade já está no roteiro. Seus aeroportos contam como uma única cidade.'); return }
      setCityError('')
      const next = withRequiredCities(value, [...requiredCodes, code]); onChange(next); setActive(0); setOption(0)
      const airport = findAirport(code)
      if (airport) setCameraRegion(airport.countryCode === 'BR' ? 'Brasil' : ({ EU: 'Europa', SA: 'América do Sul', NA: 'América do Norte', AS: 'Ásia', AF: 'África', OC: 'Oceania' }[airport.continent] || 'Qualquer lugar'))
    }} />}
    {cityError && <p className="trip-city-error" role="alert">{cityError}</p>}
    <div className="trip-controls">
      <label className="field"><span>Quero visitar</span><select aria-label="Quero visitar" value={value.countryCount} onChange={event => { const count = Number(event.target.value); update({ countryCount: count, areas: value.areas.slice(0, count), countryCodes: value.countryCodes.slice(0, count), flexibleOrder: true }); setActive(0) }}>{[2, 3, 4, 5].map(count => <option key={count} value={count}>{count} países</option>)}</select></label>
      <label className="field"><span>Entre os países, prefiro</span><select aria-label="Entre os países, prefiro" value={value.transport} onChange={event => update({ transport: event.target.value as TripPlan['transport'] })}>{Object.entries(TRAVEL_MODES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="field"><span>Tempo máximo por trecho</span><select aria-label="Tempo máximo por trecho" value={value.maxLegHours} onChange={event => update({ maxLegHours: Number(event.target.value) })}>{[1, 2, 3, 4, 6, 8, 12, 24, 48].map(hours => <option key={hours} value={hours}>Até {hours} horas estimadas</option>)}</select></label>
    </div>
    {!requiredCode && <button type="button" className="text-button" onClick={useExample}>Ver exemplo de 3 países</button>}
    {requiredCode && <>
      <div className="trip-start-note" aria-live="polite"><p><strong>{requiredCodes.map(tripCityName).join(' + ')}</strong>: presença obrigatória, em qualquer posição do roteiro.</p><p>{requiredCountries.size > value.countryCount ? 'As escolhas ultrapassam o total de países. Aumente a quantidade ou remova uma cidade ou país.' : freeCountries ? `${requiredCountries.size} ${requiredCountries.size === 1 ? 'país definido' : 'países definidos'} · ${freeCountries} ${freeCountries === 1 ? 'país livre para comparar' : 'países livres para comparar'}. Duas cidades no mesmo país contam como um país.` : 'Todos os países estão definidos. A entrada, a saída e a ordem ainda podem variar.'}</p></div>
      <section className="trip-route-overview" aria-label="Roteiro com todas as cidades obrigatórias" aria-live="polite"><h4>{preview.status === 'ready' ? 'Um roteiro que inclui suas cidades' : 'Ainda não encontramos um roteiro para estas escolhas'}</h4>{preview.status === 'ready' ? <><p className="trip-route-chain">{preview.stops.map(stop => stop.city).join(' → ')}</p><p>{requiredCodes.length === 1 ? 'Sua cidade obrigatória está incluída.' : `Todas as ${requiredCodes.length} cidades obrigatórias estão incluídas.`} Cada trecho respeita o limite de {value.maxLegHours}h.</p><small>As paradas intermediárias ajudam a respeitar o tempo por trecho. Tempos de referência, sem horários ou bilhetes consultados.</small></> : <p>{preview.message}</p>}</section>
      {options.length > 1 && <div className="trip-route-options" role="group" aria-label="Possibilidades de roteiro">{options.map((route,index) => <button type="button" key={route.stops.map(stop=>stop.airportCode).join('-')} aria-pressed={Math.min(option,options.length-1)===index} onClick={()=>setOption(index)}><strong>Possibilidade {index+1}</strong><span>{route.stops.map(stop=>stop.city).join(' → ')}</span><small>Inclui todas as suas cidades · ver no mapa</small></button>)}</div>}
      {connectionGroups && <details className="rail-connections"><summary>Ver ligações de trem de {connectionGroups.map(group => group.origin.city).join(' e ')}</summary><p>Estas são ligações individuais de referência, não um roteiro completo. O roteiro acima combina os trechos para incluir todas as suas cidades.</p><div className="rail-connection-groups" aria-live="polite">{connectionGroups.map(group => <section className="rail-connection-group" key={group.origin.airportCode} aria-label={`Ligações saindo de ${group.origin.city}`}><h5>Saindo de {group.origin.city}</h5>{group.connections.length ? <ul>{group.connections.map(({ destination, leg }) => <li key={destination.airportCode}><span>{destination.city}</span><span>{formatLeg(leg)}</span></li>)}</ul> : <p>Nenhuma ligação cadastrada nesta área cabe no limite de {value.maxLegHours}h. Isso não significa que não exista trem.</p>}</section>)}</div><label className="rail-show-connections"><input type="checkbox" checked={showConnections} onChange={event => setShowConnections(event.target.checked)} /><span>Mostrar estas ligações extras no mapa</span></label><small>O limite de {value.maxLegHours}h vale para o maior tempo de cada faixa. Confira os horários no operador.</small></details>}
      <AreaMap heading={selectedIndex ? `Área extra ${selectedIndex}` : "Seu roteiro no mapa"} value={value.areas[selectedIndex]} otherAreas={otherAreas} areaNumber={selectedIndex + 1} onSelectArea={setActive} tripPreview={preview} region={cameraRegion} focusAirport={requiredCode} requiredStops={connectionGroups?.map(group => group.origin)} connectionGroups={showConnections ? connectionGroups : undefined} onChange={area => {
        if (!area) return
        const areas = [...value.areas]; areas[selectedIndex] = area; update({ areas })
      }} />
      <details className="trip-map-options"><summary>Outras áreas e ajuste do mapa <span>(opcional)</span></summary>
        <p>Uma única área pode conter vários países. O raio define onde procurar cidades; o tempo limita cada deslocamento estimado.</p>
        <div className="trip-area-tabs" role="group" aria-label="Áreas do roteiro">
          {value.areas.map((area, index) => <button type="button" key={index} aria-pressed={selectedIndex === index} onClick={() => setActive(index)}><span>{index + 1}</span>{index ? `Área extra ${index}` : 'Área principal'}<small>{Math.round(area.radiusKm)} km</small></button>)}
          {value.areas.length < value.countryCount && <button type="button" className="trip-add-area" aria-pressed={selectedIndex === value.areas.length} onClick={() => setActive(value.areas.length)}><Plus size={15} />Incluir outra área</button>}
        </div>
        <div className="trip-map-toolbar"><label className="field"><span>Mostrar no mapa</span><select value={cameraRegion} onChange={event => setCameraRegion(event.target.value)}>{REGIONS.map(item => <option key={item.id} value={item.label}>{item.label}</option>)}</select></label><button type="button" className="text-button" onClick={() => { const airport=findAirport(requiredCode)!; onChange(withRequiredCities({ ...value, areas: [{ ...value.areas[0], lat: airport.lat, lon: airport.lon }, ...value.areas.slice(1)] },requiredCodes)); setActive(0) }}>Recentrar nas cidades obrigatórias</button></div>
        {value.areas[selectedIndex] && selectedIndex > 0 && <button type="button" className="trip-remove-area" onClick={() => { update({ areas: value.areas.filter((_, index) => index !== selectedIndex) }); setActive(Math.max(0, selectedIndex - 1)) }}><Trash2 size={13} />Remover área extra</button>}
      </details>
    </>}
    <details className="trip-country-picker" open={value.countryCodes.some(code => !countries.some(country => country.code === code)) || undefined}><summary>Escolher países e ordem <span>(opcional)</span></summary><p>Marque os países que não podem faltar.</p>
      {countries.length ? <div className="trip-country-options" role="group" aria-label="Países nas áreas">{countries.map(country => <button type="button" key={country.code} aria-pressed={value.countryCodes.includes(country.code)} disabled={!value.countryCodes.includes(country.code) && value.countryCodes.length >= value.countryCount} onClick={() => { const countryCodes = value.countryCodes.includes(country.code) ? value.countryCodes.filter(code => code !== country.code) : [...value.countryCodes, country.code]; update({ countryCodes, flexibleOrder: countryCodes.length !== value.countryCount ? true : value.flexibleOrder }) }}>{value.countryCodes.includes(country.code) && <span>{value.countryCodes.indexOf(country.code) + 1}</span>}{country.name}</button>)}</div> : <p className="wizard-hint">Os países aparecem depois que você marcar uma área com aeroportos cadastrados.</p>}
      {value.countryCodes.filter(code => !countries.some(country => country.code === code)).map(code => <button className="trip-missing-country" type="button" key={code} onClick={() => update({ countryCodes: value.countryCodes.filter(item => item !== code), flexibleOrder: true })}>{AIRPORTS.find(airport => airport.countryCode === code)?.country || code} ficou fora das áreas · remover</button>)}
      <label className="trip-free-order"><input type="checkbox" checked={value.flexibleOrder} disabled={value.countryCodes.length !== value.countryCount} onChange={event => update({ flexibleOrder: event.target.checked })} /><span>Deixar a ordem dos países livre<small>{value.countryCodes.length === value.countryCount ? 'Desmarque para seguir a ordem de seleção.' : 'Selecione todos os países para fixar a ordem.'}</small></span></label>
    </details>
    {requiredCode && <details className="trip-leg-details"><summary>Ver cada trecho e seu tempo</summary><TripSummary preview={preview} transport={value.transport} /></details>}
    <details className="trip-model-explanation"><summary>Como o roteiro é calculado?</summary><p>Todas as cidades obrigatórias precisam aparecer, em qualquer posição. Para trem na Europa, usamos uma rede de conexões de referência e aplicamos o limite ao maior tempo de cada faixa. Aumentar o raio muda a área; mudar as horas muda as conexões. Horários, obras, disponibilidade e preços para as datas escolhidas ainda precisam ser conferidos nos operadores.</p></details>
    <p className="trip-fare-note">Comparamos as passagens aéreas consultadas para roteiros que incluam todas as cidades obrigatórias. A busca é uma amostra, sem garantia do menor preço. Trens e hotéis ficam fora desse valor.</p>
  </section>
}
