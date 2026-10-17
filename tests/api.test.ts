import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler, collectMonitors, summarizeMonitor } from '../server/api.ts';
import { createFileStorage } from '../server/storage.ts';
import { sendNotifications } from '../server/notifications.ts';
import type { ExploreResult, Monitor, Observation, Offer } from '../src/shared/types.ts';

const directories: string[] = [];
async function storageFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'viagem-api-'));
  directories.push(directory);
  return { directory, storage: createFileStorage(directory) };
}
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const input = {
  kind: 'flight', name: 'Europa flexível', enabled: true,
  query: { origin: 'GRU', destination: 'Europa', minDays: 10, maxDays: 20, horizonMonths: 6, adults: 1, allowOpenJaw: true },
  rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false },
};

function request(path: string, method = 'GET', body?: unknown, cookie?: string, origin?: string): Request {
  return new Request(`https://viagem.example${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(handler: ReturnType<typeof createApiHandler>): Promise<string> {
  const response = await handler(request('/api/session', 'POST', { password: 'senha-segura-do-painel' }));
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'provider-id', kind: 'flight', title: 'São Paulo → Paris', price: 75_000, currency: 'BRL',
    outboundDate: '2027-03-01', returnDate: '2027-03-12', origin: 'GRU', arrivalAirport: 'CDG', departureAirport: 'CDG',
    details: ['Condições de teste'], observedAt: new Date().toISOString(), provider: 'Fixture', confirmed: true, ...overrides,
  };
}

describe('personal dashboard API', () => {
  it.each([['', 'missing'], ['curta', 'too-short'], ['123456789012', 'ready']])('distinguishes password setup states without revealing the value: %s', async (password, state) => {
    const { storage } = await storageFixture();
    const handler = createApiHandler({ storage, password });
    const status = await (await handler(request('/api/status'))).json();
    expect(status).toMatchObject({ authConfiguration: state, authConfigured: state === 'ready', authenticated: false });
    if (password) expect(JSON.stringify(status)).not.toContain(password);
    const response = await handler(request('/api/explore', 'POST', { kind: 'flight', query: input.query }));
    expect(response.status).toBe(state === 'ready' ? 401 : 503);
    if (state === 'too-short') expect(await response.text()).toContain('recebida pelo servidor');
  });
  it('publishes safe setup status and blocks protected or billable calls without authentication', async () => {
    vi.stubEnv('DASHBOARD_PASSWORD', '');
    vi.stubEnv('SERPAPI_API_KEY', 'secret-value-must-not-appear');
    const { storage } = await storageFixture();
    const search = vi.fn();
    const handler = createApiHandler({ storage, search });
    const statusResponse = await handler(request('/api/status'));
    const text = await statusResponse.text();
    expect(text).not.toContain('secret-value-must-not-appear');
    expect(JSON.parse(text)).toMatchObject({ authConfigured: false, authenticated: false });
    expect((await handler(request('/api/monitors'))).status).toBe(503);
    expect((await handler(request('/api/explore', 'POST', { kind: 'flight', query: input.query }))).status).toBe(503);
    expect(search).not.toHaveBeenCalled();
  });

  it('authenticates with a secure cookie and rejects cross-origin mutations', async () => {
    const { storage } = await storageFixture();
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel' });
    expect((await handler(request('/api/session', 'POST', { password: 'errada' }))).status).toBe(401);
    const response = await handler(request('/api/session', 'POST', { password: 'senha-segura-do-painel' }));
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(response.headers.get('set-cookie')).toContain('; Secure');
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    expect((await handler(request('/api/monitors'))).status).toBe(401);
    expect((await handler(request('/api/monitors', 'POST', input, cookie, 'https://evil.example'))).status).toBe(403);
    expect(await (await handler(request('/api/status', 'GET', undefined, cookie))).json()).toMatchObject({ authenticated: true });
  });

  it('creates, persists, pauses and deletes monitors without mixing edited rules', async () => {
    const { storage, directory } = await storageFixture();
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel' });
    const cookie = await login(handler);
    const created = await handler(request('/api/monitors', 'POST', { ...input, id: 'ignored-client-id' }, cookie));
    expect(created.status).toBe(201);
    const { monitor } = await created.json() as { monitor: Monitor };
    expect(monitor.id).not.toBe('ignored-client-id');
    expect(await createFileStorage(directory).getMonitor(monitor.id)).toEqual(monitor);
    expect((await handler(request(`/api/monitors/${monitor.id}`, 'PATCH', { name: 'Editada' }, cookie))).status).toBe(400);
    const paused = await handler(request(`/api/monitors/${monitor.id}`, 'PATCH', { enabled: false }, cookie));
    expect(await paused.json()).toMatchObject({ monitor: { enabled: false } });
    const listed = await (await handler(request('/api/monitors', 'GET', undefined, cookie))).json();
    expect(listed.monitors).toHaveLength(1);
    expect((await handler(request(`/api/monitors/${monitor.id}`, 'DELETE', undefined, cookie))).status).toBe(200);
    expect(await storage.listMonitors()).toEqual([]);
    expect((await handler(request(`/api/history?monitorId=${monitor.id}`, 'GET', undefined, cookie))).status).toBe(404);
  });

  it('retains unconfirmed partial observations but excludes them from averages and alerts', async () => {
    const { storage } = await storageFixture();
    const search = vi.fn(async (): Promise<ExploreResult> => ({
      offers: [offer({ confirmed: false })], coverage: { complete: false, queries: 1, description: 'Amostra parcial' }, warnings: [],
    }));
    const notify = vi.fn();
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel', search, notify });
    const cookie = await login(handler);
    const { monitor } = await (await handler(request('/api/monitors', 'POST', input, cookie))).json() as { monitor: Monitor };
    const result = await handler(request(`/api/monitors/${monitor.id}/run`, 'POST', undefined, cookie));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ summary: { baseline: { mean: null, validDays: 0, dropPercent: null } } });
    expect(await storage.listObservations(monitor.id)).toMatchObject([{ complete: false, price: 75_000 }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('requires seven distinct completed historical days before an alert', async () => {
    const { storage } = await storageFixture();
    const search = vi.fn(async (): Promise<ExploreResult> => ({ offers: [offer()], coverage: { complete: true, queries: 1, description: 'Completa' }, warnings: [] }));
    const notify = vi.fn(async () => []);
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel', search, notify });
    const cookie = await login(handler);
    const { monitor } = await (await handler(request('/api/monitors', 'POST', input, cookie))).json() as { monitor: Monitor };
    for (let day = 1; day <= 6; day++) {
      const observedAt = new Date(Date.now() - day * 86_400_000).toISOString();
      await storage.saveObservation({ id: `day-${day}`, monitorId: monitor.id, observedAt, price: 100_000, currency: 'BRL', offer: offer({ price: 100_000, observedAt }), complete: true });
    }
    await handler(request(`/api/monitors/${monitor.id}/run`, 'POST', undefined, cookie));
    expect(notify).not.toHaveBeenCalled();
    const observedAt = new Date(Date.now() - 7 * 86_400_000).toISOString();
    await storage.saveObservation({ id: 'day-7', monitorId: monitor.id, observedAt, price: 100_000, currency: 'BRL', offer: offer({ price: 100_000, observedAt }), complete: true });
    await handler(request(`/api/monitors/${monitor.id}/run`, 'POST', undefined, cookie));
    expect(notify).toHaveBeenCalledOnce();
  });

  it('keeps weekday and weekend hotel series separate', async () => {
    const { storage } = await storageFixture();
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel' });
    const cookie = await login(handler);
    const result = await handler(request('/api/monitors', 'POST', { ...input, kind: 'hotel', query: { property: 'Hotel de teste', adults: 2, pattern: 'both' } }, cookie));
    expect(result.status).toBe(201);
    const monitors = await storage.listMonitors();
    expect(monitors).toHaveLength(2);
    expect(monitors.map((monitor) => 'pattern' in monitor.query && monitor.query.pattern).sort()).toEqual(['weekdays', 'weekend']);
  });

  it('keeps scheduled calls opt-in and does not consume provider quota by default', async () => {
    vi.stubEnv('ENABLE_SCHEDULED_COLLECTION', 'false');
    const { storage } = await storageFixture();
    expect(await collectMonitors(storage)).toMatchObject({ enabled: false, processed: 0 });
  });

  it('caps JSON request bodies before validation', async () => {
    const { storage } = await storageFixture();
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel' });
    const cookie = await login(handler);
    expect((await handler(request('/api/monitors', 'POST', { name: 'x'.repeat(20_001) }, cookie))).status).toBe(413);
  });

  it('protects hotel lookup and returns only the connected catalog suggestions', async () => {
    const { storage } = await storageFixture();
    const hotelSuggestions = vi.fn(async () => ({ hotels: [], configured: false, message: 'Catálogo Booking ainda não conectado.' }));
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel', hotelSuggestions });
    expect((await handler(request('/api/suggestions/hotels?q=Boa%20Vista'))).status).toBe(401);
    expect(hotelSuggestions).not.toHaveBeenCalled();
    const cookie = await login(handler);
    const result = await handler(request('/api/suggestions/hotels?q=Boa%20Vista', 'GET', undefined, cookie));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ hotels: [], configured: false });
    expect(hotelSuggestions).toHaveBeenCalledWith('Boa Vista', undefined);
  });
});

describe('notification acceptance and stable deduplication', () => {
  it('retries rejected transport and deduplicates accepted itineraries despite changing provider IDs', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-only');
    vi.stubEnv('ALERT_FROM_EMAIL', 'alertas@example.com');
    const { storage } = await storageFixture();
    const monitor = { ...input, id: 'monitor-1', kind: 'flight', createdAt: new Date().toISOString(), channels: { telegram: false, email: 'destino@example.com' } } as Monitor;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'rejected' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'accepted' }), { status: 200 }));
    const baseline = { mean: 100_000, validDays: 7, windowDays: 60 };
    expect(await sendNotifications(storage, monitor, offer(), baseline, fetcher)).toEqual([{ channel: 'email', status: 'failed' }]);
    expect(await sendNotifications(storage, monitor, offer({ id: 'second-fetch' }), baseline, fetcher)).toEqual([{ channel: 'email', status: 'sent' }]);
    expect(await sendNotifications(storage, monitor, offer({ id: 'third-fetch' }), baseline, fetcher)).toEqual([{ channel: 'email', status: 'duplicate' }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('editing saved alerts with separate price histories', () => {
  it('preserves identity and observations, retains history for a rename, and starts a new comparison after criteria change', async () => {
    const { storage } = await storageFixture();
    const handler = createApiHandler({ storage, password: 'senha-segura-do-painel', search: async () => ({ offers: [offer({ price: 50000, passengers: 2, passengerValidation: 'source-verified' })], coverage: { complete: true, description: 'Controlled test', queries: 1 }, warnings: [] }) }); const cookie = await login(handler);
    const created = await (await handler(request('/api/monitors', 'POST', input, cookie))).json();
    const monitor = created.monitor as Monitor;
    const observedAt = new Date(Date.now() - 86_400_000).toISOString();
    await storage.saveObservation({ id: 'legacy-observation', monitorId: monitor.id, observedAt, price: 100000, currency: 'BRL', offer: offer({ observedAt, price: 100000 }), complete: true });
    const renamed = await (await handler(request(`/api/monitors/${monitor.id}`, 'PUT', { ...monitor, name: 'Novo nome', criteriaVersion: 999 }, cookie))).json();
    expect(renamed).toMatchObject({ criteriaChanged: false, monitor: { id: monitor.id, name: 'Novo nome', createdAt: monitor.createdAt, criteriaVersion: 0 }, summary: { latest: { price: 100000 }, baseline: { validDays: 1 } } });
    const changed = await (await handler(request(`/api/monitors/${monitor.id}`, 'PUT', { ...monitor, query: { ...monitor.query, adults: 2, startMonth: '2027-02', endMonth: '2027-10' } }, cookie))).json();
    expect(changed).toMatchObject({ criteriaChanged: true, monitor: { id: monitor.id, criteriaVersion: 1 }, summary: { latest: null, baseline: { validDays: 0, mean: null } } });
    expect(await storage.listObservations(monitor.id)).toHaveLength(1);
    const updatedRun = await (await handler(request(`/api/monitors/${monitor.id}/run`, 'POST', undefined, cookie))).json();
    expect(updatedRun.summary).toMatchObject({ baseline: { mean: null, validDays: 0 }, latest: { price: 50000, passengers: 2, passengerValidation: 'source-verified' } });
    expect((await storage.listObservations(monitor.id)).find(observation => observation.criteriaVersion === 1)).toMatchObject({ price: 50000 });

    expect((await handler(request(`/api/monitors/${monitor.id}`, 'PUT', { ...monitor, query: { ...monitor.query, adults: 0 } }, cookie))).status).toBe(400);
    expect((await storage.getMonitor(monitor.id))?.criteriaVersion).toBe(1);
    expect((await handler(request(`/api/monitors/${monitor.id}`, 'PUT', monitor))).status).toBe(401);
    expect((await handler(request(`/api/monitors/${monitor.id}`, 'PUT', monitor, cookie, 'https://elsewhere.example'))).status).toBe(403);
  });
})


describe('historical price comparison scope', () => {
  it('uses same-criteria daily prices and never mixes group totals, individual prices or a previous weekday configuration', async () => {
    const { storage } = await storageFixture();
    const monitor = { ...input, id: 'weekend-history', kind: 'flight', createdAt: new Date().toISOString(), criteriaVersion: 1, query: { ...input.query, adults: 2, minDays: 2, maxDays: 2, departureWeekdays: [5], returnWeekdays: [0] }, rule: { dropPercent: 30, windowDays: 180 } } as Monitor;
    const current = offer({ price: 70000, passengers: 2, passengerValidation: 'source-verified', priceBasis: 'group-total' });
    for (let day = 1; day <= 7; day++) {
      const observedAt = new Date(Date.now() - day * 86400000).toISOString();
      await storage.saveObservation({ id: 'good-' + day, monitorId: monitor.id, observedAt, price: 100000, currency: 'BRL', offer: { ...current, observedAt, price: 100000 }, complete: true, criteriaVersion: 1 });
      await storage.saveObservation({ id: 'old-' + day, monitorId: monitor.id, observedAt, price: 100, currency: 'BRL', offer: { ...current, observedAt, price: 100 }, complete: true, criteriaVersion: 0 });
      await storage.saveObservation({ id: 'person-' + day, monitorId: monitor.id, observedAt, price: 50000, currency: 'BRL', offer: { ...current, observedAt, price: 50000, priceBasis: 'per-person' }, complete: true, criteriaVersion: 1 });
    }
    await storage.saveObservation({ id: 'current', monitorId: monitor.id, observedAt: current.observedAt, price: current.price, currency: 'BRL', offer: current, complete: true, criteriaVersion: 1 });
    const summary = await summarizeMonitor(storage, monitor);
    expect(summary.baseline).toMatchObject({ mean: 100000, validDays: 7, dropPercent: 30, windowDays: 180 });
  });
});
