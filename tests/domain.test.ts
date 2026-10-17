import { describe, expect, it } from 'vitest'
import { findAirport, getBaseline, getPriceDrop, haversineKm, parseIata, validateMonitor } from '../src/shared/domain.ts'
import type { FlightQuery, Monitor, Observation, Offer } from '../src/shared/types.ts'

function observation(observedAt: string, price: number, complete = true): Observation {
  const offer: Offer = {
    id: observedAt, kind: 'flight', title: 'Viagem', price, currency: 'BRL',
    details: [], observedAt, provider: 'Teste', confirmed: true,
  }
  return { id: observedAt, monitorId: 'test', observedAt, price, currency: 'BRL', offer, complete }
}

function monitor(): Monitor {
  return {
    id: 'test', kind: 'flight', name: 'Europa flexível',
    query: {
      origin: 'GRU', destination: 'Europa', minDays: 10, maxDays: 20,
      horizonMonths: 12, adults: 1, allowOpenJaw: true,
    },
    rule: { dropPercent: 20, windowDays: 60 },
    channels: { telegram: true }, enabled: true, createdAt: '2026-10-17T12:00:00.000Z',
  }
}

describe('historical baseline', () => {
  it('uses a daily minimum so polling frequency does not bias the historical average', () => {
    const result = getBaseline([
      observation('2026-10-15T12:00:00Z', 500_000),
      observation('2026-10-15T20:00:00Z', 400_000),
      observation('2026-10-16T12:00:00Z', 300_000),
      observation('2026-10-17T12:00:00Z', 100_000),
    ], 30, '2026-10-17T15:00:00Z')
    expect(result).toEqual({ mean: 350_000, validDays: 2, windowDays: 30 })
  })

  it('excludes the current São Paulo day rather than the current UTC date', () => {
    const result = getBaseline([
      observation('2026-10-16T20:00:00Z', 400_000),
      observation('2026-10-17T01:00:00Z', 300_000), // Still October 16 in São Paulo.
      observation('2026-10-17T04:00:00Z', 100_000), // October 17 in São Paulo.
    ], 1, '2026-10-17T15:00:00Z')
    expect(result).toEqual({ mean: 300_000, validDays: 1, windowDays: 1 })
  })

  it('uses the requested time zone even when UTC has rolled over first', () => {
    const result = getBaseline([
      observation('2026-10-15T14:00:00Z', 300_000),
      observation('2026-10-16T14:00:00Z', 200_000),
    ], 1, '2026-10-17T01:00:00Z')
    expect(result).toEqual({ mean: 300_000, validDays: 1, windowDays: 1 })
  })

  it('ignores incomplete runs, invalid amounts, missing dates and observations outside the window', () => {
    const result = getBaseline([
      observation('2026-10-15T12:00:00Z', 400_001),
      observation('2026-10-16T12:00:00Z', 400_000),
      observation('2026-10-16T15:00:00Z', 50_000, false),
      observation('2026-10-15T15:00:00Z', -1),
      observation('2026-10-15T16:00:00Z', 0),
      observation('2026-10-15T17:00:00Z', 99.9),
      observation('2026-10-15T18:00:00Z', Number.NaN),
      observation('', 10),
      observation('2026-10-14T12:00:00Z', 10),
      observation('2026-10-18T12:00:00Z', 10),
    ], 2, '2026-10-17T15:00:00Z')
    expect(result).toEqual({ mean: 400_001, validDays: 2, windowDays: 2 })
  })

  it('does not treat missing days as zero fares and has no synthetic baseline', () => {
    expect(getBaseline([], 60, '2026-10-17T12:00:00Z').mean).toBeNull()
    expect(getBaseline([observation('2026-10-15T12:00:00Z', 400_000)], 60,
      '2026-10-17T12:00:00Z')).toEqual({ mean: 400_000, validDays: 1, windowDays: 60 })
    expect(getPriceDrop(300_000, 400_000)).toBe(25)
    expect(getPriceDrop(500_000, 400_000)).toBe(-25)
    expect(getPriceDrop(300_000, 0)).toBeNull()
    expect(getPriceDrop(300_000, null)).toBeNull()
    expect(getPriceDrop(0, 300_000)).toBeNull()
  })
})

describe('geographical flexibility', () => {
  it('normalizes IATA codes without treating a city name as an airport code', () => {
    expect(parseIata(' gru ')).toBe('GRU')
    expect(() => parseIata('Paris')).toThrow('três letras')
    expect(() => parseIata('G RU')).toThrow('três letras')
    expect(findAirport('cdg')?.country).toBe('França')
    expect(findAirport('ZZZ')).toBeUndefined()
  })

  it('calculates distances in km and accepts an omitted radius for open-jaw trips', () => {
    const paris = findAirport('CDG')!
    const orly = findAirport('ORY')!
    expect(haversineKm(paris, paris)).toBe(0)
    expect(haversineKm(paris, orly)).toBeGreaterThan(30)
    expect(haversineKm(paris, orly)).toBeLessThan(40)
    expect((validateMonitor(monitor()).query as FlightQuery).maxAirportDistanceKm).toBeUndefined()
  })

  it('rejects a contradictory route and does not silently allow airports outside the chosen radius', () => {
    const value = monitor()
    value.query = { ...value.query, arrivalAirport: 'CDG', departureAirport: 'MAD', maxAirportDistanceKm: 100 } as FlightQuery
    expect(() => validateMonitor(value)).toThrow('distância máxima')
    value.query = { ...value.query, maxAirportDistanceKm: -1 } as FlightQuery
    expect(() => validateMonitor(value)).toThrow('maior que zero')
    value.query = { ...value.query, maxAirportDistanceKm: undefined, allowOpenJaw: false } as FlightQuery
    expect(() => validateMonitor(value)).toThrow('Ative aeroportos diferentes')
  })
})

describe('monitor validation', () => {
  it('preserves independent monitor IDs and normalizes user input', () => {
    const value = monitor()
    value.name = ' Europa '
    ;(value.query as FlightQuery).origin = ' gru '
    value.channels.email = ' eu@example.com '
    expect(validateMonitor(value)).toMatchObject({
      id: 'test', name: 'Europa', query: { origin: 'GRU' }, channels: { email: 'eu@example.com' },
    })
  })

  it('rejects invalid duration ranges, partial dates, nonexistent dates and invalid percentages', () => {
    const value = monitor()
    ;(value.query as FlightQuery).minDays = 21
    expect(() => validateMonitor(value)).toThrow('mínima não pode superar')
    ;(value.query as FlightQuery).minDays = 10
    ;(value.query as FlightQuery).departureDate = '2027-02-28'
    expect(() => validateMonitor(value)).toThrow('duas datas')
    ;(value.query as FlightQuery).returnDate = '2027-02-30'
    expect(() => validateMonitor(value)).toThrow('inválida')
    ;(value.query as FlightQuery).returnDate = '2027-03-10'
    value.rule.dropPercent = 100
    expect(() => validateMonitor(value)).toThrow('menor que 100%')
    value.rule.dropPercent = 20
    value.rule.windowDays = 0
    expect(() => validateMonitor(value)).toThrow('janela do histórico')
  })

  it('accepts undated hotel patterns while checking exact stay date order', () => {
    const value: Monitor = {
      ...monitor(), kind: 'hotel', name: 'Hotel',
      query: { property: 'Fasano Boa Vista', pattern: 'weekend', adults: 2 },
    }
    expect(validateMonitor(value).query).toMatchObject({ pattern: 'weekend' })
    value.query = { ...value.query, checkIn: '2027-01-05', checkOut: '2027-01-04' }
    expect(() => validateMonitor(value)).toThrow('posterior')
    value.query = { property: 'Fasano', pattern: 'invalid', adults: 2 } as never
    expect(() => validateMonitor(value)).toThrow('fins de semana')
  })
})
