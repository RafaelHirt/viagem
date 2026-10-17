import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explore, getProviderStatus, ProviderError } from '../server/providers';
import type { FlightQuery } from '../src/shared/types';

const query: FlightQuery = {
  origin: 'GRU', destination: 'Europa', arrivalAirport: 'CDG', departureAirport: 'CDG',
  departureDate: '2027-03-10', returnDate: '2027-03-21',
  minDays: 10, maxDays: 20, horizonMonths: 12, adults: 1, allowOpenJaw: true,
};

const fixedData = {
  search_parameters: { currency: 'BRL' },
  search_metadata: { google_flights_url: 'https://www.google.com/travel/flights?curr=BRL' },
  best_flights: [{
    price: 3210.55,
    departure_token: 'opaque-next-leg',
    flights: [{ departure_airport: { id: 'GRU', time: '2027-03-10 18:00' }, arrival_airport: { id: 'CDG' }, airline: 'Airline' }],
  }],
};

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('real price provider adapter', () => {
  beforeEach(() => {
    vi.stubEnv('SERPAPI_API_KEY', 'private-test-key');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports missing setup and does not call the upstream service without a key', async () => {
    vi.stubEnv('SERPAPI_API_KEY', '');
    expect(getProviderStatus().flights.configured).toBe(false);
    expect(getProviderStatus().hotels).toEqual({ name: 'Booking', configured: false });
    await expect(explore('flight', query)).rejects.toMatchObject({ code: 'PROVIDER_SETUP_REQUIRED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalizes BRL amounts into integer cents, preserves source links and keeps candidates unconfirmed', async () => {
    vi.mocked(fetch).mockResolvedValue(response(fixedData));
    const result = await explore('flight', query);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({ price: 321055, currency: 'BRL', confirmed: false, arrivalAirport: 'CDG' });
    expect(result.offers[0].url).toBe('https://www.google.com/travel/flights?curr=BRL');
    expect(JSON.stringify(result)).not.toContain('private-test-key');
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.hostname).toBe('serpapi.com');
    expect(url.searchParams.get('type')).toBe('1');
    expect(url.searchParams.get('currency')).toBe('BRL');
    expect(url.searchParams.get('outbound_date')).toBe(query.departureDate);
    expect(url.searchParams.get('api_key')).toBe('private-test-key');
  });

  it('sends exact open-jaw itineraries using documented per-leg dates', async () => {
    vi.mocked(fetch).mockResolvedValue(response(fixedData));
    await explore('flight', { ...query, departureAirport: 'AMS', maxAirportDistanceKm: 600 });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get('type')).toBe('3');
    expect(url.searchParams.has('outbound_date')).toBe(false);
    expect(url.searchParams.has('return_date')).toBe(false);
    expect(JSON.parse(url.searchParams.get('multi_city_json') || 'null')).toEqual([
      { departure_id: 'GRU', arrival_id: 'CDG', date: '2027-03-10' },
      { departure_id: 'AMS', arrival_id: 'GRU', date: '2027-03-21' },
    ]);
  });

  it('rejects an incompatible airport radius before consuming a provider request', async () => {
    await expect(explore('flight', { ...query, departureAirport: 'AMS', maxAirportDistanceKm: 100 })).rejects.toMatchObject({ code: 'AIRPORT_DISTANCE_EXCEEDED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not return provider error text, URL credentials, or network exception details', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: 'private-test-key https://serpapi.com/search?api_key=private-test-key' }));
    const rejected = await explore('flight', query).catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(ProviderError);
    expect(String(rejected)).not.toContain('private-test-key');
    expect(String(rejected)).not.toContain('https://');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('https://serpapi.com/search.json?api_key=private-test-key'));
    await expect(explore('flight', query)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('rejects mismatched currencies rather than labeling foreign amounts as BRL', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_parameters: { currency: 'USD' } }));
    await expect(explore('flight', query)).rejects.toMatchObject({ code: 'PROVIDER_INVALID_CURRENCY' });
  });

  it('only returns demonstrated destination matches from flexible discovery and declares partial coverage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T13:00:00Z'));
    const good = { price: 2500, country: 'France', name: 'Paris', departure_airport_code: 'GRU', arrival_airport_code: 'CDG', start_date: '2026-11-10', end_date: '2026-11-21', flight_link: 'https://www.google.com/travel/flights?id=source' };
    vi.mocked(fetch).mockResolvedValue(response({ deals: [good,
      { ...good, country: 'Kenya', name: 'Nairobi', arrival_airport_code: 'NBO' },
      { ...good, departure_airport_code: 'JFK' },
      { ...good, country: undefined, name: 'Unknown', arrival_airport_code: 'ZZZ' },
      { ...good, end_date: '2026-11-12' },
    ] }));
    const result = await explore('flight', { ...query, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({ price: 250000, arrivalAirport: 'CDG', departureAirport: 'CDG', confirmed: false });
    expect(result.coverage).toMatchObject({ complete: false, queries: 1, requestedHorizonMonths: 12 });
    expect(result.coverage.availableHorizonMonths).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes('4 resultado(s)'))).toBe(true);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get('engine')).toBe('google_flights_deals');
    expect(url.searchParams.get('trip_length')).toBe('10,20');
    expect(url.searchParams.has('query')).toBe(false);
  });

  it('does not invent multicity matches for fixed different airports with flexible dates', async () => {
    const result = await explore('flight', { ...query, departureAirport: 'AMS', departureDate: undefined, returnDate: undefined });
    expect(result.offers).toEqual([]);
    expect(result.coverage).toMatchObject({ complete: false, queries: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not expose an authenticated API URL as a purchase link', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_metadata: { google_flights_url: 'https://serpapi.com/search.json?api_key=private-test-key' } }));
    const result = await explore('flight', query);
    expect(result.offers[0].url).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('private-test-key');
  });

  it('explains the Booking adapter prerequisite without claiming a working connection', async () => {
    await expect(explore('hotel', { property: 'Fasano Boa Vista', pattern: 'weekend', adults: 2 })).rejects.toMatchObject({ code: 'BOOKING_ADAPTER_PENDING' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
