import type { Offer } from './types'

export type OfferSort = 'price-asc' | 'price-desc' | 'duration' | 'departure'

/** Preserve different schedules, connections and fare conditions, even at the same price. */
export function uniqueOffers(offers: readonly Offer[]): Offer[] {
  const seen = new Set<string>()
  return offers.filter(offer => {
    const segments = offer.flightLegs?.flatMap(leg => leg.segments) ?? []
    // Sparse discovery results do not establish that two flights are identical.
    if (!segments.length) return true
    const identity = JSON.stringify([offer.kind, offer.price, offer.currency, offer.passengers, offer.priceBasis,
      offer.origin, offer.arrivalAirport, offer.departureAirport, offer.outboundDate, offer.returnDate,
      offer.flightLegs, [...offer.details].sort(), offer.provider])
    if (seen.has(identity)) return false
    seen.add(identity); return true
  })
}

export function sortOffers(offers: readonly Offer[], order: OfferSort): Offer[] {
  const duration = (offer: Offer) => offer.flightLegs?.find(leg => leg.direction === 'outbound')?.durationMinutes ?? Infinity
  return [...offers].sort((a, b) => {
    if (order === 'price-desc') return b.price - a.price
    if (order === 'duration') return (duration(a) - duration(b) || a.price - b.price)
    if (order === 'departure') return (a.outboundDate || '9999').localeCompare(b.outboundDate || '9999') || a.price - b.price
    return a.price - b.price
  })
}

export function outboundSchedule(offer: Offer): string | null {
  const leg = offer.flightLegs?.find(leg => leg.direction === 'outbound')
  const first = leg?.segments[0]?.departureTime, last = leg?.segments.at(-1)?.arrivalTime
  const time = (value?: string) => value?.match(/[ T](\d{2}:\d{2})/)?.[1]
  if (!time(first)) return null
  const days = first && last ? Math.round((Date.parse(last.slice(0, 10)) - Date.parse(first.slice(0, 10))) / 86_400_000) : 0
  return `${time(first)}${time(last) ? ` → ${time(last)}${days > 0 ? ` (+${days})` : ''}` : ''}`
}
