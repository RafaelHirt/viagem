import { describe, expect, it } from 'vitest'
import { formatFlightDuration, needsPassengerRecheck, presentFare, presentFlightFacts } from '../src/shared/fare-presentation.ts'
import type { Offer } from '../src/shared/types.ts'

const offer: Offer = {
  id: 'fare', kind: 'flight', title: 'Uma oferta', price: 985000, currency: 'BRL',
  origin: 'GYN', arrivalAirport: 'CDG', outboundDate: '2027-03-10', returnDate: '2027-03-21',
  details: [], observedAt: '2026-10-17T12:00:00Z', provider: 'SerpApi', confirmed: false,
}

describe('fare presentation', () => {
  it('requires rechecking legacy group fares and rejects a verified fare for a different group size', () => {
    expect(needsPassengerRecheck({ ...offer, passengers: 2 }, 2)).toBe(true)
    expect(needsPassengerRecheck({ ...offer, passengers: 2, passengerValidation: 'source-verified' }, 2)).toBe(false)
    expect(needsPassengerRecheck({ ...offer, passengers: 1, passengerValidation: 'source-verified' }, 2)).toBe(true)
    expect(needsPassengerRecheck({ ...offer, passengers: 2, passengerValidation: 'source-verified' }, 1)).toBe(true)
  })
  it('does not turn a legacy price into a group total or per-person fare', () => {
    const result = presentFare(offer, 2)
    expect(result).toMatchObject({
      priceCents: 985000, passengers: 2, caption: 'Valor ainda sem total confirmado',
      context: 'Pesquisa para 2 adultos · confirme o total no vendedor',
    })
    expect(result.totalCents).toBeUndefined()
    expect(result.perPersonCents).toBeUndefined()
    expect(presentFare({ ...offer, priceBasis: 'unknown', passengers: 2 }).totalCents).toBeUndefined()
  })

  it('uses an explicit group total without multiplying it by the selected adults', () => {
    const result = presentFare({ ...offer, passengers: 2, priceBasis: 'group-total' }, 3)
    expect(result).toMatchObject({ caption: 'Total para 2 adultos', passengers: 2, totalCents: 985000, perPersonCents: 492500 })
    expect(result.context).toContain('por adulto')
  })

  it('calculates a total for two adults only when the source states an individual price', () => {
    const result = presentFare({ ...offer, passengers: 2, priceBasis: 'per-person' })
    expect(result).toMatchObject({ caption: 'Por pessoa', passengers: 2, perPersonCents: 985000, totalCents: 1970000 })
    expect(result.context).toContain('no total para 2 adultos')
  })

  it('does not derive totals from invalid counts or unsafe monetary values', () => {
    expect(presentFare({ ...offer, passengers: Number.NaN, priceBasis: 'per-person' }, 0).totalCents).toBeUndefined()
    expect(presentFare({ ...offer, price: Number.MAX_SAFE_INTEGER, passengers: 2, priceBasis: 'per-person' }).totalCents).toBeUndefined()
    expect(presentFare({ ...offer, price: -100, passengers: 2, priceBasis: 'group-total' }).totalCents).toBeUndefined()
  })
})

describe('observed itinerary presentation', () => {
  it('shows years and marks dates requested for an unselected return flight', () => {
    const result = presentFlightFacts({ ...offer, itineraryStatus: 'outbound-only' })
    expect(result.route).toContain('Goiânia (GYN) → Paris (CDG)')
    expect(result.dates).toBe('Ida 10/03/2027 · volta prevista 21/03/2027')
    expect(result.duration).toBe('11 dias previstos')
    expect(result.returnNotice).toBe('Horários da volta a confirmar')
    expect(presentFlightFacts(offer).returnNotice).toBe('Volta ainda não confirmada')
  })

  it('uses returned segments for actual routes, local times, flight lengths and stops', () => {
    const result = presentFlightFacts({
      ...offer, origin: 'GRU', arrivalAirport: 'LHR', itineraryStatus: 'complete',
      flightLegs: [{ direction: 'outbound', durationMinutes: 1025, stops: 1, segments: [
        { origin: 'GYN', destination: 'GRU', departureTime: '2027-03-10 18:00', arrivalTime: '2027-03-10 19:40' },
        { origin: 'GRU', destination: 'CDG', departureTime: '2027-03-10 22:00', arrivalTime: '2027-03-11 15:05' },
      ] }, { direction: 'return', durationMinutes: 720, stops: 0, segments: [
        { origin: 'AMS', destination: 'GYN', departureTime: '2027-03-21 23:30', arrivalTime: '2027-03-22 05:30' },
      ] }],
    })
    expect(result.route).toBe('Goiânia (GYN) → Paris (CDG)')
    expect(result.dates).toBe('Ida 10/03/2027 · volta 21/03/2027')
    expect(result.duration).toBe('11 dias de viagem')
    expect(result.returnNotice).toBeNull()
    expect(result.legs[0]).toMatchObject({ duration: '17h 5min', stops: '1 escala', departure: '10/03/2027 às 18:00' })
    expect(result.legs[1]).toMatchObject({ label: 'Volta', route: 'Amsterdã (AMS) → Goiânia (GYN)', stops: 'Sem escalas' })
    expect(result.returnRoute).toBe('Amsterdã (AMS) → Goiânia (GYN)')
  })

  it('shows a different requested return airport without inventing return segments', () => {
    const result = presentFlightFacts({ ...offer, departureAirport: 'MAD', itineraryStatus: 'outbound-only' })
    expect(result.route).toContain('Paris (CDG)')
    expect(result.returnRoute).toContain('(MAD) → Goiânia (GYN)')
    expect(result.returnNotice).toBe('Horários da volta a confirmar')
    expect(result.legs).toEqual([])
  })

  it('does not present malformed dates or invalid durations as a real trip length', () => {
    expect(presentFlightFacts({ ...offer, returnDate: '2027-03-09' }).duration).toBeNull()
    expect(presentFlightFacts({ ...offer, returnDate: '2027-02-30' }).duration).toBeNull()
    for (const invalid of [undefined, 0, -60, Number.NaN, Number.POSITIVE_INFINITY, 3.5]) {
      expect(formatFlightDuration(invalid)).toBeNull()
    }
    expect(formatFlightDuration(60)).toBe('1h')
    expect(formatFlightDuration(45)).toBe('45min')
  })
})
