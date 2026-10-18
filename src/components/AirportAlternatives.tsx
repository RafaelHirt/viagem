import { airportOptions, airportSet } from '../shared/airport-options'
import { findAirport } from '../shared/airports'

export default function AirportAlternatives({ primary, selected, label, onChange }: { primary: string; selected?: string[]; label: string; onChange: (codes: string[]) => void }) {
  const metro = airportOptions(primary)
  if (!metro) return null
  const codes = airportSet(primary, selected)
  const names: Record<string,string> = { GIG: 'Galeão', SDU: 'Santos Dumont', CDG: 'Charles de Gaulle', ORY: 'Orly', GRU: 'Guarulhos', CGH: 'Congonhas', VCP: 'Viracopos', MXP: 'Malpensa', LIN: 'Linate', BGY: 'Bérgamo', DEN:'Denver Internacional', BJC:'Rocky Mountain Metropolitan', MCO:'Orlando Internacional · principal', SFB:'Orlando Sanford · alternativa' }
  return <fieldset className="airport-alternatives"><legend>{label}</legend><div>{metro.codes.map(code => <label key={code}><input type="checkbox" checked={codes.includes(code)} disabled={codes.length===1 && codes.includes(code)} onChange={event => { const next = event.target.checked ? [...codes, code] : codes.filter(item => item !== code); if (next.length) onChange(next) }} /><span>{names[code] || findAirport(code)?.name || code} ({code})</span></label>)}</div><small>{codes.length > 1 ? `Comparar ${codes.join(' e ')} na mesma busca.` : `Você pode incluir outros aeroportos de ${metro.name}.`}</small>{metro.name==='Denver' && <small>DEN é o aeroporto internacional principal. BJC também está no catálogo, mas a presença de voos e tarifas depende da fonte consultada.</small>}{metro.name==='Orlando'&&<small>MCO é o principal aeroporto de Orlando. SFB fica em Sanford e é uma alternativa. Compare os dois se não tiver preferência.</small>}</fieldset>
}
