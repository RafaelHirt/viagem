import { useEffect, useId, useRef, useState } from 'react';
import { findAirport } from '../shared/airports';
import { cityAirportCodes } from '../shared/airport-options';
import { searchTripCities, tripCityCountry, tripCityName } from '../shared/trip-cities';

/** City selection; airport codes stay internal to the provider query. */
export default function AirportAutocomplete({ value, onChange, label, placeholder = 'Ex.: Goiânia ou São Paulo', optional = false, cityOnly = false }: {
  value: string; onChange: (code: string, airports?:string[]) => void; label: string; placeholder?: string; optional?: boolean; cityOnly?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value ? tripCityName(value) : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const keepTypedOnClear = useRef(false);
  useEffect(() => { if(!value && keepTypedOnClear.current){keepTypedOnClear.current=false;return} keepTypedOnClear.current=false;setText(value ? tripCityName(value):''); }, [value]);
  const options = searchTripCities(value ? tripCityName(value):text);
  function select(code: string) {
    const airports=cityAirportCodes(code);
    onChange(code,airports.length>1?airports:undefined); setText(tripCityName(code)); setOpen(false); setActive(-1);
  }
  return <div className="field autocomplete-field">
    <label htmlFor={id}>{label}{optional ? ' (opcional)' : ''}</label>
    <div className="autocomplete-wrap">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open&&options.length>0} aria-controls={`${id}-options`} aria-activedescendant={open&&active >= 0 && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off" placeholder={placeholder} value={text} onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onChange={e => { setText(e.target.value); if (value) {keepTypedOnClear.current=true;onChange('');} setOpen(true); setActive(-1); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(Math.min(active + 1, options.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
          if (e.key === 'Escape') { setOpen(false); setActive(-1); }
          if (e.key === 'Enter') { e.preventDefault(); if (open && options[active]) select(options[active].code); else if(options.length===1)select(options[0].code); }
        }} />
      {open && <ul className="autocomplete-options" id={`${id}-options`} role="listbox" aria-label={`Sugestões: ${label}`}>
        {options.map((airport, index) => <li key={airport.code} id={`${id}-${index}`} role="option" aria-selected={active === index} onMouseDown={e => e.preventDefault()} onClick={() => select(airport.code)} className={active === index ? 'active' : ''}>
          <strong>{tripCityName(airport.code)} <span>· {tripCityCountry(airport.code) === 'CH' ? 'Suíça' : airport.country}{options.some(other=>other.code!==airport.code&&tripCityName(other.code)===tripCityName(airport.code)&&other.countryCode===airport.countryCode)?` · ${airport.region}`:''}</span></strong>
          {!cityOnly&&<small>Os aeroportos da cidade são comparados automaticamente.</small>}
        </li>)}
        {!options.length && <li className="autocomplete-empty">{text.trim() ? 'Nenhuma cidade encontrada no catálogo. Tente outra cidade próxima.' : 'Comece a digitar o nome de uma cidade.'}</li>}
      </ul>}
    </div>
    {!(value && findAirport(value)) && <small>{cityOnly ? 'Digite e selecione a cidade que não pode faltar.' : 'Digite e selecione a cidade. Nós comparamos os aeroportos.'}</small>}
  </div>;
}
