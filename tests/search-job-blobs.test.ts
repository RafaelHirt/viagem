import { afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ entries: new Map<string, { data: unknown; etag: string }>(), revision: 0, omitEtags: false }));
vi.mock('@netlify/blobs', () => ({ getStore: () => ({
  async getWithMetadata(key: string) {
    const entry = mock.entries.get(key);
    return entry ? { data: structuredClone(entry.data), ...(mock.omitEtags ? {} : { etag: entry.etag }) } : null;
  },
  async setJSON(key: string, data: unknown, condition: { onlyIfNew?: boolean; onlyIfMatch?: string } = {}) {
    const current = mock.entries.get(key);
    if ((condition.onlyIfNew && current) || (condition.onlyIfMatch && current?.etag !== condition.onlyIfMatch)) return { modified: false };
    mock.entries.set(key, { data: structuredClone(data), etag: `etag-${++mock.revision}` });
    return { modified: true };
  },
}) }));
import { createNetlifySearchJobStore } from '../server/search-jobs.ts';
afterEach(() => { mock.entries.clear(); mock.omitEtags = false; });
const payload = { kind: 'flight' as const, query: { origin: 'GYN', destination: 'Europa', minDays: 10, maxDays: 20, horizonMonths: 12, adults: 2, allowOpenJaw: true } };

describe('Netlify search job concurrency contract', () => {
  it('uses conditional writes to allow one worker from concurrent strong reads', async () => {
    const first = createNetlifySearchJobStore(), second = createNetlifySearchJobStore();
    const job = await first.create(payload);
    const results = await Promise.all([first.claim(job.id), second.claim(job.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await first.complete(job.id, { offers: [], coverage: { queries: 1 } });
    await second.fail(job.id, { code: 'LATE', message: 'Must not replace completed output' });
    expect(await second.get(job.id)).toMatchObject({ status: 'complete', result: { offers: [] } });
    expect(await second.claim(job.id)).toBeUndefined();
  });
  it('refuses to run a paid search if the store cannot provide a version for the claim', async () => {
    const store = createNetlifySearchJobStore(); const job = await store.create(payload);
    mock.omitEtags = true;
    expect(await store.claim(job.id)).toBeUndefined();
    expect((await store.get(job.id))?.status).toBe('pending');
  });
});
