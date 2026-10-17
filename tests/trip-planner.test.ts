import { describe, expect, it } from 'vitest'
import { findAirport, isAirportInArea } from '../src/shared/airports'
import { estimateLeg, previewTrip } from '../src/shared/trip-planner'
import { validateMonitor } from '../src/shared/domain'
import type { FlightQuery, TripPlan } from '../src/shared/types'

export const europeanTrip = (): TripPlan => ({
  countryCount: 3, countryCodes: ['FR', 'BE', 'NL'], transport: 'train', maxLegHours: 6, flexibleOrder: true,
  areas: ['CDG', 'BRU', 'AMS'].map(code => { const airport = findAirport(code)!; return { lat: airport.lat, lon: airport.lon, radiusKm: 125 } }),
})
const monitor = { id: 'trip-test', kind: 'flight', name: 'Três países', enabled: true, createdAt: '2026-10-17T12:00:00Z',
  query: { origin: 'GYN', destination: 'Roteiro por 3 países', minDays: 10, maxDays: 20, horizonMonths: 12, adults: 2, allowOpenJaw: true }, rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false } }

describe('multi-country geographic planning', () => {
  it('visits exactly the requested countries, every marked area and respects the upper time estimate', () => {
    const plan = europeanTrip(), result = previewTrip(plan)
    expect(result.status).toBe('ready')
    expect(new Set(result.stops.map(stop => stop.countryCode))).toEqual(new Set(['FR', 'BE', 'NL']))
    expect(result.countryCount).toBe(3)
    for (const area of plan.areas) expect(result.stops.some(stop => isAirportInArea(findAirport(stop.airportCode)!, area))).toBe(true)
    expect(result.legs).toHaveLength(2)
    expect(result.legs.every(leg => leg.minMinutes > 0 && leg.minMinutes <= leg.maxMinutes && leg.maxMinutes <= 360)).toBe(true)
  })
  it('supports several countries in one bubble and optional required countries', () => {
    const plan = europeanTrip();plan.areas = [{ lat: 50.5, lon: 4.5, radiusKm: 600 }];plan.countryCodes = []
    const result = previewTrip(plan)
    expect(result.status).toBe('ready');expect(new Set(result.stops.map(stop => stop.countryCode)).size).toBe(3)
    expect(previewTrip({ ...plan, countryCodes: ['FR'] }).stops.some(stop => stop.countryCode === 'FR')).toBe(true)
  })
  it('honors a fixed country order and actual flight endpoints, including the return journey', () => {
    const plan = { ...europeanTrip(), flexibleOrder: false }
    expect(previewTrip(plan).stops.map(stop => stop.countryCode)).toEqual(['FR', 'BE', 'NL'])
    const openJaw = previewTrip(plan, 'CDG', 'AMS')
    expect(openJaw.status).toBe('ready');expect(openJaw.stops[0].airportCode).toBe('CDG');expect(openJaw.stops.at(-1)?.airportCode).toBe('AMS')
    expect(previewTrip(plan, 'AMS', 'CDG').status).toBe('no-route')
    const roundTrip = previewTrip({ ...plan, maxLegHours: 12 }, 'CDG', 'CDG')
    expect(roundTrip.status).toBe('ready');expect(roundTrip.stops.at(-1)?.airportCode).toBe('CDG');expect(roundTrip.legs).toHaveLength(3)
    expect(roundTrip.countryCount).toBe(3)
  })
  it('does not claim a route when geography, endpoints or time limits cannot satisfy the preview', () => {
    expect(previewTrip({ ...europeanTrip(), areas: [] }).status).toBe('empty')
    expect(previewTrip({ ...europeanTrip(), areas: [{ lat: -16.6, lon: -49.2, radiusKm: 100 }] }).status).toBe('insufficient-countries')
    expect(previewTrip(europeanTrip(), 'LAX', 'CDG').status).toBe('no-route')
    expect(previewTrip({ ...europeanTrip(), maxLegHours: 1 }).status).toBe('no-route')
  })
  it('makes the approximation explicit and includes airport overhead instead of treating flying time as door-to-door time', () => {
    const paris = findAirport('CDG')!, brussels = findAirport('BRU')!
    const flight = estimateLeg(paris, brussels, 'flight'), train = estimateLeg(paris, brussels, 'train')
    expect(flight.distanceKm).toBeGreaterThan(200);expect(flight.distanceKm).toBeLessThan(300)
    expect(flight.minMinutes).toBeGreaterThanOrEqual(180);expect(flight.maxMinutes).toBeGreaterThan(flight.minMinutes)
    expect(train.minMinutes).toBeLessThan(flight.minMinutes)
    expect(previewTrip(europeanTrip()).message).toContain('não foram consultados')
  })
  it('validates and preserves route criteria in stored monitors without changing legacy queries', () => {
    const result = validateMonitor({ ...monitor, query: { ...monitor.query, tripPlan: europeanTrip() } })
    expect((result.query as FlightQuery).tripPlan).toEqual(europeanTrip())
    expect((validateMonitor(monitor).query as FlightQuery).tripPlan).toBeUndefined()
    for (const patch of [{ countryCount: 1 }, { countryCount: 6 }, { areas: [] }, { countryCodes: ['ZZ'] }, { countryCodes: ['FR', 'FR'] }, { maxLegHours: 0 }, { transport: 'teleport' }, { flexibleOrder: false, countryCodes: [] }]) {
      expect(() => validateMonitor({ ...monitor, query: { ...monitor.query, tripPlan: { ...europeanTrip(), ...patch } } })).toThrow()
    }
    expect(() => validateMonitor({ ...monitor, query: { ...monitor.query, area: europeanTrip().areas[0], tripPlan: europeanTrip() } })).toThrow('área simples')
  })
})
