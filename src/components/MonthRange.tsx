import { monthLabel } from '../shared/flight-dates'

export default function MonthRange({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const now = new Date()
  const available = Array.from({ length: 25 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
  const limitFor = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + 23, 1)).toISOString().slice(0, 7)
  const lastAllowed = start ? limitFor(start) : ''
  const months = [...new Set([...available, start, end].filter(Boolean))].sort()
  return <div className="month-range">
    <div className="field-grid">
      <label className="field"><span>Primeiro mês</span><select aria-label="Primeiro mês" required value={start} onChange={event => { const next = event.target.value; onChange(next, end && next ? end < next ? next : end > limitFor(next) ? limitFor(next) : end : end) }}>
        <option value="">Escolha o mês</option>{months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
      </select></label>
      <label className="field"><span>Último mês</span><select aria-label="Último mês" required value={end} onChange={event => onChange(start, event.target.value)}>
        <option value="">Escolha o mês</option>{months.filter(month => !start || (month >= start && month <= lastAllowed)).map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
      </select></label>
    </div>
    <p className="wizard-hint">{start && end ? `Ida e volta entre ${monthLabel(start)} e ${monthLabel(end)}.` : 'Escolha os meses em que a viagem pode acontecer, incluindo a volta.'}</p>
  </div>
}
