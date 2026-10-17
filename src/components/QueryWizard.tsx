import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Bell, Check, Hotel, Info, LoaderCircle, MapPin, Plane, Search, SlidersHorizontal } from 'lucide-react';
import type { GeoArea, TripPlan } from '../shared/types';
import { findAirport, labelAirport, REGIONS } from '../shared/airports';
import { DEFAULT_TRIP, previewTrip } from '../shared/trip-planner';
import TripSummary from './TripSummary';
import AirportAutocomplete from './AirportAutocomplete';
import HotelAutocomplete from './HotelAutocomplete';
import './query-wizard.css';
const AreaMap = lazy(() => import('./AreaMap'));
const TripPlanner = lazy(() => import('./TripPlanner'));
export type FlightDraft = {
  origin: string; destination: string; destinationMode: 'region' | 'airport' | 'map' | 'trip'; arrivalAirport: string; departureAirport: string;
  departureDate: string; returnDate: string; minDays: string; maxDays: string; horizonMonths: string; maxAirportDistanceKm: string;
  adults: string; allowOpenJaw: boolean; area?: GeoArea; tripPlan?: TripPlan;
};
export type HotelDraft = { property: string; propertyId: string; checkIn: string; checkOut: string; pattern: 'weekend' | 'weekdays' | 'both'; adults: string; horizonMonths: string };
export const initialFlight: FlightDraft = { origin: '', destination: 'Europa', destinationMode: 'map', arrivalAirport: '', departureAirport: '', departureDate: '', returnDate: '', minDays: '10', maxDays: '20', horizonMonths: '12', maxAirportDistanceKm: '', adults: '1', allowOpenJaw: true };
export const initialHotel: HotelDraft = { property: '', propertyId: '', checkIn: '', checkOut: '', pattern: 'weekend', adults: '2', horizonMonths: '12' };
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Horizon({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <Field label="Pesquisar viagens nos próximos"><select value={value} onChange={e => onChange(e.target.value)}>{[1, 3, 6, 9, 12].map(months => <option key={months} value={months}>{months} {months === 1 ? 'mês' : 'meses'}</option>)}</select><small>Quanto mais tempo, mais possibilidades de datas para comparar.</small></Field>; }
export default function QueryWizard({ mode, kind, onKindChange, flight, setFlight, hotel, setHotel, submitting, onSubmit, onCancel, alertFields, alertSummary }: {
  mode: 'explore' | 'monitor'; kind: 'flight' | 'hotel'; onKindChange: (kind: 'flight' | 'hotel') => void;
  flight: FlightDraft; setFlight: (draft: FlightDraft) => void; hotel: HotelDraft; setHotel: (draft: HotelDraft) => void;
  submitting: boolean; onSubmit: (event: FormEvent) => void; onCancel?: () => void; alertFields?: ReactNode; alertSummary?: string;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [mapRegion, setMapRegion] = useState(REGIONS.some(region => region.label === flight.destination) ? flight.destination : 'Europa');
  const title = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);
  const steps = mode === 'monitor' ? ['Destino', 'Preferências', 'Alertas', 'Revisão'] : ['Destino', 'Preferências', 'Revisão'];
  const last = steps.length - 1;
  const f = (key: keyof FlightDraft, value: string | boolean | GeoArea | undefined) => setFlight({ ...flight, [key]: value });
  const h = (key: keyof HotelDraft, value: string) => setHotel({ ...hotel, [key]: value });
  useEffect(() => { if (didMount.current) title.current?.focus(); else didMount.current = true; }, [step]);
  function goNext() {
    let message = '';
    if (step === 0) {
      if (kind === 'flight') {
        if (!findAirport(flight.origin)) message = 'Selecione seu aeroporto de partida na lista de cidades.';
        else if (flight.destinationMode === 'airport' && !findAirport(flight.arrivalAirport)) message = 'Selecione a cidade ou o aeroporto de chegada na lista.';
        else if (flight.destinationMode === 'map' && !flight.area && !REGIONS.some(region => region.label === flight.destination)) message = 'Marque uma área no mapa para escolher os aeroportos permitidos.';
        else if (flight.destinationMode === 'trip' && (!flight.tripPlan || previewTrip(flight.tripPlan).status !== 'ready')) message = flight.tripPlan ? previewTrip(flight.tripPlan).message : 'Marque as áreas para montar o roteiro.';
      } else if (!hotel.propertyId) message = 'Selecione um hotel encontrado na Booking. O nome digitado sozinho ainda não confirma a propriedade.';
    }
    if (step === 1) {
      if (kind === 'flight' && Number(flight.minDays) > Number(flight.maxDays)) message = 'A duração máxima deve ser igual ou maior que a mínima.';
      if (kind === 'flight' && (Boolean(flight.departureDate) !== Boolean(flight.returnDate) || (flight.departureDate && flight.returnDate <= flight.departureDate))) message = 'Preencha ida e volta, com a volta depois da ida, ou deixe as duas datas livres.';
      if (kind === 'hotel' && (Boolean(hotel.checkIn) !== Boolean(hotel.checkOut) || (hotel.checkIn && hotel.checkOut <= hotel.checkIn))) message = 'Preencha entrada e saída, com a saída depois da entrada, ou deixe as duas datas livres.';
    }
    if (message) { setError(message); return; }
    const invalid = content.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input:invalid,select:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    setError(''); setStep(Math.min(step + 1, last));
  }
  function submit(event: FormEvent) { event.preventDefault(); if (step < last) goNext(); else onSubmit(event); }
  function changeKind(value: 'flight' | 'hotel') { onKindChange(value); setStep(0); setError(''); }
  const destination = flight.destinationMode === 'airport' ? labelAirport(flight.arrivalAirport) : flight.area ? flight.area.label || 'Área selecionada no mapa' : flight.destination;
  return <form className="query-wizard" onSubmit={submit} noValidate>
    <div className={`intent-banner ${mode === 'monitor' ? 'intent-monitor' : ''}`}>
      {mode === 'explore' ? <Search size={20} /> : <Bell size={20} />}
      <div><strong>{mode === 'explore' ? 'Ver preços agora para viajar depois' : 'Criar um alerta de oportunidade'}</strong>
        <p>{mode === 'explore' ? 'Uma consulta aos preços disponíveis hoje para datas futuras. Esta pesquisa não cria alertas.' : 'Salve o destino e a regra de queda. O envio de avisos depende de ativar as atualizações e um canal de contato.'}</p></div>
    </div>
    <div className="search-panel-top wizard-kind-row"><div className="kind-switch" role="group" aria-label="Tipo de viagem">
      <button type="button" className={kind === 'flight' ? 'selected' : ''} aria-pressed={kind === 'flight'} onClick={() => changeKind('flight')}><Plane size={17} />Passagens aéreas</button>
      <button type="button" className={kind === 'hotel' ? 'selected' : ''} aria-pressed={kind === 'hotel'} onClick={() => changeKind('hotel')}><Hotel size={17} />Hotéis</button>
    </div>{onCancel && <button type="button" className="text-button" onClick={onCancel}>Cancelar</button>}</div>
    <ol className="wizard-stepper" aria-label="Etapas da busca">{steps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
      <button type="button" disabled={index > step} aria-current={index === step ? 'step' : undefined} onClick={() => { setStep(index); setError(''); }}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</button>
    </li>)}</ol>
    <div ref={content} className="wizard-content">
      <h3 ref={title} tabIndex={-1} className="wizard-heading">{step === 0 ? (kind === 'flight' ? 'De onde você sai e para onde quer ir?' : 'Encontre o hotel certo') : step === 1 ? 'Quanto de liberdade sua viagem tem?' : step === last ? 'Confira sua busca' : 'Quando você quer receber um aviso?'}</h3>
      {step === 0 && (kind === 'flight' ? <>
        <AirportAutocomplete value={flight.origin} onChange={value => f('origin', value)} label="De onde você pode sair?" />
        <div className="destination-options"><span className="field-label">Como prefere escolher o destino?</span><div className="destination-modes" role="group" aria-label="Escolha de destino">
          {([['map', 'Escolher no mapa'], ['airport', 'Uma cidade'], ['trip', 'Vários países']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={flight.destinationMode === value} className={flight.destinationMode === value ? 'selected' : ''} onClick={() => { if (value === flight.destinationMode) return; const region = REGIONS.some(region => region.label === flight.destination) ? flight.destination : 'Europa'; if (value === 'map' || value === 'trip') setMapRegion(region); setFlight({ ...flight, destinationMode: value, destination: value === 'map' ? region : flight.destination, arrivalAirport: '', departureAirport: '', area: undefined, ...(value === 'trip' ? { tripPlan: flight.tripPlan ?? { ...DEFAULT_TRIP, areas: flight.area ? [flight.area] : [] }, destination: `Roteiro por ${flight.tripPlan?.countryCount ?? 3} países` } : {}) }); }}>{label}</button>)}
        </div></div>
        {(flight.destinationMode === 'map' || flight.destinationMode === 'region') && <div className="region-options" role="group" aria-label="Regiões de destino">{REGIONS.map(region => <button type="button" key={region.id} aria-pressed={!flight.area && flight.destination === region.label} className={!flight.area && flight.destination === region.label ? 'selected' : ''} onClick={() => { setMapRegion(region.label); setFlight({ ...flight, destinationMode: 'map', destination: region.label, area: undefined, arrivalAirport: '', departureAirport: '' }) }}><MapPin size={14} />{region.label}</button>)}</div>}
        {flight.destinationMode === 'airport' && <AirportAutocomplete label="Para qual cidade ou aeroporto?" value={flight.arrivalAirport} onChange={value => setFlight({ ...flight, arrivalAirport: value, departureAirport: '', destination: value ? labelAirport(value) : '' })} placeholder="Ex.: Paris, Lisboa ou Roma" />}
        {flight.destinationMode === 'map' && <div className="wizard-map"><p className="wizard-hint">Pode ser toda a região ou uma área que você marcar. Para visitar vários países, escolha Vários países acima.</p><Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={20} />Carregando mapa…</div>}><AreaMap value={flight.area} onChange={area => setFlight({ ...flight, area, destination: area ? area.label || 'Área no mapa' : mapRegion, arrivalAirport: '', departureAirport: '' })} region={mapRegion} /></Suspense></div>}
        {flight.destinationMode === 'trip' && <Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={20} />Carregando planejador…</div>}><TripPlanner value={flight.tripPlan ?? DEFAULT_TRIP} region={mapRegion} onChange={tripPlan => setFlight({ ...flight, tripPlan, area: undefined, destination: `Roteiro por ${tripPlan.countryCount} países` })} /></Suspense>}
      </> : <><HotelAutocomplete value={hotel.property} selectedId={hotel.propertyId} onChange={(property, propertyId) => setHotel({ ...hotel, property, propertyId })} /><div className="inline-note"><Info size={17} /><span>A lista identifica hotéis presentes na fonte. Digitar um nome não confirma que ele existe na Booking nem garante disponibilidade nas datas futuras.</span></div></>)}
      {step === 1 && (kind === 'flight' ? <>
        <div className="field-grid three"><Field label="Ficar pelo menos"><div className="input-suffix"><input type="number" required min={1} max={90} value={flight.minDays} onChange={e => f('minDays', e.target.value)} /><span>dias</span></div></Field><Field label="Ficar no máximo"><div className="input-suffix"><input type="number" required min={1} max={90} value={flight.maxDays} onChange={e => f('maxDays', e.target.value)} /><span>dias</span></div></Field><Horizon value={flight.horizonMonths} onChange={value => f('horizonMonths', value)} /></div>
        <div className="flexibility-box"><label className="checkbox-label"><input type="checkbox" checked={flight.allowOpenJaw} onChange={e => setFlight({ ...flight, allowOpenJaw: e.target.checked, departureAirport: e.target.checked ? flight.departureAirport : '' })} /><span><strong>Posso chegar por uma cidade e voltar por outra</strong><small>{flight.destinationMode === 'trip' ? 'Os dois aeroportos devem permitir um roteiro pelos países e áreas escolhidos.' : flight.area ? 'Os dois aeroportos ficam dentro da área que você marcou.' : 'Para limitar os dois aeroportos visualmente, volte à etapa Destino e marque uma área no mapa.'}</small></span></label></div>
        <Field label="Quantos adultos vão viajar?"><input type="number" required min={1} max={9} value={flight.adults} onChange={e => f('adults', e.target.value)} /></Field>
        <details className="advanced-fields"><summary><SlidersHorizontal size={16} />Preferências opcionais<span>Datas e aeroportos específicos</span></summary><div className="field-grid">
          <Field label="Ida em uma data específica"><input type="date" value={flight.departureDate} onChange={e => f('departureDate', e.target.value)} /></Field><Field label="Volta em uma data específica"><input type="date" min={flight.departureDate || undefined} value={flight.returnDate} onChange={e => f('returnDate', e.target.value)} /></Field>
          {flight.destinationMode !== 'map' && <><AirportAutocomplete optional label="Fixar aeroporto de chegada" value={flight.arrivalAirport} onChange={value => f('arrivalAirport', value)} placeholder="Ex.: Paris" />{flight.allowOpenJaw && <AirportAutocomplete optional label="Fixar aeroporto de retorno" value={flight.departureAirport} onChange={value => f('departureAirport', value)} placeholder="Ex.: Madri" />}</>}
          {flight.allowOpenJaw && <Field label="Limite de distância entre aeroportos (opcional)" hint="Em linha reta. O mapa é uma alternativa visual; deslocamento terrestre é pago à parte."><div className="input-suffix"><input type="number" min={1} max={20050} placeholder="Sem limite adicional" value={flight.maxAirportDistanceKm} onChange={e => f('maxAirportDistanceKm', e.target.value)} /><span>km</span></div></Field>}
        </div></details>
      </> : <>
        <div className="field-grid"><Field label="Quando você prefere se hospedar?"><select value={hotel.pattern} onChange={e => h('pattern', e.target.value)}><option value="weekend">Fins de semana · sexta a domingo</option><option value="weekdays">Durante a semana · domingo a sexta</option><option value="both">Ambos os períodos</option></select></Field><Horizon value={hotel.horizonMonths} onChange={value => h('horizonMonths', value)} /><Field label="Quantos adultos?"><input type="number" required min={1} max={10} value={hotel.adults} onChange={e => h('adults', e.target.value)} /></Field></div>
        <div className="inline-note"><Info size={17} /><span>Buscamos estadias futuras. Fins de semana e dias de semana usam referências separadas para comparar períodos equivalentes.</span></div>
        <details className="advanced-fields"><summary><SlidersHorizontal size={16} />Fixar datas, se preferir</summary><div className="field-grid"><Field label="Entrada"><input type="date" value={hotel.checkIn} onChange={e => h('checkIn', e.target.value)} /></Field><Field label="Saída"><input type="date" min={hotel.checkIn || undefined} value={hotel.checkOut} onChange={e => h('checkOut', e.target.value)} /></Field></div></details>
      </>)}
      {mode === 'monitor' && step === 2 && alertFields}
      {step === last && <>
        <dl className="query-review"><div><dt>O que acontece agora</dt><dd>{mode === 'explore' ? 'Consultar preços disponíveis hoje, sem criar alertas.' : 'Salvar uma regra para acompanhar preços e avisar sobre quedas.'}</dd></div>
          {kind === 'flight' ? <><div><dt>Partida</dt><dd>{labelAirport(flight.origin)}</dd></div><div><dt>Destino</dt><dd>{destination}</dd></div><div><dt>Duração e período</dt><dd>{flight.minDays} a {flight.maxDays} dias · próximos {flight.horizonMonths} meses</dd></div><div><dt>Flexibilidade</dt><dd>{flight.allowOpenJaw ? 'Pode chegar e voltar por cidades diferentes' : 'Chegada e retorno pela mesma cidade'}{flight.area ? ' dentro da área marcada' : ''}{flight.maxAirportDistanceKm ? ` · até ${flight.maxAirportDistanceKm} km entre aeroportos` : ''}</dd></div>{flight.departureDate && <div><dt>Datas definidas</dt><dd>{flight.departureDate.split('-').reverse().join('/')} a {flight.returnDate.split('-').reverse().join('/')}</dd></div>}</> : <><div><dt>Hotel selecionado</dt><dd>{hotel.property}</dd></div><div><dt>Estadias</dt><dd>{hotel.pattern === 'weekend' ? 'Sexta a domingo' : hotel.pattern === 'weekdays' ? 'Domingo a sexta' : 'Semana e fins de semana'} · próximos {hotel.horizonMonths} meses</dd></div>{hotel.checkIn && <div><dt>Datas definidas</dt><dd>{hotel.checkIn.split('-').reverse().join('/')} a {hotel.checkOut.split('-').reverse().join('/')}</dd></div>}</>}
          <div><dt>Viajantes</dt><dd>{kind === 'flight' ? flight.adults : hotel.adults} adulto(s)</dd></div>{mode === 'monitor' && <div><dt>Regra do alerta</dt><dd>{alertSummary}</dd></div>}
        </dl>{kind === 'flight' && flight.destinationMode === 'trip' && flight.tripPlan && <TripSummary preview={previewTrip(flight.tripPlan)} transport={flight.tripPlan.transport} />}<div className="inline-note"><Info size={17} /><span>{mode === 'explore' ? 'Os preços são de hoje para viajar no futuro. O resultado informa as datas consultadas, a cobertura e eventuais limitações da fonte.' : 'O histórico começa nas primeiras consultas. O acompanhamento automático e o envio dependem das conexões ativas em Configurações.'}</span></div>
      </>}
    </div>
    {error && <div className="error-message wizard-error" role="alert"><Info size={18} /><span>{error}</span></div>}
    <div className="form-actions wizard-actions"><div>{step > 0 && <button type="button" className="button button-secondary" onClick={() => { setStep(step - 1); setError(''); }}><ArrowLeft size={16} />Voltar</button>}</div><button className="button button-primary" disabled={submitting || (step === 0 && kind === 'hotel' && !hotel.propertyId)}>
      {submitting ? <LoaderCircle className="spin" size={18} /> : step < last ? <ArrowRight size={18} /> : mode === 'explore' ? <Search size={18} /> : <Bell size={18} />}
      {submitting ? (mode === 'explore' ? 'Consultando preços…' : 'Criando alerta…') : step < last ? 'Continuar' : mode === 'explore' ? 'Ver preços agora' : 'Criar alerta'}
    </button></div>
  </form>;
}
