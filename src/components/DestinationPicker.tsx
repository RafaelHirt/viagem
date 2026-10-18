import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Globe2, MapPin, Search, X } from 'lucide-react'
import { findRegion, REGIONS } from '../shared/airports'
import { destinationChoices, destinationDisplay, type DestinationChoice } from '../shared/destination-choices'
import './destination-picker.css'

const featured=[
  {value:'Brasil',description:'Nordeste, Sul e outras regiões'},
  {value:'Estados Unidos',description:'Miami, Nova York, Orlando e mais'},
  {value:'Caribe',description:'Cancún, Punta Cana e ilhas'},
  {value:'Europa',description:'Portugal, França, Itália e mais'},
  {value:'Nordeste',description:'Recife, Salvador, Fortaleza e mais'},
  {value:'Ásia',description:'Japão, Tailândia e outros destinos'},
  {value:'América do Sul',description:'Argentina, Chile e mais'},
  {value:'Qualquer lugar',description:'Destino flexível para buscar economia'},
]
export default function DestinationPicker({value,selectedAirports,onSelect,onClear}:{
  value:string; selectedAirports?:string[]; onSelect:(choice:Pick<DestinationChoice,'kind'|'value'|'airports'>)=>void; onClear:()=>void
}) {
  const id=useId()
  const [text,setText]=useState(()=>destinationDisplay(value,selectedAirports))
  const [open,setOpen]=useState(false)
  const [active,setActive]=useState(-1)
  const [browse,setBrowse]=useState(!value)
  const keepTypedOnClear=useRef(false)
  const selectionKey=selectedAirports?.join(',')||''
  useEffect(()=>{
    if(!value&&keepTypedOnClear.current){keepTypedOnClear.current=false;return}
    keepTypedOnClear.current=false;setText(destinationDisplay(value,selectedAirports))
    if(!value)setBrowse(true)
  },[value,selectionKey])
  const choices=destinationChoices(value? '':text)
  const expanded=open && choices.length>0
  function select(choice:Pick<DestinationChoice,'kind'|'value'|'airports'>) {
    keepTypedOnClear.current=false;onSelect(choice);setText(destinationDisplay(choice.value,choice.airports));setOpen(false);setBrowse(false);setActive(-1)
  }
  function region(value:string) {select({kind:'region',value})}
  return <section className="destination-picker field" aria-label="Escolher destino">
    <label htmlFor={id}>Para onde você quer viajar?</label>
    <p className="destination-picker-lead">Procure uma cidade ou escolha um país ou região para comparar os preços.</p>
    <div className="destination-picker-input"><Search size={19} aria-hidden="true"/><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded?`${id}-options`:undefined} aria-activedescendant={expanded&&active>=0&&choices[active]?`${id}-${active}`:undefined} autoComplete="off" placeholder="Busque cidade, país ou região" value={text}
      onFocus={()=>setOpen(true)} onBlur={()=>{setOpen(false);setActive(-1)}}
      onChange={event=>{setText(event.target.value);if(value){keepTypedOnClear.current=true;onClear()}setOpen(true);setBrowse(true);setActive(-1)}}
      onKeyDown={event=>{
        if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(Math.min(active+1,choices.length-1))}
        if(event.key==='ArrowUp'){event.preventDefault();setActive(Math.max(active-1,0))}
        if(event.key==='Escape'){setOpen(false);setActive(-1)}
        if(event.key==='Enter'){event.preventDefault();if(open&&choices[active])select(choices[active]);else if(choices.length===1)select(choices[0]);else setOpen(true)}
      }}/>{text&&<button type="button" aria-label="Limpar destino" onMouseDown={event=>event.preventDefault()} onClick={()=>{keepTypedOnClear.current=false;setText('');onClear();setOpen(true);setBrowse(true);setActive(-1)}}><X size={18}/></button>}
      {expanded&&<ul id={`${id}-options`} className="destination-picker-options" role="listbox" aria-label="Destinos encontrados">{choices.map((choice,index)=><li key={`${choice.kind}-${choice.value}-${choice.airports?.join(',')||''}`} id={`${id}-${index}`} role="option" aria-selected={active===index} onMouseDown={event=>event.preventDefault()} onClick={()=>select(choice)} className={active===index?'active':''}>{choice.kind==='region'?<Globe2 size={20}/>:<MapPin size={20}/>}<div><strong>{choice.title}</strong><small>{choice.description}</small></div><ArrowRight size={16}/></li>)}</ul>}
    </div>
    {open&&text.trim()&&!value&&!choices.length&&<p className="destination-picker-empty" role="status">Não encontramos esse nome. Tente outra cidade, um país ou escolha abaixo.</p>}
    {value&&!browse&&<button type="button" className="text-button destination-change" onClick={()=>setBrowse(true)}>Ver outros países e regiões<ArrowRight size={15}/></button>}
    {browse&&(!text.trim()||value||!choices.length)&&<div className="destination-browser">
      <div className="destination-browser-heading"><strong>Explore destinos</strong><span>Escolha um para começar</span></div>
      <div className="destination-cards" role="group" aria-label="Destinos para explorar">{featured.map(item=><button type="button" key={item.value} aria-pressed={findRegion(value)?.label===item.value} onClick={()=>region(item.value)}><Globe2 size={20}/><strong>{item.value}</strong><span>{item.description}</span><ArrowRight size={16}/></button>)}</div>
      <details className="destination-directory"><summary>Ver todos os países e regiões</summary>{[
        {title:'Regiões do Brasil',items:REGIONS.filter(item=>item.id.startsWith('brazil-'))},
        {title:'Regiões do mundo',items:REGIONS.filter(item=>!item.countryCode&&!item.id.startsWith('brazil-')&&item.id!=='anywhere')},
        {title:'Países e territórios',items:REGIONS.filter(item=>item.countryCode).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'))},
      ].map(group=><fieldset key={group.title}><legend>{group.title}</legend><div>{group.items.map(item=><button type="button" key={item.id} onClick={()=>region(item.label)}>{item.label}</button>)}</div></fieldset>)}</details>
    </div>}
  </section>
}
