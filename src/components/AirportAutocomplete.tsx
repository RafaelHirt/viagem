import { useEffect, useId, useState } from 'react';
import { findAirport, shortAirportLabel, searchAirports } from '../shared/airports';
import { searchTripCities, tripCityCountry, tripCityName } from '../shared/trip-cities';

export default function AirportAutocomplete({ value, onChange, label, placeholder = 'Ex.: Goiânia ou São Paulo', optional = false, cityOnly = false }: {
  value: string; onChange: (code: string) => void; label: string; placeholder?: string; optional?: boolean; cityOnly?: boolean;
}) {
  const id = useId();
  const cityName = tripCityName;
  const displayLabel = (code: string) => cityOnly ? cityName(code) : shortAirportLabel(code);
  const [text, setText] = useState(value ? displayLabel(value) : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => { if (value) setText(displayLabel(value)); }, [value, cityOnly]);
  const options = cityOnly ? searchTripCities(text) : searchAirports(text,8);
  function select(code: string) {
    onChange(code); setText(displayLabel(code)); setOpen(false); setActive(-1);
  }
  return <div className="field autocomplete-field">
    <label htmlFor={id}>{label}{optional ? ' (opcional)' : ''}</label>
    <div className="autocomplete-wrap">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={active >= 0 && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off" placeholder={placeholder} value={text} onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onChange={e => { const next = e.target.value; setText(next); if (value) onChange(''); setOpen(true); setActive(-1); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(Math.min(active + 1, options.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
          if (e.key === 'Escape') { setOpen(false); setActive(-1); }
          if (e.key === 'Enter') { e.preventDefault(); if (open && active >= 0 && options[active]) select(options[active].code); }
        }} />
      {open && <ul className="autocomplete-options" id={`${id}-options`} role="listbox" aria-label={`Sugestões: ${label}`}>
        {options.map((airport, index) => <li key={airport.code} id={`${id}-${index}`} role="option" aria-selected={active === index} onMouseDown={e => e.preventDefault()} onClick={() => select(airport.code)} className={active === index ? 'active' : ''}>
          <strong>{cityOnly ? cityName(airport.code) : airport.city} <span>· {cityOnly && tripCityCountry(airport.code) === 'CH' ? 'Suíça' : airport.country}</span></strong>{!cityOnly && <small>{airport.name} · {airport.code}</small>}
        </li>)}
        {!options.length && <li className="autocomplete-empty">{text.trim() ? 'Nenhum aeroporto encontrado no catálogo. Tente uma cidade próxima.' : 'Comece a digitar uma cidade ou nome de aeroporto.'}</li>}
      </ul>}
    </div>
    {!(value && findAirport(value)) && <small>{cityOnly ? 'Digite e selecione a cidade que não pode faltar.' : 'Digite uma cidade e selecione um aeroporto da lista.'}</small>}
  </div>;
}
