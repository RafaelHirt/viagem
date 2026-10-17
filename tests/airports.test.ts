import { describe, expect, it } from 'vitest'
import { AIRPORTS, findAirport, isAirportInArea, labelAirport, matchesRegion, searchAirports } from '../src/shared/airports.ts'
import { validateMonitor } from '../src/shared/domain.ts'
import type { FlightQuery, GeoArea, Monitor } from '../src/shared/types.ts'

const base: Monitor = {
  id: 'geo-test', name: 'Europa', kind: 'flight', enabled: true, createdAt: '2026-10-17T12:00:00Z',
  query: { origin: 'GYN', destination: 'Europa', minDays: 10, maxDays: 15, horizonMonths: 12, adults: 1, allowOpenJaw: true },
  channels: { telegram: false }, rule: { dropPercent: 20, windowDays: 60 },
}

describe('airport catalogue and discovery', () => {
  it('contains a worldwide catalogue of scheduled airports with unique valid coordinates', () => {
    expect(AIRPORTS.length).toBeGreaterThan(3000)
    expect(new Set(AIRPORTS.map((airport) => airport.code)).size).toBe(AIRPORTS.length)
    expect(AIRPORTS.every((airport) => /^[A-Z]{3}$/.test(airport.code) && Math.abs(airport.lat) <= 90 && Math.abs(airport.lon) <= 180)).toBe(true)
    for (const code of ['GYN', 'LAX', 'CDG', 'NRT', 'CPT', 'SYD']) expect(findAirport(code)).toBeDefined()
  })

  it('finds Goiânia without accents and distinguishes it from GOI in India', () => {
    expect(searchAirports('goiania')[0]?.code).toBe('GYN')
    expect(searchAirports('Goiânia')[0]?.code).toBe('GYN')
    expect(searchAirports('GOI')[0]?.code).toBe('GOI')
    expect(labelAirport('gyn')).toContain('Goiânia')
    expect(labelAirport('goi')).toContain('Índia')
    expect(labelAirport('ZZZ')).toBe('ZZZ')
  })

  it('accepts cities, airport names and common Portuguese city names', () => {
    expect(searchAirports('santa genoveva')[0]?.code).toBe('GYN')
    expect(searchAirports('Lisboa').map((airport) => airport.code)).toContain('LIS')
    expect(searchAirports('São Paulo').map((airport) => airport.code)).toContain('GRU')
    expect(searchAirports('Paris').map((airport) => airport.code)).toContain('CDG')
    expect(searchAirports('', 8)).toEqual([])
    expect(searchAirports('a', 3)).toHaveLength(3)
  })

  it('classifies destinations by their actual geography', () => {
    expect(matchesRegion(findAirport('CDG')!, 'Europa')).toBe(true)
    expect(matchesRegion(findAirport('LAX')!, 'europe')).toBe(false)
    expect(matchesRegion(findAirport('LAX')!, 'north-america')).toBe(true)
    expect(matchesRegion(findAirport('GYN')!, 'brazil')).toBe(true)
    expect(matchesRegion(findAirport('PTY')!, 'central-america')).toBe(true)
    expect(matchesRegion(findAirport('PTY')!, 'north-america')).toBe(false)
    expect(matchesRegion(findAirport('NRT')!, 'Ásia')).toBe(true)
    expect(matchesRegion(findAirport('CDG')!, 'anything unknown')).toBe(false)
  })

  it('filters airports by the circle selected on a map, including across the date line', () => {
    const area: GeoArea = { lat: 49.0097, lon: 2.5479, radiusKm: 100 }
    expect(isAirportInArea(findAirport('CDG')!, area)).toBe(true)
    expect(isAirportInArea(findAirport('ORY')!, area)).toBe(true)
    expect(isAirportInArea(findAirport('MAD')!, area)).toBe(false)
    expect(isAirportInArea({ ...findAirport('CDG')!, lat: 0, lon: -179.9 }, { lat: 0, lon: 179.9, radiusKm: 30 })).toBe(true)
    expect(isAirportInArea(findAirport('CDG')!, { ...area, lat: 91 })).toBe(false)
  })
})

describe('new search criteria validation', () => {
  it('preserves the selected map area and rejects invalid area boundaries', () => {
    const area = { lat: 49, lon: 2, radiusKm: 600, label: 'Arredores de Paris' }
    expect((validateMonitor({ ...base, query: { ...base.query, area } }).query as FlightQuery).area).toEqual(area)
    for (const invalid of [{ ...area, lat: 91 }, { ...area, lon: -181 }, { ...area, radiusKm: 0 }, { ...area, radiusKm: 20_051 }, { ...area, radiusKm: Number.NaN }]) {
      expect(() => validateMonitor({ ...base, query: { ...base.query, area: invalid } })).toThrow('área do mapa')
    }
  })

  it('preserves hotel horizons and selected property metadata while accepting legacy monitors', () => {
    const hotel = { ...base, kind: 'hotel', query: { property: 'Hotel', propertyId: '123', propertyVerified: true, pattern: 'weekend', adults: 2, horizonMonths: 6 } }
    expect(validateMonitor(hotel).query).toMatchObject({ horizonMonths: 6, propertyId: '123', propertyVerified: true })
    expect(() => validateMonitor({ ...hotel, query: { ...hotel.query, horizonMonths: 13 } })).toThrow('horizonte')
    expect(() => validateMonitor({ ...hotel, query: { property: 'Hotel', pattern: 'both', adults: 2 } })).not.toThrow()
  })
})
