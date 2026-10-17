import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { getStore } from '@netlify/blobs';
import type { FlightQuery, HotelQuery } from '../src/shared/types.ts';

export type SearchJobPayload =
  | { kind: 'flight'; query: FlightQuery }
  | { kind: 'hotel'; query: HotelQuery }
  | { monitorId: string };

export interface SearchJobError {
  code: string;
  /** A message safe to return to the authenticated user; never include credentials. */
  message: string;
}

export interface SearchJob {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  createdAt: string;
  expiresAt: string;
  payload: SearchJobPayload;
  result?: unknown;
  error?: SearchJobError;
}

export interface SearchJobStore {
  create(payload: SearchJobPayload): Promise<SearchJob>;
  get(id: string): Promise<SearchJob | undefined>;
  /** A successful claim is permanent: a second worker must never repeat a paid query. */
  claim(id: string): Promise<SearchJob | undefined>;
  complete(id: string, result: unknown): Promise<void>;
  fail(id: string, error: SearchJobError): Promise<void>;
}

const JOB_LIFETIME_MS = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newJob(payload: SearchJobPayload): SearchJob {
  const now = Date.now();
  return {
    id: randomUUID(), status: 'pending', payload,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + JOB_LIFETIME_MS).toISOString(),
  };
}

function active(job: SearchJob | null | undefined): job is SearchJob {
  return Boolean(job && Date.parse(job.expiresAt) > Date.now());
}

async function optionalJson(path: string): Promise<SearchJob | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as SearchJob; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function atomicJson(path: string, job: SearchJob): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(job), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

/** Private local storage. The lock uses exclusive creation across processes. */
export function createFileSearchJobStore(directory = '.local/data/search-jobs'): SearchJobStore {
  const initialize = () => mkdir(directory, { recursive: true, mode: 0o700 });
  const pathFor = (id: string) => join(directory, `${id}.json`);

  async function withLock<T>(id: string, wait: boolean, operation: () => Promise<T>): Promise<T | undefined> {
    if (!UUID.test(id)) return undefined;
    await initialize();
    const lockPath = join(directory, `${id}.lock`);
    for (let attempt = 0; ; attempt += 1) {
      let lock;
      try { lock = await open(lockPath, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // Claims never wait behind a worker that has already acquired the job.
        if (!wait) return undefined;
        if (attempt >= 40) throw new Error('Não foi possível salvar o resultado da pesquisa.');
        await delay(25);
        continue;
      }
      try { return await operation(); }
      finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    }
  }

  async function finish(id: string, values: Pick<SearchJob, 'status'> & Partial<Pick<SearchJob, 'result' | 'error'>>): Promise<void> {
    await withLock(id, true, async () => {
      const current = await optionalJson(pathFor(id));
      if (!active(current) || current.status !== 'running') return;
      await atomicJson(pathFor(id), { ...current, ...values });
    });
  }

  return {
    async create(payload) {
      await initialize();
      const job = newJob(payload);
      await writeFile(pathFor(job.id), JSON.stringify(job), { flag: 'wx', mode: 0o600 });
      return job;
    },
    async get(id) {
      if (!UUID.test(id)) return undefined;
      const job = await optionalJson(pathFor(id));
      return active(job) ? job : undefined;
    },
    async claim(id) {
      return withLock(id, false, async () => {
        const current = await optionalJson(pathFor(id));
        if (!active(current) || current.status !== 'pending') return undefined;
        const running: SearchJob = { ...current, status: 'running' };
        await atomicJson(pathFor(id), running);
        return running;
      });
    },
    async complete(id, result) { await finish(id, { status: 'complete', result }); },
    async fail(id, error) { await finish(id, { status: 'failed', error }); },
  };
}

/** Site-wide private Blob store; strong reads and ETag writes make claims atomic. */
export function createNetlifySearchJobStore(): SearchJobStore {
  const store = getStore({ name: 'viagem-search-jobs-v1', consistency: 'strong' });
  const keyFor = (id: string) => `jobs/${id}.json`;

  async function currentWithMetadata(id: string): Promise<{ data: SearchJob; etag?: string } | null> {
    if (!UUID.test(id)) return null;
    return store.getWithMetadata(keyFor(id), { type: 'json', consistency: 'strong' }) as Promise<{ data: SearchJob; etag?: string } | null>;
  }

  async function finish(id: string, values: Pick<SearchJob, 'status'> & Partial<Pick<SearchJob, 'result' | 'error'>>): Promise<void> {
    const current = await currentWithMetadata(id);
    if (!current?.etag || !active(current.data) || current.data.status !== 'running') return;
    await store.setJSON(keyFor(id), { ...current.data, ...values }, { onlyIfMatch: current.etag });
  }

  return {
    async create(payload) {
      const job = newJob(payload);
      const created = await store.setJSON(keyFor(job.id), job, { onlyIfNew: true });
      if (!created.modified) throw new Error('Não foi possível iniciar a pesquisa.');
      return job;
    },
    async get(id) {
      const current = await currentWithMetadata(id);
      return active(current?.data) ? current.data : undefined;
    },
    async claim(id) {
      const current = await currentWithMetadata(id);
      if (!current?.etag || !active(current.data) || current.data.status !== 'pending') return undefined;
      const running: SearchJob = { ...current.data, status: 'running' };
      const claimed = await store.setJSON(keyFor(id), running, { onlyIfMatch: current.etag });
      return claimed.modified ? running : undefined;
    },
    async complete(id, result) { await finish(id, { status: 'complete', result }); },
    async fail(id, error) { await finish(id, { status: 'failed', error }); },
  };
}

export function createSearchJobStore(): SearchJobStore {
  return process.env.NETLIFY === 'true' ? createNetlifySearchJobStore() : createFileSearchJobStore();
}
