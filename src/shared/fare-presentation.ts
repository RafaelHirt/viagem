import { shortAirportLabel } from './airports.ts'
import type { Offer } from './types.ts'

export interface PresentedFare {
  priceCents: number
  caption: string
  context: string
  passengers: number | null
  totalCents?: number
  /** A group total divided by its adult count is an average, not an individual quote. */
  perPersonCents?: number
}

export interface PresentedFlightLeg {
  direction: 'outbound' | 'return'
  label: string
  route: string
  departure: string | null
  arrival: string | null
  duration: string | null
  stops: string | null
}

export interface PresentedFlightFacts {
  route: string | null
  returnRoute: string | null
  dates: string | null
  duration: string | null
  returnNotice: string | null
  legs: PresentedFlightLeg[]
}

const validCount = (value: number | undefined): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0

const adultsLabel = (count: number) => `${count} ${count === 1 ? 'adulto' : 'adultos'}`
const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)

/** Only explicit provider metadata determines whether a price is individual or a group total. */
export function presentFare(offer: Offer, fallbackAdults?: number): PresentedFare {
  const passengers = validCount(offer.passengers) ? offer.passengers
    : validCount(fallbackAdults) ? fallbackAdults : null
  const result: PresentedFare = {
    priceCents: offer.price,
    caption: 'Valor ainda sem total confirmado',
    context: passengers ? `Pesquisa para ${adultsLabel(passengers)} · confirme o total no vendedor` : 'Confirme o total no vendedor',
    passengers,
  }
  if (!Number.isSafeInteger(offer.price) || offer.price <= 0) return result

  if (offer.priceBasis === 'per-person') {
    result.caption = 'Por pessoa'
    result.perPersonCents = offer.price
    result.context = 'Confirme o valor final no vendedor'
    if (passengers && Number.isSafeInteger(offer.price * passengers)) {
      result.totalCents = offer.price * passengers
      result.context = `${brl(result.totalCents)} no total para ${adultsLabel(passengers)}`
    }
  } else if (offer.priceBasis === 'group-total') {
    result.totalCents = offer.price
    result.caption = passengers ? `Total para ${adultsLabel(passengers)}` : 'Total informado'
    result.context = 'Confirme o valor final no vendedor'
    if (passengers) {
      result.perPersonCents = Math.round(offer.price / passengers)
      result.context = `Média de ${brl(result.perPersonCents)} por adulto`
    }
  }
  return result
}

/** Flight durations come from the observed itinerary, never from a map travel estimate. */
export function formatFlightDuration(minutes: number | undefined): string | null {
  if (!Number.isSafeInteger(minutes) || Number(minutes) <= 0) return null
  const hours = Math.floor(minutes! / 60)
  const remainder = minutes! % 60
  return hours ? `${hours}h${remainder ? ` ${remainder}min` : ''}` : `${remainder}min`
}

interface CalendarDate { text: string; timestamp: number }

/** Preserve the source's calendar day; converting a local flight time to UTC can move it. */
function calendarDate(value: string | undefined): CalendarDate | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { text: `${dayText}/${monthText}/${yearText}`, timestamp }
}

function flightTime(value: string | undefined): string | null {
  const day = calendarDate(value)
  if (!day) return null
  const time = value?.match(/[ T](\d{2}):(\d{2})/)
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) return day.text
  return `${day.text} às ${time[1]}:${time[2]}`
}

function airportLabel(code: string | undefined): string | null {
  if (!code?.trim()) return null
  const normalized = code.trim().toUpperCase()
  return shortAirportLabel(normalized)
}

function routeLabel(origin: string | undefined, destination: string | undefined): string | null {
  const from = airportLabel(origin), to = airportLabel(destination)
  return from && to ? `${from} → ${to}` : to || from
}

/** Facts describe the returned offer; search preferences must not become invented itinerary details. */
export function presentFlightFacts(offer: Offer): PresentedFlightFacts {
  const legs: PresentedFlightLeg[] = (offer.flightLegs ?? []).flatMap((leg) => {
    const first = leg.segments[0], last = leg.segments.at(-1)
    if (!first || !last) return []
    const route = routeLabel(first.origin, last.destination)
    if (!route) return []
    return [{
      direction: leg.direction,
      label: leg.direction === 'return' ? 'Volta' : 'Ida',
      route,
      departure: flightTime(first.departureTime),
      arrival: flightTime(last.arrivalTime),
      duration: formatFlightDuration(leg.durationMinutes),
      stops: Number.isSafeInteger(leg.stops) && Number(leg.stops) >= 0
        ? leg.stops === 0 ? 'Sem escalas' : `${leg.stops} ${leg.stops === 1 ? 'escala' : 'escalas'}` : null,
    }]
  })
  const outbound = offer.flightLegs?.find((leg) => leg.direction === 'outbound')
  const inbound = offer.flightLegs?.find((leg) => leg.direction === 'return')
  const outboundDate = calendarDate(offer.outboundDate ?? outbound?.segments[0]?.departureTime)
  const returnDate = calendarDate(offer.returnDate ?? inbound?.segments[0]?.departureTime)
  const requestedReturn = offer.itineraryStatus !== 'complete' && offer.itineraryStatus !== 'round-trip-dates'
  const dates = [outboundDate ? `Ida ${outboundDate.text}` : null,
    returnDate ? `${requestedReturn ? 'volta prevista' : 'volta'} ${returnDate.text}` : null].filter(Boolean).join(' · ') || null
  const days = outboundDate && returnDate ? (returnDate.timestamp - outboundDate.timestamp) / 86_400_000 : null
  const duration = days !== null && Number.isSafeInteger(days) && days > 0
    ? `${days} ${days === 1 ? 'dia' : 'dias'} ${requestedReturn ? days === 1 ? 'previsto' : 'previstos' : 'de viagem'}` : null
  const returnNotice = offer.itineraryStatus === 'complete' ? null
    : offer.itineraryStatus === 'outbound-only' ? 'Volta solicitada; voo ainda não selecionado'
      : offer.itineraryStatus === 'round-trip-dates' ? 'Voos de volta a confirmar no vendedor'
        : returnDate ? 'Volta ainda não confirmada' : 'Volta não informada'
  return {
    route: legs.find((leg) => leg.direction === 'outbound')?.route ?? routeLabel(offer.origin, offer.arrivalAirport),
    returnRoute: legs.find((leg) => leg.direction === 'return')?.route
      ?? (offer.departureAirport && offer.origin ? routeLabel(offer.departureAirport, offer.origin) : null),
    dates,
    duration,
    returnNotice,
    legs,
  }
}
