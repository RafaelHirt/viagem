import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import type { Monitor, Observation } from '../src/shared/types.ts';

export interface Storage {
  listMonitors(): Promise<Monitor[]>;
  getMonitor(id: string): Promise<Monitor | null>;
  saveMonitor(monitor: Monitor): Promise<void>;
  deleteMonitor(id: string): Promise<void>;
  listObservations(monitorId: string): Promise<Observation[]>;
  saveObservation(observation: Observation): Promise<void>;
  claimAlert(key: string): Promise<string | null>;
  finishAlert(key: string, token: string, delivered: boolean): Promise<void>;
}

interface Claim { token: string; expiresAt: number; delivered: boolean }
const LEASE_MS = 5 * 60_000;

function safeKey(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(value)) throw new Error('Identificador inválido.');
  return value;
}

async function optionalJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

/** Local development only. Netlify handlers always use the durable Blob adapter. */
export function createFileStorage(directory: string): Storage {
  const monitorDirectory = join(directory, 'monitors');
  const observationsDirectory = join(directory, 'observations');
  const alertsDirectory = join(directory, 'alerts');
  let alertLock = Promise.resolve();
  const locked = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = alertLock;
    let release!: () => void;
    alertLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  };
  const initialize = async () => {
    await Promise.all([monitorDirectory, observationsDirectory, alertsDirectory].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  };
  const files = async (directoryPath: string) => {
    try { return (await readdir(directoryPath)).filter((name) => name.endsWith('.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  };
  return {
    async listMonitors() {
      await initialize();
      const monitors = await Promise.all((await files(monitorDirectory)).map((file) => optionalJson<Monitor>(join(monitorDirectory, file))));
      return monitors.filter((monitor): monitor is Monitor => monitor !== null);
    },
    async getMonitor(id) { return optionalJson<Monitor>(join(monitorDirectory, `${safeKey(id)}.json`)); },
    async saveMonitor(monitor) {
      await initialize();
      await atomicJson(join(monitorDirectory, `${safeKey(monitor.id)}.json`), monitor);
    },
    async deleteMonitor(id) {
      await rm(join(monitorDirectory, `${safeKey(id)}.json`), { force: true });
      await rm(join(observationsDirectory, safeKey(id)), { recursive: true, force: true });
    },
    async listObservations(monitorId) {
      const folder = join(observationsDirectory, safeKey(monitorId));
      const observations = await Promise.all((await files(folder)).map((file) => optionalJson<Observation>(join(folder, file))));
      return observations.filter((observation): observation is Observation => observation !== null);
    },
    async saveObservation(observation) {
      const folder = join(observationsDirectory, safeKey(observation.monitorId));
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await atomicJson(join(folder, `${safeKey(observation.id)}.json`), observation);
    },
    async claimAlert(key) {
      return locked(async () => {
      await initialize();
      const path = join(alertsDirectory, `${safeKey(key)}.json`);
      const existing = await optionalJson<Claim>(path);
      if (existing?.delivered || (existing && existing.expiresAt > Date.now())) return null;
      if (existing) await rm(path, { force: true });
      const token = randomUUID();
      try {
        await writeFile(path, JSON.stringify({ token, expiresAt: Date.now() + LEASE_MS, delivered: false } satisfies Claim), { flag: 'wx', mode: 0o600 });
        return token;
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null; throw error; }
      });
    },
    async finishAlert(key, token, delivered) {
      await locked(async () => {
      const path = join(alertsDirectory, `${safeKey(key)}.json`);
      const claim = await optionalJson<Claim>(path);
      if (!claim || claim.token !== token) return;
      if (delivered) await atomicJson(path, { ...claim, delivered: true });
      else await rm(path, { force: true });
      });
    },
  };
}

export function createNetlifyStorage(): Storage {
  const store = getStore({ name: 'viagem-personal-v1', consistency: 'strong' });
  async function keys(prefix: string): Promise<string[]> {
    const output: string[] = [];
    for await (const page of store.list({ prefix, paginate: true })) output.push(...page.blobs.map((blob) => blob.key));
    return output;
  }
  const monitorKey = (id: string) => `monitors/${safeKey(id)}.json`;
  const observationPrefix = (id: string) => `observations/${safeKey(id)}/`;
  const alertKey = (key: string) => `alerts/${safeKey(key)}.json`;
  return {
    async listMonitors() {
      const monitors = await Promise.all((await keys('monitors/')).map((key) => store.get(key, { type: 'json' }) as Promise<Monitor | null>));
      return monitors.filter((monitor): monitor is Monitor => monitor !== null);
    },
    async getMonitor(id) { return store.get(monitorKey(id), { type: 'json' }) as Promise<Monitor | null>; },
    async saveMonitor(monitor) { await store.setJSON(monitorKey(monitor.id), monitor); },
    async deleteMonitor(id) {
      await store.delete(monitorKey(id));
      await Promise.all((await keys(observationPrefix(id))).map((key) => store.delete(key)));
    },
    async listObservations(monitorId) {
      const observations = await Promise.all((await keys(observationPrefix(monitorId))).map((key) => store.get(key, { type: 'json' }) as Promise<Observation | null>));
      return observations.filter((observation): observation is Observation => observation !== null);
    },
    async saveObservation(observation) {
      await store.setJSON(`${observationPrefix(observation.monitorId)}${safeKey(observation.id)}.json`, observation);
    },
    async claimAlert(key) {
      const path = alertKey(key);
      const existing = await store.getWithMetadata(path, { type: 'json', consistency: 'strong' }) as { data: Claim; etag?: string } | null;
      if (existing?.data.delivered || (existing && existing.data.expiresAt > Date.now())) return null;
      if (existing && !existing.etag) return null;
      const token = randomUUID();
      const result = await store.setJSON(path, { token, expiresAt: Date.now() + LEASE_MS, delivered: false } satisfies Claim,
        existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true });
      return result.modified ? token : null;
    },
    async finishAlert(key, token, delivered) {
      const path = alertKey(key);
      const current = await store.getWithMetadata(path, { type: 'json', consistency: 'strong' }) as { data: Claim; etag?: string } | null;
      if (!current || current.data.token !== token) return;
      if (!current.etag) return;
      // Failed sends remain retryable; CAS prevents an old worker from changing a renewed lease.
      await store.setJSON(path, { ...current.data, delivered, expiresAt: delivered ? current.data.expiresAt : 0 }, { onlyIfMatch: current.etag });
    },
  };
}
