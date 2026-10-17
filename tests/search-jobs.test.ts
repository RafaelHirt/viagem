import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../server/api.ts';
import { createFileStorage } from '../server/storage.ts';
import { createFileSearchJobStore } from '../server/search-jobs.ts';
import { ProviderError } from '../server/providers.ts';
import type { ExploreResult } from '../src/shared/types.ts';

const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
const query = { origin: 'GYN', destination: 'Europa', minDays: 10, maxDays: 20, horizonMonths: 12, adults: 2, allowOpenJaw: true };
const result: ExploreResult = {
  offers: [{ id: 'fixture-only', kind: 'flight', title: 'Goiânia → Paris', price: 985000, currency: 'BRL', passengers: 2, priceBasis: 'unknown', itineraryStatus: 'outbound-only', origin: 'GYN', arrivalAirport: 'CDG', departureAirport: 'CDG', outboundDate: '2027-03-10', returnDate: '2027-03-21', observedAt: '2026-10-17T18:00:00Z', details: [], provider: 'Test fixture', confirmed: false }],
  coverage: { complete: false, queries: 1, description: 'Controlled test response' }, warnings: [],
};
const password = 'senha-local-somente-testes';
function request(path: string, method = 'GET', body?: unknown, cookie?: string, origin = 'https://viagem.example') {
  return new Request(`https://viagem.example${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function fixture(development = false, search = vi.fn(async () => result)) {
  const directory = await mkdtemp(join(tmpdir(), 'viagem-jobs-')); directories.push(directory);
  const storage = createFileStorage(join(directory, 'data'));
  const searchJobs = createFileSearchJobStore(join(directory, 'jobs'));
  const notify = vi.fn(async () => []);
  const options = { storage, searchJobs, development, password, search, notify };
  const handler = createApiHandler(options);
  const worker = createApiHandler({ ...options, backgroundExecution: true });
  const login = await handler(request('/api/session', 'POST', { password }));
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  return { directory, storage, searchJobs, handler, worker, cookie, search, notify };
}
async function createJob(f: Awaited<ReturnType<typeof fixture>>, input: unknown = { kind: 'flight', query }) {
  const response = await f.handler(request('/api/search-jobs', 'POST', input, f.cookie));
  expect(response.status).toBe(202);
  return response.json() as Promise<{ jobId: string; startUrl: string }>;
}

describe('durable authenticated searches', () => {
  it('protects creation, polling and workers without consuming the provider', async () => {
    const f = await fixture(); const job = await createJob(f);
    expect(job.startUrl).toBe('/.netlify/functions/search-background');
    expect((await f.handler(request('/api/search-jobs', 'POST', { kind: 'flight', query }))).status).toBe(401);
    expect((await f.handler(request(`/api/search-jobs/${job.jobId}`))).status).toBe(401);
    expect((await f.worker(request(job.startUrl, 'POST', { jobId: job.jobId }))).status).toBe(401);
    expect((await f.worker(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie, 'https://elsewhere.example'))).status).toBe(403);
    expect((await f.handler(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie))).status).toBe(404);
    const state = await (await f.handler(request(`/api/search-jobs/${job.jobId}`, 'GET', undefined, f.cookie))).json();
    expect(state).toEqual({ status: 'pending' });
    expect(f.search).not.toHaveBeenCalled();
  });

  it('validates job criteria and identifiers before a paid search', async () => {
    const f = await fixture();
    expect((await f.handler(request('/api/search-jobs', 'POST', { kind: 'flight', query: { ...query, adults: 0 } }, f.cookie))).status).toBe(400);
    expect((await f.handler(request('/api/search-jobs/not-a-uuid', 'GET', undefined, f.cookie))).status).toBe(400);
    expect((await f.worker(request('/.netlify/functions/search-background', 'POST', { kind: 'flight', query }, f.cookie))).status).toBe(400);
    expect((await f.handler(request('/api/search-jobs', 'POST', { monitorId: 'missing' }, f.cookie))).status).toBe(404);
    expect(f.search).not.toHaveBeenCalled();
  });

  it('executes a job only once across duplicate background requests and retains its result', async () => {
    let release!: (value: ExploreResult) => void;
    const search = vi.fn(() => new Promise<ExploreResult>(resolve => { release = resolve; }));
    const f = await fixture(false, search); const job = await createJob(f);
    const started = f.worker(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie));
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    const duplicate = await f.worker(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie));
    expect(duplicate.status).toBe(202);
    expect(await (await f.handler(request(`/api/search-jobs/${job.jobId}`, 'GET', undefined, f.cookie))).json()).toEqual({ status: 'running' });
    release(result); expect((await started).status).toBe(202);
    expect(await (await f.handler(request(`/api/search-jobs/${job.jobId}`, 'GET', undefined, f.cookie))).json()).toEqual({ status: 'complete', result });
    await f.worker(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie));
    expect(search).toHaveBeenCalledOnce();
    expect((await createFileSearchJobStore(join(f.directory, 'jobs')).get(job.jobId))?.result).toEqual(result);
  });

  it.each([
    [new ProviderError('PROVIDER_TIMEOUT', 'A consulta demorou mais que o esperado.', 504), 'PROVIDER_TIMEOUT', 'A consulta demorou mais que o esperado.'],
    [new Error('private-upstream-credential-must-not-appear'), 'SEARCH_JOB_FAILED', 'Não conseguimos concluir esta busca. Tente novamente em alguns instantes.'],
  ])('retains a safe failure instead of inventing zero fares', async (failure, code, message) => {
    const f = await fixture(false, vi.fn(async () => { throw failure; })); const job = await createJob(f);
    await f.worker(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie));
    const response = await f.handler(request(`/api/search-jobs/${job.jobId}`, 'GET', undefined, f.cookie));
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: 'failed', error: { code, message } });
    expect(text).not.toContain('private-upstream-credential');
    expect(text).not.toContain('offers');
  });

  it('acknowledges a local job before completion and persists a saved alert observation', async () => {
    let release!: (value: ExploreResult) => void;
    const search = vi.fn(() => new Promise<ExploreResult>(resolve => { release = resolve; }));
    const f = await fixture(true, search);
    const created = await f.handler(request('/api/monitors', 'POST', { kind: 'flight', name: 'Teste assíncrono', query, rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false } }, f.cookie));
    const { monitor } = await created.json();
    const job = await createJob(f, { monitorId: monitor.id });
    expect(job.startUrl).toBe(`/api/search-jobs/${job.jobId}/start`);
    const ack = await f.handler(request(job.startUrl, 'POST', { jobId: job.jobId }, f.cookie));
    expect(ack.status).toBe(202);
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    expect((await f.searchJobs.get(job.jobId))?.status).toBe('running');
    release(result);
    await vi.waitFor(async () => expect((await f.searchJobs.get(job.jobId))?.status).toBe('complete'));
    const observations = await f.storage.listObservations(monitor.id);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ complete: false, offer: { passengers: 2, priceBasis: 'unknown', arrivalAirport: 'CDG', outboundDate: '2027-03-10', returnDate: '2027-03-21' } });
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('claims atomically across store instances and excludes expired jobs', async () => {
    const f = await fixture(); const other = createFileSearchJobStore(join(f.directory, 'jobs'));
    const job = await f.searchJobs.create({ kind: 'flight', query });
    const claimed = await Promise.all([f.searchJobs.claim(job.id), other.claim(job.id)]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    await other.complete(job.id, result);
    await f.searchJobs.fail(job.id, { code: 'LATE', message: 'A late worker cannot overwrite the result' });
    expect((await f.searchJobs.get(job.id))?.status).toBe('complete');
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await other.get(job.id)).toBeUndefined();
    expect(await f.searchJobs.claim(job.id)).toBeUndefined();
    expect((await f.handler(request(`/api/search-jobs/${job.id}`, 'GET', undefined, f.cookie))).status).toBe(404);
  });
});
