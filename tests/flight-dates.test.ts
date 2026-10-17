import { describe, expect, it } from 'vitest'
import { flightWindow, matchesTravelDates, sampleTravelDates } from '../src/shared/flight-dates'
import { flightDraftFromQuery, flightQueryFromDraft } from '../src/shared/flight-draft'
import { validateMonitor } from '../src/shared/domain'
import { shortAirportLabel } from '../src/shared/airports'
import type { FlightQuery } from '../src/shared/types'
const query: FlightQuery = { origin: 'GYN', destination: 'Europa', adults: 2, minDays: 2, maxDays: 2, horizonMonths: 12, allowOpenJaw: true, startMonth: '2027-02', endMonth: '2027-10', departureWeekdays: [5], returnWeekdays: [0] }
const input = (patch: Partial<FlightQuery>) => ({ id: 'test', kind: 'flight', name: 'Fim de semana', createdAt: '2026-10-17T12:00:00Z', enabled: true, channels: { telegram: false }, rule: { dropPercent: 20, windowDays: 60 }, query: { ...query, ...patch } })
describe('travel dates and stored preferences', () => {
  it('uses complete month boundaries including leap February and the traveller timezone', () => {
    expect(flightWindow(query, new Date('2026-10-17T18:00:00Z'))).toEqual({ start: '2027-02-01', end: '2027-10-31' })
    expect(flightWindow({ ...query, startMonth: '2028-02', endMonth: '2028-02' }, new Date('2026-10-17'))).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(flightWindow({ ...query, startMonth: undefined, endMonth: undefined }, new Date('2026-10-18T01:00:00Z')).start).toBe('2026-10-18')
  })
  it('generates Friday to Sunday pairs across the chosen period, all within the end month', () => {
    const pairs = sampleTravelDates(query, '2027-02-01', '2027-10-31')
    expect(pairs).toHaveLength(3)
    expect(new Set(pairs.map(pair => pair.departureDate)).size).toBe(3)
    for (const pair of pairs) {
      expect(new Date(pair.departureDate).getUTCDay()).toBe(5)
      expect(new Date(pair.returnDate).getUTCDay()).toBe(0)
      expect(matchesTravelDates(query, pair.departureDate, pair.returnDate, new Date('2026-10-17'))).toBe(true)
    }
    expect(pairs[0].departureDate < pairs[1].departureDate && pairs[1].departureDate < pairs[2].departureDate).toBe(true)
    expect(matchesTravelDates(query, '2027-10-30', '2027-11-01', new Date('2026-10-17'))).toBe(false)
    expect(sampleTravelDates({ ...query, minDays: 1, maxDays: 1 }, '2027-02-01', '2027-10-31')).toEqual([])
  })
  it('rejects incomplete/reversed periods and contradictory exact dates or weekdays', () => {
    for (const patch of [{ endMonth: undefined }, { startMonth: '2027-13' }, { endMonth: '2027-01' }, { endMonth: '2029-02' }, { departureWeekdays: [] }, { returnWeekdays: [7] }, { departureWeekdays: [5, 5] }]) expect(() => validateMonitor(input(patch))).toThrow()
    expect(() => validateMonitor(input({ departureDate: '2027-02-01', returnDate: '2027-02-03' }))).toThrow('dias da semana')
    expect(() => validateMonitor(input({ departureDate: '2027-02-05', returnDate: '2027-02-08' }))).toThrow('duração')
    expect(() => validateMonitor(input({ departureDate: '2027-01-29', returnDate: '2027-01-31' }))).toThrow('dentro do período')
    expect(validateMonitor(input({ departureDate: '2027-02-05', returnDate: '2027-02-07' })).query).toMatchObject(query)
  })
  it('loads an editable alert and saves every date and airport preference without stale hidden dates', () => {
    const original = { ...query, arrivalAirport: 'CDG', departureAirport: 'AMS' }
    const draft = flightDraftFromQuery(original)
    expect(draft).toMatchObject({ dateMode: 'months', weekdayMode: 'friday-sunday', adults: '2', startMonth: '2027-02', endMonth: '2027-10' })
    expect(flightQueryFromDraft(draft)).toEqual(original)
    const exact = flightQueryFromDraft({ ...draft, dateMode: 'exact', departureDate: '2027-03-02', returnDate: '2027-03-07' })
    expect(exact).toMatchObject({ minDays: 5, maxDays: 5, departureDate: '2027-03-02', returnDate: '2027-03-07' })
    expect(exact.startMonth).toBeUndefined(); expect(exact.departureWeekdays).toBeUndefined()
    const horizon = flightQueryFromDraft({ ...draft, dateMode: 'horizon', weekdayMode: 'any' })
    expect(horizon.startMonth).toBeUndefined(); expect(horizon.departureDate).toBeUndefined(); expect(horizon.departureWeekdays).toBeUndefined()
  })
  it('names MXP for the city it serves, without requiring airport code knowledge', () => {
    expect(shortAirportLabel('MXP')).toBe('Milão–Malpensa (MXP)')
  })
  it('keeps the Friday–Sunday preset at two days and preserves longer weekly trips as custom settings', () => {
    const draft = flightDraftFromQuery(query)
    expect(flightQueryFromDraft({ ...draft, minDays: '10', maxDays: '20', departureWeekdays: [1], returnWeekdays: [2] })).toMatchObject({ minDays: 2, maxDays: 2, departureWeekdays: [5], returnWeekdays: [0] })
    const longer = { ...query, minDays: 9, maxDays: 9 }
    expect(flightDraftFromQuery(longer).weekdayMode).toBe('custom')
    expect(flightQueryFromDraft(flightDraftFromQuery(longer))).toEqual(longer)
  })
})
