import { airportOptions, airportSet } from '../shared/airport-options'
import { findAirport } from '../shared/airports'

export default function AirportAlternatives({ primary, selected, label, onChange }: { primary: string; selected?: string[]; label: string; onChange: (codes: string[]) => void }) {
  const metro = airportOptions(primary)
  if (!metro) return null
  const codes = airportSet(primary, selected)
  const names: Record<string,string> = { GIG: 'Galeão', SDU: 'Santos Dumont', CDG: 'Charles de Gaulle', ORY: 'Orly', GRU: 'Guarulhos', CGH: 'Congonhas', VCP: 'Viracopos', MXP: 'Malpensa', LIN: 'Linate', BGY: 'Bérgamo' }
  return <fieldset className="airport-alternatives"><legend>{label}</legend><div>{metro.codes.map(code => <label key={code}><input type="checkbox" checked={codes.includes(code)} disabled={codes.length===1 && codes.includes(code)} onChange={event => { const next = event.target.checked ? [...codes, code] : codes.filter(item => item !== code); if (next.length) onChange(next) }} /><span>{names[code] || findAirport(code)?.name || code} ({code})</span></label>)}</div><small>{codes.length > 1 ? `Comparar ${codes.join(' e ')} na mesma busca.` : `Você pode incluir outros aeroportos de ${metro.name}.`}</small></fieldset>
}
