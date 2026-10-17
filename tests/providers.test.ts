import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explore, getProviderStatus, ProviderError } from '../server/providers';
import type { FlightQuery } from '../src/shared/types';
import { findAirport } from '../src/shared/airports';
import { linkedAdults } from '../server/flight-passengers';

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

  it('preserves country and area constraints when attaching a geographic itinerary to a fare', async () => {
    vi.mocked(fetch).mockResolvedValue(response(fixedData));
    const tripPlan: NonNullable<FlightQuery['tripPlan']> = { countryCount: 3, countryCodes: ['FR', 'BE', 'NL'], transport: 'train', maxLegHours: 12, flexibleOrder: true,
      areas: ['CDG', 'BRU', 'AMS'].map(code => { const airport = findAirport(code)!; return { lat: airport.lat, lon: airport.lon, radiusKm: 125 }; }) };
    const result = await explore('flight', { ...query, tripPlan });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].price).toBe(321055);
    expect(result.offers[0].confirmed).toBe(false);
    expect(result.coverage.complete).toBe(false);
    expect(result.offers[0].tripPreview?.countryCount).toBe(3);
    expect(result.offers[0].tripPreview?.stops.at(-1)?.airportCode).toBe('CDG');
    expect(result.warnings.join(' ')).toContain('sem trens');
    vi.mocked(fetch).mockClear();
    await expect(explore('flight', { ...query, tripPlan: { ...tripPlan, maxLegHours: 1 } })).rejects.toMatchObject({ code: 'INVALID_TRIP_PLAN' });
    expect(fetch).not.toHaveBeenCalled();
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

  it('retains demonstrated outbound connections and passenger count without inventing a return itinerary or price basis', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_parameters: { currency: 'BRL', adults: 2 }, best_flights: [{ price: 9850, total_duration: 975, flights: [
      { departure_airport: { id: 'GRU', time: '2027-03-10 18:00' }, arrival_airport: { id: 'LIS', time: '2027-03-11 07:00' }, airline: 'TAP', flight_number: 'TP 88' },
      { departure_airport: { id: 'LIS', time: '2027-03-11 10:00' }, arrival_airport: { id: 'CDG', time: '2027-03-11 13:00' }, airline: 'TAP', flight_number: 'TP 44' },
    ] }] }));
    const result = await explore('flight', { ...query, adults: 2 });
    expect(result.offers[0]).toMatchObject({ price: 985000, passengers: 2, priceBasis: 'unknown', itineraryStatus: 'outbound-only',
      flightLegs: [{ direction: 'outbound', durationMinutes: 975, stops: 1, segments: [
        { origin: 'GRU', destination: 'LIS', departureTime: '2027-03-10 18:00', arrivalTime: '2027-03-11 07:00', airline: 'TAP', flightNumber: 'TP 88' },
        { origin: 'LIS', destination: 'CDG', departureTime: '2027-03-11 10:00', arrivalTime: '2027-03-11 13:00' },
      ] }] });
    expect(result.offers[0].flightLegs).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('opaque-next-leg');
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

  it('searches both city airports in one request and validates the actual returned airports', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, best_flights: [
      { price: 2100, airline_logo: 'https://www.gstatic.com/flights/airline_logos/70px/LA.png', flights: [{departure_airport:{id:'SDU',time:'2027-03-10 13:00'},arrival_airport:{id:'ORY',time:'2027-03-11 09:00'},airline:'LATAM'}] },
      { price: 1900, flights: [{departure_airport:{id:'CNF',time:'2027-03-10 13:00'},arrival_airport:{id:'ORY'}}] },
      { price: 1800, flights: [{departure_airport:{id:'GIG',time:'2027-03-10 13:00'},arrival_airport:{id:'LHR'}}] },
    ] }));
    const result=await explore('flight',{...query,origin:'GIG',originAirports:['GIG','SDU'],arrivalAirport:'CDG',arrivalAirports:['CDG','ORY'],departureAirport:undefined});
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({origin:'SDU',arrivalAirport:'ORY',price:210000,airlineLogo:'https://www.gstatic.com/flights/airline_logos/70px/LA.png',searchedHomeAirports:['GIG','SDU'],searchedReturnAirports:['CDG','ORY']});
    const params=new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams;
    expect(params.get('departure_id')).toBe('GIG,SDU');expect(params.get('arrival_id')).toBe('CDG,ORY');expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([undefined, 1, 3])('rejects a two-adult quote when the source passenger count is %s', async adults => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_parameters: { currency: 'BRL', adults } }));
    await expect(explore('flight', { ...query, adults: 2 })).rejects.toMatchObject({ code: 'PROVIDER_PASSENGER_MISMATCH' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not use a one-adult discovery fare or link as a quote for two adults', async () => {
    const oneAdultLink = 'https://www.google.com/travel/flights?tfs=QAE';
    const twoAdultLink = 'https://www.google.com/travel/flights?tfs=QgIBAQ';
    expect(linkedAdults(oneAdultLink)).toBe(1);
    expect(linkedAdults(twoAdultLink)).toBe(2);
    vi.mocked(fetch).mockImplementation(async input => {
      const params = new URL(String(input)).searchParams;
      if (params.get('engine') === 'google_flights_deals') return response({ search_parameters: { adults: 2 }, deals: [{ price: 4303, departure_airport_code: 'GRU', arrival_airport_code: 'MXP', name: 'Milano', start_date: '2027-03-10', end_date: '2027-03-21', flight_link: oneAdultLink }] });
      expect(params.get('adults')).toBe('2'); expect(params.get('arrival_id')).toBe('MXP');
      expect(params.get('outbound_date')).toBe('2027-03-10'); expect(params.get('return_date')).toBe('2027-03-21');
      expect(params.get('deep_search')).toBe('true');
      return response({ search_parameters: { adults: 2, currency: 'BRL' }, search_metadata: { google_flights_url: twoAdultLink }, best_flights: [{ price: 9120, flights: [{ departure_airport: { id: 'GRU', time: '2027-03-10 17:45' }, arrival_airport: { id: 'MXP' } }] }] });
    });
    const found = await explore('flight', { ...query, adults: 2, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(found.offers).toHaveLength(1);
    expect(found.offers[0]).toMatchObject({ price: 912000, passengers: 2, passengerValidation: 'source-verified', url: twoAdultLink });
    expect(found.coverage.queries).toBe(2); expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(found.offers)).not.toContain('430300');
  });

  it('rejects conflicting passengers in a public link even if the response echoes the requested two adults', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_parameters: { adults: 2 }, search_metadata: { google_flights_url: 'https://www.google.com/travel/flights?tfs=QAE' } }));
    await expect(explore('flight', { ...query, adults: 2 })).rejects.toMatchObject({ code: 'PROVIDER_PASSENGER_MISMATCH' });
  });

  it('omits a group shortcut when the public URL does not prove its passengers', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_parameters: { adults: 2 } }));
    const found = await explore('flight', { ...query, adults: 2 });
    expect(found.offers[0].url).toBeUndefined();
    for (const value of ['https://www.google.com/travel/flights?tfs=!!!!', 'https://elsewhere.example/?tfs=QgIBAQ', 'https://www.google.com/travel/flights?tfs=Qv8']) expect(linkedAdults(value)).toBeUndefined();
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
    await expect(explore('flight', query)).rejects.toMatchObject({ code: 'PROVIDER_NETWORK_ERROR' });
  });

  it('rejects mismatched currencies rather than labeling foreign amounts as BRL', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...fixedData, search_parameters: { currency: 'USD' } }));
    await expect(explore('flight', query)).rejects.toMatchObject({ code: 'PROVIDER_INVALID_CURRENCY' });
  });

  it('only returns demonstrated destination matches from flexible discovery and declares partial coverage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T13:00:00Z'));
    const good = { price: 2500, country: 'France', name: 'Paris', departure_airport_code: 'GRU', arrival_airport_code: 'CDG', start_date: '2026-11-10', end_date: '2026-11-21', flight_duration: 720, stops: 0, flight_link: 'https://www.google.com/travel/flights?id=source' };
    vi.mocked(fetch).mockResolvedValue(response({ deals: [good,
      { ...good, country: 'Kenya', name: 'Nairobi', arrival_airport_code: 'NBO' },
      { ...good, departure_airport_code: 'JFK' },
      { ...good, country: undefined, name: 'Unknown', arrival_airport_code: 'ZZZ' },
      { ...good, end_date: '2026-11-12' },
    ] }));
    const result = await explore('flight', { ...query, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({ price: 250000, arrivalAirport: 'CDG', departureAirport: 'CDG', confirmed: false });
    expect(result.offers[0]).toMatchObject({ passengers: 1, priceBasis: 'unknown', itineraryStatus: 'round-trip-dates', flightLegs: [{ direction: 'outbound', durationMinutes: 720, stops: 0, segments: [] }] });
    expect(result.coverage).toMatchObject({ complete: false, queries: 1, requestedHorizonMonths: 12 });
    expect(result.coverage.availableHorizonMonths).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes('4 resultado(s)'))).toBe(true);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.searchParams.get('engine')).toBe('google_flights_deals');
    expect(url.searchParams.has('trip_length')).toBe(false);
    expect(url.searchParams.get('query')).toContain('Europe');
    expect(url.searchParams.get('query')).toContain('10 to 20 days');
  });

  it('samples real fixed-date multicity searches when the chosen arrival and return airports differ', async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const params = new URL(String(input)).searchParams;
      const legs = JSON.parse(params.get('multi_city_json')!);
      return response({ ...fixedData, best_flights: [{ ...fixedData.best_flights[0], flights: [{ departure_airport: { id: 'GRU', time: legs[0].date + ' 18:00' }, arrival_airport: { id: 'CDG' } }] }] });
    });
    const result = await explore('flight', { ...query, departureAirport: 'AMS', departureDate: undefined, returnDate: undefined });
    expect(result.offers).toHaveLength(3);
    expect(result.coverage).toMatchObject({ complete: false, queries: 3 });
    for (const call of vi.mocked(fetch).mock.calls) {
      const params = new URL(String(call[0])).searchParams;
      expect(params.get('type')).toBe('3');
      expect(JSON.parse(params.get('multi_city_json')!)[1].departure_id).toBe('AMS');
    }
  });

  it('does not turn changed discovery and route responses into a successful empty result', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ search_metadata: { status: 'Success' } }));
    await expect(explore('flight', { ...query, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined })).rejects.toMatchObject({ code: 'PROVIDER_SEARCH_FAILED' });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('allows an exact lookup to finish after the old 15-second timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_input, options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response(fixedData)), 20_000);
      options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
    }));
    const pending = explore('flight', query);
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).offers).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers from a timed-out promotion feed by querying dates directly', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((input, options) => {
      const params = new URL(String(input)).searchParams;
      if (params.get('engine') === 'google_flights_deals') return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
      return Promise.resolve(response({ best_flights: [{ price: 4200, flights: [{ departure_airport: { id: params.get('departure_id'), time: params.get('outbound_date') + ' 18:00' }, arrival_airport: { id: params.get('arrival_id') } }] }] }));
    });
    const pending = explore('flight', { ...query, departureDate: undefined, returnDate: undefined });
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;
    expect(result.offers).toHaveLength(3);
    expect(result.coverage.queries).toBe(4);
    expect(result.warnings.join(' ')).toContain('estava indisponível');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a completely stalled flexible search and returns a timeout, not zero fares', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = explore('flight', { ...query, departureDate: undefined, returnDate: undefined });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', statusCode: 504 });
    await vi.advanceTimersByTimeAsync(52_000);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([401, 403, 429])('does not consume fallback requests after HTTP %s', async status => {
    vi.mocked(fetch).mockResolvedValue(response({}, status));
    await expect(explore('flight', { ...query, departureDate: undefined, returnDate: undefined })).rejects.toMatchObject({ code: status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_AUTH_FAILED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps successful date results when another sampled lookup fails', async () => {
    let sample = 0;
    vi.mocked(fetch).mockImplementation(async input => {
      const params = new URL(String(input)).searchParams;
      if (params.get('engine') === 'google_flights_deals') return response({}, 503);
      if (++sample === 1) return response({}, 503);
      return response({ best_flights: [{ price: 4200, flights: [{ departure_airport: { id: params.get('departure_id'), time: params.get('outbound_date') + ' 18:00' }, arrival_airport: { id: params.get('arrival_id') } }] }] });
    });
    const result = await explore('flight', { ...query, departureDate: undefined, returnDate: undefined });
    expect(result.offers).toHaveLength(2);
    expect(result.warnings.join(' ')).toContain('Algumas combinações');
  });

  it('falls back from an empty promotion feed to bounded route/date searches from the actual origin', async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const params = new URL(String(input)).searchParams;
      if (params.get('engine') === 'google_flights_deals') return response({ deals: [], search_parameters: { currency: 'BRL' } });
      return response({ search_parameters: { currency: 'BRL', adults: Number(params.get('adults')) }, best_flights: [{ price: 4200, flights: [{ departure_airport: { id: params.get('departure_id'), time: params.get('outbound_date') + ' 18:00' }, arrival_airport: { id: params.get('arrival_id') } }] }] });
    });
    const result = await explore('flight', { ...query, origin: 'GYN', adults: 2, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(result.offers).toHaveLength(3);
    expect(result.offers.every(offer => offer.origin === 'GYN' && offer.price === 420000 && !offer.confirmed)).toBe(true);
    expect(result.search).toMatchObject({ received: 0, matched: 3, sampled: true, combinations: 3 });
    expect(result.coverage).toMatchObject({ queries: 4, complete: false });
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const call of vi.mocked(fetch).mock.calls) expect(new URL(String(call[0])).searchParams.get('adults')).toBe('2');
  });

  it('reports a failed fallback as a failure rather than implying that no flights exist', async () => {
    vi.mocked(fetch).mockImplementation(async input => new URL(String(input)).searchParams.get('engine') === 'google_flights_deals' ? response({ deals: [] }) : response({}, 503));
    await expect(explore('flight', { ...query, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined })).rejects.toMatchObject({ code: 'PROVIDER_SEARCH_FAILED' });
  });

  it('classifies regions from the worldwide catalog instead of treating every non-Brazil airport as Europe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T13:00:00Z'));
    const deal = { price: 2500, name: 'Paris', departure_airport_code: 'GRU', arrival_airport_code: 'CDG', start_date: '2026-11-10', end_date: '2026-11-21' };
    vi.mocked(fetch).mockResolvedValue(response({ deals: [deal, { ...deal, name: 'Los Angeles', arrival_airport_code: 'LAX' }, { ...deal, name: 'Goiânia', arrival_airport_code: 'GYN' }] }));
    const result = await explore('flight', { ...query, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(result.offers.map((offer) => offer.arrivalAirport)).toEqual(['CDG']);
  });

  it('uses the drawn circle as the destination and excludes airports outside it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T13:00:00Z'));
    const deal = { price: 2500, name: 'Paris', departure_airport_code: 'GRU', arrival_airport_code: 'CDG', start_date: '2026-11-10', end_date: '2026-11-21' };
    vi.mocked(fetch).mockResolvedValue(response({ deals: [deal, { ...deal, name: 'Amsterdam', arrival_airport_code: 'AMS' }] }));
    const result = await explore('flight', { ...query, destination: 'Área no mapa', area: { lat: 48.85, lon: 2.35, radiusKm: 100 }, arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(result.offers.map((offer) => offer.arrivalAirport)).toEqual(['CDG']);
  });

  it('filters flexible fares by all trip constraints and includes the return to the actual arrival airport', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T13:00:00Z'));
    const deal = { price: 2500, name: 'Paris', departure_airport_code: 'GRU', arrival_airport_code: 'CDG', start_date: '2026-11-10', end_date: '2026-11-21' };
    const tripPlan: NonNullable<FlightQuery['tripPlan']> = { countryCount: 3, countryCodes: ['FR', 'BE', 'NL'], transport: 'train', maxLegHours: 12, flexibleOrder: false,
      areas: ['CDG', 'BRU', 'AMS'].map(code => { const airport = findAirport(code)!; return { lat: airport.lat, lon: airport.lon, radiusKm: 125 }; }) };
    vi.mocked(fetch).mockResolvedValue(response({ deals: [deal, { ...deal, price: 2000, name: 'Amsterdam', arrival_airport_code: 'AMS' }, { ...deal, price: 1000, name: 'Los Angeles', arrival_airport_code: 'LAX' }] }));
    const result = await explore('flight', { ...query, tripPlan, destination: 'Roteiro por 3 países', arrivalAirport: undefined, departureAirport: undefined, departureDate: undefined, returnDate: undefined });
    expect(result.offers.map(offer => offer.arrivalAirport)).toEqual(['CDG']);
    expect(result.offers[0].tripPreview?.stops.map(stop => stop.countryCode)).toEqual(['FR', 'BE', 'NL', 'FR']);
    expect(result.offers[0].tripPreview?.legs).toHaveLength(3);
    expect(result.coverage).toMatchObject({ complete: false, queries: 1 });
  });

  it('requires both open-jaw airports inside the drawn area before consuming a query', async () => {
    await expect(explore('flight', { ...query, departureAirport: 'AMS', area: { lat: 48.85, lon: 2.35, radiusKm: 100 } })).rejects.toMatchObject({ code: 'AIRPORT_OUTSIDE_AREA' });
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

describe('date and airport restrictions reach the flight source', () => {
  beforeEach(() => { vi.stubEnv('SERPAPI_API_KEY', 'private-test-key'); vi.stubGlobal('fetch', vi.fn()); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T18:00:00Z')); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const weekend: FlightQuery = { origin: 'GYN', destination: 'Europa', minDays: 2, maxDays: 2, adults: 2, allowOpenJaw: true, horizonMonths: 12, startMonth: '2027-02', endMonth: '2027-10', departureWeekdays: [5], returnWeekdays: [0] };
  it('filters discovery dates strictly and sends the selected month range and weekdays', async () => {
    const good = { price: 1200, name: 'Paris', departure_airport_code: 'GYN', arrival_airport_code: 'CDG', start_date: '2027-02-05', end_date: '2027-02-07' };
    vi.mocked(fetch).mockImplementation(async input => {
      const params = new URL(String(input)).searchParams;
      if (params.get('engine') === 'google_flights_deals') return response({ deals: [good, { ...good, start_date: '2027-02-08', end_date: '2027-02-10' }, { ...good, start_date: '2027-11-05', end_date: '2027-11-07' }] });
      return response({ search_parameters: { adults: 2, currency: 'BRL' }, best_flights: [{ price: 2400, flights: [{ departure_airport: { id: 'GYN', time: params.get('outbound_date') + ' 09:00' }, arrival_airport: { id: 'CDG' } }] }] });
    });
    const found = await explore('flight', weekend);
    expect(found.offers).toHaveLength(1); expect(found.offers[0]).toMatchObject({ outboundDate: '2027-02-05', returnDate: '2027-02-07', passengers: 2 });
    const params = new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams;
    expect(params.get('outbound_date')).toBe('2027-02-01,2027-10-31');
    expect(params.get('query')).toContain('Friday'); expect(params.get('query')).toContain('Sunday');
  });
  it('samples only Friday to Sunday pairs with both selected airports, including an exit-only choice', async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const params = new URL(String(input)).searchParams; const legs = JSON.parse(params.get('multi_city_json')!);
      return response({ search_parameters: { currency: 'BRL', adults: Number(params.get('adults')) }, best_flights: [{ price: 1200, flights: [{ departure_airport: { id: 'GYN', time: `${legs[0].date} 09:00` }, arrival_airport: { id: legs[0].arrival_id } }] }] });
    });
    const results = await explore('flight', { ...weekend, arrivalAirport: 'CDG', departureAirport: 'AMS' });
    expect(results.offers).toHaveLength(3);
    for (const [input] of vi.mocked(fetch).mock.calls) {
      const legs = JSON.parse(new URL(String(input)).searchParams.get('multi_city_json')!);
      expect(legs[0].arrival_id).toBe('CDG'); expect(legs[1].departure_id).toBe('AMS');
      expect(new Date(legs[0].date).getUTCDay()).toBe(5); expect(new Date(legs[1].date).getUTCDay()).toBe(0);
      expect(legs[0].date >= '2027-02-01' && legs[1].date <= '2027-10-31').toBe(true);
    }
    vi.mocked(fetch).mockClear();
    const exitOnly = await explore('flight', { ...weekend, departureAirport: 'FCO' });
    expect(exitOnly.offers).toHaveLength(3);
    expect(exitOnly.offers.every(offer => offer.departureAirport === 'FCO')).toBe(true);
  });
  it('rejects impossible weekday/duration combinations and expired periods before a paid request', async () => {
    await expect(explore('flight', { ...weekend, minDays: 1, maxDays: 1 })).rejects.toMatchObject({ code: 'NO_MATCHING_DATES' });
    await expect(explore('flight', { ...weekend, startMonth: '2026-02', endMonth: '2026-05' })).rejects.toMatchObject({ code: 'TRAVEL_PERIOD_EXPIRED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('exact dates with a mandatory city and free entry',()=>{
  beforeEach(()=>{vi.stubEnv('SERPAPI_API_KEY','private-test-only');vi.stubGlobal('fetch',vi.fn());})
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();})
  it('keeps the exact dates while sampling entry and exit routes that contain Paris',async()=>{
    const tripPlan={requiredAirport:'CDG',countryCount:3,areas:[{lat:48.8566,lon:2.3522,radiusKm:800}],countryCodes:[],transport:'train' as const,maxLegHours:3,flexibleOrder:true}
    vi.mocked(fetch).mockImplementation(async input=>{
      const params=new URL(String(input)).searchParams;
      const legs=params.has('multi_city_json')?JSON.parse(params.get('multi_city_json')!):[{departure_id:params.get('departure_id'),arrival_id:params.get('arrival_id'),date:params.get('outbound_date')},{date:params.get('return_date')}];
      expect(legs[0].date).toBe('2027-03-10');expect(legs[1].date).toBe('2027-03-21');
      return response({search_parameters:{adults:2,currency:'BRL'},best_flights:[{price:5000,flights:[{departure_airport:{id:'GYN',time:'2027-03-10 09:00'},arrival_airport:{id:legs[0].arrival_id}}]}]});
    });
    const result=await explore('flight',{origin:'GYN',destination:'Roteiro por 3 países',minDays:11,maxDays:11,horizonMonths:12,adults:2,allowOpenJaw:true,departureDate:'2027-03-10',returnDate:'2027-03-21',tripPlan});
    expect(result.offers.length).toBeGreaterThan(0);expect(result.coverage.queries).toBeLessThanOrEqual(3);
    for(const offer of result.offers)expect(offer.tripPreview!.stops.some(stop=>stop.city==='Paris')).toBe(true)
  })
})
