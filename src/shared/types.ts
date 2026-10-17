export interface GeoArea {
  lat: number
  lon: number
  radiusKm: number
  label?: string
}

export type TravelMode = 'train' | 'car' | 'flight'
export interface TripPlan {
  countryCount: number
  areas: GeoArea[]
  countryCodes: string[]
  transport: TravelMode
  maxLegHours: number
  flexibleOrder: boolean
}
export interface TripStop {
  airportCode: string
  city: string
  country: string
  countryCode: string
  lat: number
  lon: number
}
export interface TripLeg {
  distanceKm: number
  minMinutes: number
  maxMinutes: number
}
export interface TripPreview {
  transport: TravelMode
  status: 'ready' | 'empty' | 'insufficient-countries' | 'no-route'
  stops: TripStop[]
  legs: TripLeg[]
  countryCount: number
  message: string
}

export interface FlightQuery {
  origin: string
  destination: string
  arrivalAirport?: string
  departureAirport?: string
  departureDate?: string
  returnDate?: string
  minDays: number
  maxDays: number
  horizonMonths: number
  maxAirportDistanceKm?: number
  adults: number
  allowOpenJaw: boolean
  area?: GeoArea
  tripPlan?: TripPlan
}

export interface HotelSuggestion {
  id: string
  name: string
  location: string
  source: 'booking'
  verified: true
  lat?: number
  lon?: number
  url?: string
}

export interface HotelQuery {
  property: string
  propertyId?: string
  propertyVerified?: boolean
  checkIn?: string
  checkOut?: string
  pattern: 'weekend' | 'weekdays' | 'both'
  adults: number
  horizonMonths?: number
}

export interface Monitor {
  id: string
  kind: 'flight' | 'hotel'
  name: string
  query: FlightQuery | HotelQuery
  rule: { dropPercent: number; windowDays: number }
  channels: { email?: string; telegram: boolean }
  enabled: boolean
  createdAt: string
}

export interface FlightSegment {
  origin: string
  destination: string
  departureTime?: string
  arrivalTime?: string
  airline?: string
  flightNumber?: string
}

export interface FlightLeg {
  direction: 'outbound' | 'return'
  segments: FlightSegment[]
  durationMinutes?: number
  stops?: number
}

/** Prices are integer Brazilian real cents. Unknown price bases must not be multiplied. */
export interface Offer {
  id: string
  kind: 'flight' | 'hotel'
  title: string
  price: number
  currency: 'BRL'
  passengers?: number
  priceBasis?: 'per-person' | 'group-total' | 'unknown'
  itineraryStatus?: 'outbound-only' | 'round-trip-dates' | 'complete'
  flightLegs?: FlightLeg[]
  outboundDate?: string
  returnDate?: string
  nights?: number
  origin?: string
  arrivalAirport?: string
  departureAirport?: string
  airline?: string
  url?: string
  details: string[]
  observedAt: string
  provider: string
  confirmed: boolean
  tripPreview?: TripPreview
}

export interface Observation {
  id: string
  monitorId: string
  observedAt: string
  price: number
  currency: 'BRL'
  offer: Offer
  complete: boolean
}

export interface Coverage {
  complete: boolean
  description: string
  queries: number
  requestedHorizonMonths?: number
  availableHorizonMonths?: number
}

export interface ExploreResult {
  offers: Offer[]
  coverage: Coverage
  warnings: string[]
  search?: {
    received: number
    matched: number
    sampled: boolean
    combinations: number
    message: string
  }
}

export interface Status {
  providers: {
    flights: { configured: boolean; name: string }
    hotels: { configured: boolean; name: string }
  }
  notifications: { email: boolean; telegram: boolean }
  authConfigured: boolean
  authConfiguration?: 'missing' | 'too-short' | 'ready'
  authenticated: boolean
  development?: boolean
  collection?: {
    enabled: boolean
    minimumHistoryDays: number
    maxMonitorsPerRun: number
  }
}

export interface MonitorSummary {
  monitor: Monitor
  baseline: {
    mean: number | null
    validDays: number
    dropPercent: number | null
    windowDays: number
  }
  latest: Offer | null
}
