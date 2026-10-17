import type { FlightQuery } from './types'
const DAY = 86_400_000
export const WEEKDAYS = [{ value: 1, label: 'Seg', name: 'segunda-feira' }, { value: 2, label: 'Ter', name: 'terça-feira' }, { value: 3, label: 'Qua', name: 'quarta-feira' }, { value: 4, label: 'Qui', name: 'quinta-feira' }, { value: 5, label: 'Sex', name: 'sexta-feira' }, { value: 6, label: 'Sáb', name: 'sábado' }, { value: 0, label: 'Dom', name: 'domingo' }]
export function dateStamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const stamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : NaN
}
export function tripDays(start: string, end: string): number { return (dateStamp(end) - dateStamp(start)) / DAY }
const iso = (stamp: number) => new Date(stamp).toISOString().slice(0, 10)
export function flightWindow(query: FlightQuery, now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: string) => Number(parts.find(item => item.type === name)?.value)
  const tomorrow = Date.UTC(part('year'), part('month') - 1, part('day') + 1)
  if (query.startMonth && query.endMonth) {
    const [firstYear, firstMonth] = query.startMonth.split('-').map(Number)
    const [lastYear, lastMonth] = query.endMonth.split('-').map(Number)
    return { start: iso(Math.max(tomorrow, Date.UTC(firstYear, firstMonth - 1, 1))), end: iso(Date.UTC(lastYear, lastMonth, 0)) }
  }
  const end = new Date(tomorrow); end.setUTCMonth(end.getUTCMonth() + query.horizonMonths)
  return { start: iso(tomorrow), end: iso(end.getTime()) }
}
export function matchesWeekdays(query: FlightQuery, outbound: string, returning: string): boolean {
  const first = dateStamp(outbound), last = dateStamp(returning)
  return Number.isFinite(first) && Number.isFinite(last) && (!query.departureWeekdays?.length || query.departureWeekdays.includes(new Date(first).getUTCDay())) && (!query.returnWeekdays?.length || query.returnWeekdays.includes(new Date(last).getUTCDay()))
}
export function matchesTravelDates(query: FlightQuery, outbound: string, returning: string, now = new Date()): boolean {
  const days = tripDays(outbound, returning)
  if (!Number.isInteger(days) || days < query.minDays || days > query.maxDays || !matchesWeekdays(query, outbound, returning)) return false
  // Exact dates bypass a relative horizon, but still honor a chosen month range.
  if (!query.departureDate || query.startMonth) {
    const window = flightWindow(query, now)
    if (outbound < window.start || returning > window.end) return false
  }
  return true
}
/** Three legal date pairs spread through the selected period, never a full-calendar claim. */
export function sampleTravelDates(query: FlightQuery, start: string, end: string): { departureDate: string; returnDate: string }[] {
  const first = dateStamp(start), last = dateStamp(end)
  if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last) return []
  const span = Math.floor((last - first) / DAY)
  const departures = Array.from({ length: Math.min(span + 1, 1100) }, (_, i) => first + i * DAY).filter(stamp => !query.departureWeekdays?.length || query.departureWeekdays.includes(new Date(stamp).getUTCDay()))
  const used = new Set<string>()
  return [.1, .45, .8].flatMap((fraction, index) => {
    const target = first + Math.round(span * fraction) * DAY
    const targetDuration = [query.minDays, Math.round((query.minDays + query.maxDays) / 2), query.maxDays][index]
    const durations = Array.from({ length: query.maxDays - query.minDays + 1 }, (_, i) => query.minDays + i).sort((a, b) => Math.abs(a - targetDuration) - Math.abs(b - targetDuration) || a - b)
    for (const departure of [...departures].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)) for (const duration of durations) {
      const returning = departure + duration * DAY
      if (returning > last || (query.returnWeekdays?.length && !query.returnWeekdays.includes(new Date(returning).getUTCDay()))) continue
      const pair = { departureDate: iso(departure), returnDate: iso(returning) }
      const key = `${pair.departureDate}:${pair.returnDate}`
      if (!used.has(key)) { used.add(key); return [pair] }
    }
    return []
  })
}
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
}
export function flightPeriodLabel(query: Pick<FlightQuery, 'startMonth' | 'endMonth' | 'horizonMonths' | 'departureDate' | 'returnDate'>): string {
  if (query.departureDate && query.returnDate) return `${query.departureDate.split('-').reverse().join('/')} a ${query.returnDate.split('-').reverse().join('/')}`
  return query.startMonth && query.endMonth ? `${monthLabel(query.startMonth)} a ${monthLabel(query.endMonth)}` : `próximos ${query.horizonMonths} meses`
}
export function weekdayLabel(days?: number[]): string { return days?.length ? WEEKDAYS.filter(day => days.includes(day.value)).map(day => day.label.toLowerCase()).join(', ') : 'qualquer dia' }
