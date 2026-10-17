import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestHotels } from '../server/suggestions';

describe('Booking hotel name suggestions', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'viagem-hotel-suggestions-'));
    vi.stubEnv('BOOKING_API_TOKEN', '');
    vi.stubEnv('BOOKING_AFFILIATE_ID', '');
    vi.stubEnv('BOOKING_HOTEL_CATALOG_PATH', '');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  // Synthetic records only for structural/index tests; never a production list.
  const hotel = { id: '123', name: 'Hotel São Bento', location: 'São Paulo, Brasil', source: 'booking', verified: true };
  const catalog = (hotels: unknown[] = [hotel]) => ({ version: 1, source: 'booking', sourceEndpoint: 'https://demandapi.booking.com/3.1/accommodations/details', importedAt: '2026-01-01T00:00:00Z', hotels });
  async function connect(data: unknown): Promise<string> {
    const path = join(directory, 'catalog.json');
    await writeFile(path, JSON.stringify(data));
    vi.stubEnv('BOOKING_HOTEL_CATALOG_PATH', path);
    return path;
  }

  it('reports an unconnected search rather than confirming a typed hotel name', async () => {
    const result = await suggestHotels('Fasano Boa Vista');
    expect(result).toMatchObject({ hotels: [], configured: false });
    expect(result.message).toContain('ainda não foi validado');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not present partial credentials as a usable connection', async () => {
    vi.stubEnv('BOOKING_API_TOKEN', 'private-test-token');
    const result = await suggestHotels('Royal Tulip');
    expect(result.configured).toBe(false);
    expect(result.hotels).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('private-test-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires the verified searchable catalog even when credentials are present', async () => {
    vi.stubEnv('BOOKING_API_TOKEN', 'private-test-token');
    vi.stubEnv('BOOKING_AFFILIATE_ID', '123456');
    const result = await suggestHotels('Boa Vista', 'Porto Feliz');
    expect(result).toMatchObject({ hotels: [], configured: false });
    expect(result.message).toContain('ainda não foi validado');
    expect(JSON.stringify(result)).not.toContain('private-test-token');
    expect(JSON.stringify(result)).not.toContain('123456');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('searches the connected verified catalog by readable name and city without an upstream request', async () => {
    await connect(catalog([hotel, { ...hotel, id: '124', name: 'Hotel São Bento', location: 'Porto Feliz, Brasil' }]));
    const result = await suggestHotels('sao bento', 'sao paulo');
    expect(result.configured).toBe(true);
    expect(result.hotels).toEqual([hotel]);
    expect(JSON.stringify(result)).not.toContain(directory);
    expect(fetch).not.toHaveBeenCalled();
    result.hotels[0].name = 'Altered by caller';
    expect((await suggestHotels('sao bento', 'sao paulo')).hotels[0].name).toBe(hotel.name);
  });

  it('does not equate absence from a limited catalog with absence from Booking', async () => {
    await connect(catalog());
    const result = await suggestHotels('Hotel desconhecido');
    expect(result.configured).toBe(true);
    expect(result.hotels).toEqual([]);
    expect(result.message).toContain('não significa que ele não exista');
    expect((await suggestHotels('s')).message).toContain('pelo menos duas letras');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...hotel, source: 'google' },
    { ...hotel, verified: false },
    { ...hotel, id: 'unknown' },
    { ...hotel, location: '' },
    { ...hotel, lat: 100, lon: 0 },
    { ...hotel, lat: 40 },
    { ...hotel, url: 'https://evil.example/hotel' },
    { ...hotel, url: 'https://booking.com/hotel?api_key=private-test-token' },
  ])('rejects the complete catalog when a record is not a valid Booking entry: %j', async (invalid) => {
    await connect(catalog([hotel, { ...invalid, id: invalid.id === 'unknown' ? invalid.id : '456' }]));
    const result = await suggestHotels('sao');
    expect(result).toMatchObject({ configured: false, hotels: [] });
    expect(JSON.stringify(result)).not.toContain('private-test-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires provenance metadata and rejects duplicate property IDs', async () => {
    await connect({ hotels: [hotel] });
    expect((await suggestHotels('sao')).configured).toBe(false);
    await connect(catalog([hotel, hotel]));
    expect((await suggestHotels('sao')).configured).toBe(false);
  });

  it('does not expose a missing operator path or reuse old data after the catalog becomes invalid', async () => {
    const path = await connect(catalog());
    expect((await suggestHotels('sao')).hotels).toHaveLength(1);
    await writeFile(path, '{invalid');
    expect((await suggestHotels('sao'))).toMatchObject({ configured: false, hotels: [] });
    vi.stubEnv('BOOKING_HOTEL_CATALOG_PATH', join(directory, 'private-missing-path'));
    const result = await suggestHotels('sao');
    expect(result).toMatchObject({ configured: false, hotels: [] });
    expect(JSON.stringify(result)).not.toContain('private-missing-path');
    expect(JSON.stringify(result)).not.toContain(directory);
  });

  it('bounds untrusted input without leaking it into an error or starting a request', async () => {
    const input = 'private-test-token'.repeat(30);
    const error = await suggestHotels(input).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'INVALID_QUERY', statusCode: 400 });
    expect(String(error)).not.toContain('private-test-token');
    await expect(suggestHotels('Hotel', 'x'.repeat(121))).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    await expect(suggestHotels(null as unknown as string)).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
