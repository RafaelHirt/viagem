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
}

export interface HotelQuery {
  property: string
  propertyId?: string
  checkIn?: string
  checkOut?: string
  pattern: 'weekend' | 'weekdays' | 'both'
  adults: number
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

/** Prices throughout the application are integer Brazilian real cents. */
export interface Offer {
  id: string
  kind: 'flight' | 'hotel'
  title: string
  price: number
  currency: 'BRL'
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
}

export interface Status {
  providers: {
    flights: { configured: boolean; name: string }
    hotels: { configured: boolean; name: string }
  }
  notifications: { email: boolean; telegram: boolean }
  authConfigured: boolean
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
