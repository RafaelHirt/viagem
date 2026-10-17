import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Bell, Check, Hotel, Info, LoaderCircle, Plane, Search, SlidersHorizontal } from 'lucide-react';
import { flightQueryFromDraft, type FlightDraft } from '../shared/flight-draft';
export { initialFlight, type FlightDraft } from '../shared/flight-draft';
import { validateMonitor } from '../shared/domain';
import { flightPeriodLabel, weekdayLabel, flightWindow, sampleTravelDates } from '../shared/flight-dates';
import FlightPreferences from './FlightPreferences';
import { AIRPORTS, findAirport, isAirportInArea, labelAirport, matchesRegion, shortAirportLabel, REGIONS } from '../shared/airports';
import { DEFAULT_TRIP, previewTrip } from '../shared/trip-planner';
import { requiredCityCodes } from '../shared/trip-cities';
import TripSummary from './TripSummary';
import AirportAutocomplete from './AirportAutocomplete';
import AirportAlternatives from './AirportAlternatives';
import { airportSetLabel } from '../shared/airport-options';
import HotelAutocomplete from './HotelAutocomplete';
import DestinationPicker from './DestinationPicker';
import './query-wizard.css';
const AreaMap = lazy(() => import('./AreaMap'));
const TripPlanner = lazy(() => import('./TripPlanner'));
export type HotelDraft = { property: string; propertyId: string; checkIn: string; checkOut: string; pattern: 'weekend' | 'weekdays' | 'both'; adults: string; horizonMonths: string };
export const initialHotel: HotelDraft = { property: '', propertyId: '', checkIn: '', checkOut: '', pattern: 'weekend', adults: '2', horizonMonths: '12' };
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Horizon({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <Field label="Pesquisar viagens nos próximos"><select value={value} onChange={e => onChange(e.target.value)}>{[1, 3, 6, 9, 12].map(months => <option key={months} value={months}>{months} {months === 1 ? 'mês' : 'meses'}</option>)}</select></Field>; }
export default function QueryWizard({ mode, kind, onKindChange, flight, setFlight, hotel, setHotel, submitting, onSubmit, onCancel, alertFields, alertSummary, hotelAvailable = false, editing = false, searchAlertFields, searchAlertEnabled = false, onSearchAlertEnabledChange }: {
  searchAlertFields?: ReactNode; searchAlertEnabled?: boolean; onSearchAlertEnabledChange?: (enabled: boolean) => void;
  mode: 'explore' | 'monitor'; kind: 'flight' | 'hotel'; onKindChange: (kind: 'flight' | 'hotel') => void;
  flight: FlightDraft; setFlight: (draft: FlightDraft) => void; hotel: HotelDraft; setHotel: (draft: HotelDraft) => void;
  submitting: boolean; onSubmit: (event: FormEvent) => void; onCancel?: () => void; alertFields?: ReactNode; alertSummary?: string; hotelAvailable?: boolean; editing?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(Boolean(flight.area));
  const selectedRegion = REGIONS.find(region => region.label === flight.destination || region.id === flight.destination);
  const mapRegion = selectedRegion?.label || 'Europa';
  const title = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const didMount = useRef(false);
  const steps = mode === 'monitor' ? ['Destino', 'Preferências', 'Alertas', 'Revisão'] : ['Destino', 'Preferências', 'Revisão'];
  const last = steps.length - 1;
  const hotelUnavailable = kind === 'hotel' && !hotelAvailable;
  const f = <K extends keyof FlightDraft>(key: K, value: FlightDraft[K]) => setFlight({ ...flight, [key]: value });
  const h = (key: keyof HotelDraft, value: string) => setHotel({ ...hotel, [key]: value });
  useEffect(() => { if (didMount.current) title.current?.focus(); else didMount.current = true; }, [step]);
  function goNext() {
    let message = '';
    if (step === 0) {
      if (kind === 'flight') {
        if (!findAirport(flight.origin)) message = 'Selecione seu aeroporto de partida na lista de cidades.';
        else if (flight.destinationMode === 'airport' && !findAirport(flight.arrivalAirport)) message = 'Selecione a cidade ou o aeroporto de chegada na lista.';
        else if ((flight.destinationMode === 'region' || flight.destinationMode === 'map') && !flight.area && !selectedRegion) message = 'Escolha uma cidade ou região, como Recife, Nordeste ou Europa.';
        else if (flight.area && selectedRegion && !AIRPORTS.some(airport => matchesRegion(airport, selectedRegion.id) && isAirportInArea(airport, flight.area!))) message = `A área marcada precisa incluir aeroportos de ${selectedRegion.label}. Ajuste a área ou remova o limite do mapa.`;
        else if (flight.destinationMode === 'trip' && (!flight.tripPlan || !requiredCityCodes(flight.tripPlan).length || previewTrip(flight.tripPlan).status !== 'ready')) message = !flight.tripPlan || !requiredCityCodes(flight.tripPlan).length ? 'Escolha pelo menos uma cidade obrigatória do roteiro.' : previewTrip(flight.tripPlan).message;
      } else if (!hotel.propertyId) message = 'Selecione um hotel encontrado na Booking. O nome digitado sozinho ainda não confirma a propriedade.';
    }
    if (step === 1) {
      if (kind === 'flight') try { validateMonitor({ id: 'review', name: 'Pesquisa', kind, query: flightQueryFromDraft(flight), rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false }, enabled: true, createdAt: new Date().toISOString() }); if (flight.dateMode === 'exact' && (!flight.departureDate || !flight.returnDate)) message = 'Informe as datas de ida e volta.'; if (flight.dateMode === 'months' && (!flight.startMonth || !flight.endMonth)) message = 'Informe o mês inicial e o mês final.'; if (!message && flight.dateMode !== 'exact') { const query = flightQueryFromDraft(flight); const window = flightWindow(query); if (!sampleTravelDates(query, window.start, window.end).length) message = 'Não há combinação com estes dias, duração e período. Ajuste suas preferências.'; } if (flight.tripPlan && flight.destinationMode === 'trip') { const preview = previewTrip(flight.tripPlan, flight.arrivalAirport, flight.departureAirport || (!flight.allowOpenJaw ? flight.arrivalAirport : undefined)); if (preview.status !== 'ready') message = preview.message; } } catch (error) { message = (error as Error).message; }
      if (kind === 'hotel' && (Boolean(hotel.checkIn) !== Boolean(hotel.checkOut) || (hotel.checkIn && hotel.checkOut <= hotel.checkIn))) message = 'Preencha entrada e saída, com a saída depois da entrada, ou deixe as duas datas livres.';
    }
    if (message) { setError(message); return; }
    const invalid = content.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input:invalid,select:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    setError(''); setStep(Math.min(step + 1, last));
  }
  function submit(event: FormEvent) { event.preventDefault(); if (hotelUnavailable) return; if (step < last) goNext(); else onSubmit(event); }
  function changeKind(value: 'flight' | 'hotel') { onKindChange(value); setStep(0); setError(''); }
  const destination = flight.destinationMode === 'airport' ? labelAirport(flight.arrivalAirport) : selectedRegion ? `${selectedRegion.label}${flight.area ? ' · área limitada no mapa' : ''}` : flight.area ? flight.area.label || 'Área selecionada no mapa' : flight.destination;
  return <form className="query-wizard" onSubmit={submit} noValidate>
    <div className="search-panel-top wizard-kind-row"><div className="kind-switch" role="group" aria-label="Tipo de viagem">
      <button type="button" className={kind === 'flight' ? 'selected' : ''} aria-pressed={kind === 'flight'} onClick={() => changeKind('flight')}><Plane size={17} />Passagens aéreas</button>
      <button type="button" className={kind === 'hotel' ? 'selected' : ''} aria-pressed={kind === 'hotel'} onClick={() => changeKind('hotel')}><Hotel size={17} />Hotéis{!hotelAvailable && <small>Em breve</small>}</button>
    </div>{onCancel && <button type="button" className="text-button" onClick={onCancel}>Cancelar</button>}</div>
    {hotelUnavailable ? <div className="wizard-unavailable" role="status">
      <Hotel size={28} aria-hidden="true" /><h3>Hotéis em breve</h3><p>A pesquisa de hotéis ainda não está disponível.</p>
      <button type="button" className="button button-primary" onClick={() => changeKind('flight')}><Plane size={17} />Pesquisar passagens</button>
    </div> : <><ol className="wizard-stepper" aria-label="Etapas da busca">{steps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
      <button type="button" disabled={index > step} aria-current={index === step ? 'step' : undefined} onClick={() => { setStep(index); setError(''); }}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</button>
    </li>)}</ol>
    <div ref={content} className="wizard-content">
      <h3 ref={title} tabIndex={-1} className="wizard-heading">{step === 0 ? (kind === 'flight' ? 'Sua próxima viagem' : 'Encontre o hotel certo') : step === 1 ? 'Datas e viajantes' : step === last ? 'Confira sua busca' : 'Quando você quer receber um aviso?'}</h3>
      {step === 0 && (kind === 'flight' ? <>
        <AirportAutocomplete value={flight.origin} onChange={origin => setFlight({ ...flight, origin, originAirports: undefined })} label="De onde você sai?" /><AirportAlternatives primary={flight.origin} selected={flight.originAirports} label="Aeroportos de partida" onChange={codes => setFlight({ ...flight, origin: codes[0], originAirports: codes.length > 1 ? codes : undefined })} />
        {flight.destinationMode !== 'trip' ? <>
          <DestinationPicker value={flight.destinationMode === 'airport' ? flight.arrivalAirport : selectedRegion?.label || (flight.area ? 'Área personalizada no mapa' : flight.destination)}
            onClear={() => { setMapOpen(false); setFlight({ ...flight, destinationMode:'region', destination:'', area:undefined, arrivalAirport:'', departureAirport:'', arrivalAirports:undefined, departureAirports:undefined }); setError(''); }}
            onSelect={choice => { setMapOpen(false); setFlight({ ...flight, destinationMode:choice.kind, destination:choice.kind === 'region' ? choice.value : labelAirport(choice.value), arrivalAirport:choice.kind === 'airport' ? choice.value : '', departureAirport:'', arrivalAirports:undefined, departureAirports:undefined, area:undefined }); setError(''); }} />
          {flight.destinationMode === 'airport' && <AirportAlternatives primary={flight.arrivalAirport} selected={flight.arrivalAirports} label="Aeroportos no destino" onChange={codes => setFlight({ ...flight, arrivalAirport:codes[0], arrivalAirports:codes.length>1 ? codes:undefined })} />}
          {selectedRegion && <div className="destination-region-note" aria-live="polite"><strong>{selectedRegion.id === 'anywhere' ? 'O destino pode ser uma surpresa' : `Comparar destinos: ${selectedRegion.label}`}</strong><p>{selectedRegion.id === 'anywhere' ? 'Vamos procurar oportunidades em destinos diferentes, dentro das datas que você escolher.' : `Você não precisa escolher uma cidade agora. Vamos comparar passagens para cidades ${selectedRegion.id === 'brazil-northeast' ? 'do Nordeste' : ({ Europa:'da Europa', Brasil:'do Brasil', Norte:'do Norte', Sudeste:'do Sudeste', Sul:'do Sul', 'Centro-Oeste':'do Centro-Oeste', 'América do Sul':'da América do Sul', 'América do Norte':'da América do Norte', 'América Central e Caribe':'da América Central e do Caribe', Ásia:'da Ásia', África:'da África', Oceania:'da Oceania' } as Record<string,string>)[selectedRegion.label] || `da região ${selectedRegion.label}`}.`}</p><p>{flight.area ? 'A busca está limitada à área marcada no mapa.' : 'A região inteira está selecionada. Se quiser, você pode limitar a uma área menor abaixo.'}</p></div>}
          {(selectedRegion || flight.area) && <details key={selectedRegion?.id || 'custom-area'} className="destination-map-optional" open={mapOpen} onToggle={event => setMapOpen(event.currentTarget.open)}><summary>Limitar a busca a uma área no mapa (opcional)</summary><p>Use se quiser ficar perto de uma cidade ou explorar apenas parte da região. Toque no mapa para marcar uma área; arraste a bolha para mover e a borda para ajustar o tamanho.</p>{flight.area && <button type="button" className="text-button" onClick={() => setFlight({ ...flight, area:undefined, destinationMode:'region', destination:selectedRegion?.label || '', arrivalAirport:'', departureAirport:'', arrivalAirports:undefined, departureAirports:undefined })}>Remover limite do mapa{selectedRegion ? ` e buscar em ${selectedRegion.label}` : ''}</button>}<div className="wizard-map"><Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={20} />Carregando mapa…</div>}>{mapOpen && <AreaMap value={flight.area} onChange={area => setFlight({ ...flight, area, destinationMode:area ? 'map':'region', destination:selectedRegion?.label || (area ? 'Área no mapa':''), arrivalAirport:'', departureAirport:'', arrivalAirports:undefined, departureAirports:undefined })} region={mapRegion} />}</Suspense></div></details>}
          <div className="destination-trip-entry"><div><strong>Quer conhecer vários países na mesma viagem?</strong><p>Escolha as cidades que não podem faltar e compare roteiros.</p></div><button type="button" className="button button-secondary" onClick={() => { setFlight({ ...flight, destinationMode:'trip', destination:`Roteiro por ${flight.tripPlan?.countryCount ?? 3} países`, tripPlan:flight.tripPlan ?? { ...DEFAULT_TRIP, areas:[] }, area:undefined, arrivalAirport:'', departureAirport:'', arrivalAirports:undefined, departureAirports:undefined }); setError(''); }}>Montar roteiro por vários países</button></div>
        </> : <div className="destination-trip-active"><button type="button" className="text-button" onClick={() => { setFlight({ ...flight, destinationMode:'region', destination:'', area:undefined, arrivalAirport:'', departureAirport:'', arrivalAirports:undefined, departureAirports:undefined }); setError(''); }}><ArrowLeft size={15} />Escolher uma cidade ou região</button><p>Visite vários países na mesma viagem. Todas as cidades obrigatórias entram no roteiro.</p></div>}
        {flight.destinationMode === 'trip' && <Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={20} />Carregando planejador…</div>}><TripPlanner value={flight.tripPlan ?? DEFAULT_TRIP} region={mapRegion} onChange={tripPlan => setFlight({ ...flight, tripPlan, arrivalAirport: tripPlan.startAirport || flight.arrivalAirport, area: undefined, destination: `Roteiro por ${tripPlan.countryCount} países` })} /></Suspense>}
      </> : <HotelAutocomplete value={hotel.property} selectedId={hotel.propertyId} onChange={(property, propertyId) => setHotel({ ...hotel, property, propertyId })} />)}
      {step === 1 && (kind === 'flight' ? <FlightPreferences value={flight} onChange={setFlight} /> : <>

        <div className="field-grid"><Field label="Quando você prefere se hospedar?"><select value={hotel.pattern} onChange={e => h('pattern', e.target.value)}><option value="weekend">Fins de semana · sexta a domingo</option><option value="weekdays">Durante a semana · domingo a sexta</option><option value="both">Ambos os períodos</option></select></Field><Horizon value={hotel.horizonMonths} onChange={value => h('horizonMonths', value)} /><Field label="Quantos adultos?"><input type="number" required min={1} max={10} value={hotel.adults} onChange={e => h('adults', e.target.value)} /></Field></div>
        <div className="inline-note"><Info size={17} /><span>Buscamos estadias futuras. Fins de semana e dias de semana usam referências separadas para comparar períodos equivalentes.</span></div>
        <details className="advanced-fields"><summary><SlidersHorizontal size={16} />Fixar datas, se preferir</summary><div className="field-grid"><Field label="Entrada"><input type="date" value={hotel.checkIn} onChange={e => h('checkIn', e.target.value)} /></Field><Field label="Saída"><input type="date" min={hotel.checkIn || undefined} value={hotel.checkOut} onChange={e => h('checkOut', e.target.value)} /></Field></div></details>
      </>)}
      {mode === 'explore' && step === 1 && onSearchAlertEnabledChange && <section className="inline-alert-setup"><label className="inline-alert-toggle"><input type="checkbox" checked={searchAlertEnabled} onChange={event => onSearchAlertEnabledChange(event.target.checked)} /><span><strong>Quero acompanhar o preço desta viagem</strong><small>Crie o alerta junto com a busca, sem preencher tudo de novo.</small></span></label>{searchAlertEnabled && searchAlertFields}</section>}
      {mode === 'monitor' && step === 2 && alertFields}
      {step === last && <>
        <dl className="query-review">
          {kind === 'flight' ? <><div><dt>Partida</dt><dd>{airportSetLabel(flight.origin, flight.originAirports)}</dd></div><div><dt>Destino</dt><dd>{destination}</dd></div><div><dt>Duração e período</dt><dd>{flightQueryFromDraft(flight).minDays} a {flightQueryFromDraft(flight).maxDays} dias · {flightPeriodLabel(flightQueryFromDraft(flight))}</dd></div>{flight.weekdayMode !== 'any' && flight.dateMode !== 'exact' && <div><dt>Dias da semana</dt><dd>Ida: {weekdayLabel(flight.departureWeekdays)} · volta: {weekdayLabel(flight.returnWeekdays)}</dd></div>}{flight.arrivalAirport && <div><dt>Chegada</dt><dd>{airportSetLabel(flight.arrivalAirport, flight.arrivalAirports)}</dd></div>}{flight.departureAirport && flight.allowOpenJaw && <div><dt>Volta por</dt><dd>{airportSetLabel(flight.departureAirport, flight.departureAirports)}</dd></div>}<div><dt>Flexibilidade</dt><dd>{flight.allowOpenJaw ? 'Pode chegar e voltar por cidades diferentes' : 'Chegada e retorno pela mesma cidade'}{flight.area ? ' dentro da área marcada' : ''}{flight.maxAirportDistanceKm ? ` · até ${flight.maxAirportDistanceKm} km entre aeroportos` : ''}</dd></div></> : <><div><dt>Hotel selecionado</dt><dd>{hotel.property}</dd></div><div><dt>Estadias</dt><dd>{hotel.pattern === 'weekend' ? 'Sexta a domingo' : hotel.pattern === 'weekdays' ? 'Domingo a sexta' : 'Semana e fins de semana'} · próximos {hotel.horizonMonths} meses</dd></div>{hotel.checkIn && <div><dt>Datas definidas</dt><dd>{hotel.checkIn.split('-').reverse().join('/')} a {hotel.checkOut.split('-').reverse().join('/')}</dd></div>}</>}
          <div><dt>Viajantes</dt><dd>{kind === 'flight' ? flight.adults : hotel.adults} adulto(s)</dd></div>{(mode === 'monitor' || searchAlertEnabled) && <div><dt>Regra do alerta</dt><dd>{alertSummary}</dd></div>}
        </dl>{kind === 'flight' && flight.destinationMode === 'trip' && flight.tripPlan && <TripSummary preview={previewTrip(flight.tripPlan)} transport={flight.tripPlan.transport} />}<div className="inline-note"><Info size={17} /><span>{mode === 'explore' ? 'Você verá os preços disponíveis agora para viajar nas datas pesquisadas.' : editing ? 'Alterar a viagem inicia uma nova referência de preços. O histórico anterior fica separado.' : 'Seu alerta ficará salvo. Os avisos dependem de atualizações automáticas e um canal ativo.'}</span></div>
      </>}
    </div>
    {error && <div className="error-message wizard-error" role="alert"><Info size={18} /><span>{error}</span></div>}
    <div className="form-actions wizard-actions"><div>{step > 0 && <button type="button" className="button button-secondary" onClick={() => { setStep(step - 1); setError(''); }}><ArrowLeft size={16} />Voltar</button>}</div><button className="button button-primary" disabled={submitting || (step === 0 && kind === 'hotel' && !hotel.propertyId)}>
      {submitting ? <LoaderCircle className="spin" size={18} /> : step < last ? <ArrowRight size={18} /> : mode === 'explore' ? <Search size={18} /> : <Bell size={18} />}
      {submitting ? (mode === 'explore' ? 'Consultando preços…' : editing ? 'Salvando alterações…' : 'Criando alerta…') : step < last ? 'Continuar' : mode === 'explore' ? searchAlertEnabled ? 'Buscar e criar alerta' : 'Ver preços agora' : editing ? 'Salvar alterações' : 'Criar alerta'}
    </button></div></>}
  </form>;
}
