import { useEffect, useId, useState } from 'react';
type HotelSuggestion = { id: string; name: string; location: string; source: 'booking'; verified: true };
export default function HotelAutocomplete({ value, selectedId, onChange }: { value: string; selectedId: string; onChange: (name: string, id: string) => void }) {
  const id = useId();
  const [options, setOptions] = useState<HotelSuggestion[]>([]);
  const [message, setMessage] = useState('Digite pelo menos 3 letras para consultar os hotéis na fonte.');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (selectedId || value.trim().length < 3) { setOptions([]); setLoading(false); return; }
    const controller = new AbortController();
    setOptions([]);
    setActive(-1);
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggestions/hotels?q=${encodeURIComponent(value.trim())}`, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error('lookup');
        const result = await response.json() as { hotels?: HotelSuggestion[]; configured: boolean; message?: string };
        const verified = (result.hotels ?? []).filter(hotel => hotel.verified === true && hotel.source === 'booking' && hotel.id);
        setOptions(verified);
        setMessage(result.message || (!result.configured ? 'A pesquisa de hotéis ainda não está conectada à Booking. O nome digitado ainda não foi validado.' : verified.length ? 'Selecione o hotel para confirmar qual propriedade deseja.' : 'Nenhum hotel encontrado. Tente o nome completo ou a cidade.'));
      } catch (error) {
        if (!controller.signal.aborted) { setOptions([]); setMessage('Não foi possível validar o hotel agora. Tente novamente ou confira a conexão em Configurações.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, selectedId]);
  function select(hotel: HotelSuggestion) { onChange(hotel.name, hotel.id); setOpen(false); }
  return <div className="field autocomplete-field field-wide">
    <label htmlFor={id}>Qual hotel você quer encontrar?</label>
    <div className="autocomplete-wrap">
      <input id={id} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={`${id}-options`} aria-describedby={`${id}-message`} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} placeholder="Ex.: Fasano Boa Vista, Porto Feliz" value={value}
        onChange={e => { onChange(e.target.value, ''); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(Math.min(active + 1, options.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') { e.preventDefault(); if (open && options[active]) select(options[active]); }
        }} />
      {open && options.length > 0 && <ul id={`${id}-options`} role="listbox" aria-label="Hotéis encontrados na Booking" className="autocomplete-options">
        {options.map((hotel, index) => <li key={hotel.id} id={`${id}-${index}`} role="option" aria-selected={active === index} onMouseDown={e => e.preventDefault()} onClick={() => select(hotel)}><strong>{hotel.name}</strong><small>{hotel.location} · Booking</small></li>)}
      </ul>}
    </div>
    <small id={`${id}-message`} className={!selectedId && value.length >= 3 ? 'lookup-warning' : ''} role="status">{selectedId ? 'Hotel encontrado na Booking e selecionado.' : loading ? 'Consultando a lista de hotéis…' : message}</small>
  </div>;
}
