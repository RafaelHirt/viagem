import { useEffect, useId, useRef, useState } from 'react'
import { Globe2, MapPin, Search, X } from 'lucide-react'
import { findAirport, REGIONS, searchAirports } from '../shared/airports'
import { tripCityName } from '../shared/trip-cities'
import './destination-picker.css'

type Choice = { kind: 'region' | 'airport'; value: string; title: string; description: string }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export default function DestinationPicker({ value, onSelect, onClear }: {
  value: string; onSelect: (choice: { kind: Choice['kind']; value: string }) => void; onClear: () => void
}) {
  const id = useId()
  const displayValue = (selection:string) => findAirport(selection) ? tripCityName(selection) : selection
  const [text, setText] = useState(() => displayValue(value))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const keepTypedOnClear = useRef(false)
  useEffect(() => {
    if (!value && keepTypedOnClear.current) { keepTypedOnClear.current=false; return }
    keepTypedOnClear.current=false; setText(displayValue(value))
  }, [value])
  const query = normalize(text)
  const regions = query ? REGIONS.filter(region => normalize(region.label).includes(query)) : ['europe','brazil-northeast','brazil','anywhere'].flatMap(code => REGIONS.find(region => region.id === code) || [])
  const choices: Choice[] = [
    ...regions.map(region => ({ kind:'region' as const, value:region.label, title:region.label, description:region.id === 'anywhere' ? 'Comparar oportunidades em destinos diferentes' : 'Comparar cidades desta região' })),
    ...searchAirports(text, 6).map(airport => ({ kind:'airport' as const, value:airport.code, title:`${tripCityName(airport.code)} · ${airport.country}`, description:`${airport.name} · ${airport.code}` })),
  ].slice(0, 9)
  function select(choice:Choice) {
    keepTypedOnClear.current=false
    onSelect({ kind:choice.kind, value:choice.value })
    setText(choice.kind === 'region' ? choice.value : tripCityName(choice.value)); setOpen(false); setActive(-1)
  }
  return <div className="destination-picker field">
    <label htmlFor={id}>Para onde você quer viajar?</label>
    <div className="destination-picker-input"><Search size={19} aria-hidden="true" /><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={active>=0 && choices[active] ? `${id}-${active}` : undefined} autoComplete="off" placeholder="Ex.: Recife, Nordeste ou Europa" value={text}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1) }}
      onChange={event => { setText(event.target.value); if(value) {keepTypedOnClear.current=true;onClear()} setOpen(true); setActive(-1) }}
      onKeyDown={event => {
        if(event.key==='ArrowDown') {event.preventDefault();setOpen(true);setActive(Math.min(active+1,choices.length-1))}
        if(event.key==='ArrowUp') {event.preventDefault();setActive(Math.max(active-1,0))}
        if(event.key==='Escape') {setOpen(false);setActive(-1)}
        if(event.key==='Enter') {event.preventDefault();if(open&&choices[active])select(choices[active]);else setOpen(true)}
      }} />{text && <button type="button" aria-label="Limpar destino" onMouseDown={event=>event.preventDefault()} onClick={()=>{keepTypedOnClear.current=false;setText('');onClear();setOpen(true);setActive(-1)}}><X size={18}/></button>}
      {open && <ul id={`${id}-options`} className="destination-picker-options" role="listbox" aria-label="Destinos sugeridos">{choices.map((choice,index) => <li key={`${choice.kind}-${choice.value}`} id={`${id}-${index}`} role="option" aria-selected={active===index} onMouseDown={event=>event.preventDefault()} onClick={()=>select(choice)} className={active===index?'active':''}>{choice.kind==='region'?<Globe2 size={20} aria-hidden="true"/>:<MapPin size={20} aria-hidden="true"/>}<div><strong>{choice.title}</strong><small>{choice.description}</small></div></li>)}{!choices.length && <li className="destination-picker-empty">Nenhum destino encontrado. Tente outra cidade ou uma região, como Nordeste.</li>}</ul>}
    </div>
    <small>Já sabe a cidade? Digite o nome. Está em dúvida? Escolha uma região e compare os preços.</small>
    {!value && !query && <div className="destination-suggestions" role="group" aria-label="Ideias de destino">{['Europa','Nordeste','Brasil','Qualquer lugar'].map(region=><button type="button" key={region} onClick={()=>select({kind:'region',value:region,title:region,description:''})}>{region}</button>)}</div>}
  </div>
}
