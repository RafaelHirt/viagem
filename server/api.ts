import { randomUUID } from 'node:crypto';
import type { ExploreResult, FlightQuery, HotelQuery, Monitor, MonitorSummary, Observation, Offer, Status } from '../src/shared/types.ts';
import { needsPassengerRecheck } from '../src/shared/fare-presentation.ts';
import { getBaseline, getPriceDrop, validateMonitor } from '../src/shared/domain.ts';
import { clearSessionCookie, createLoginLimiter, createSessionCookie, hasSession, isSameOrigin, passwordMatches } from './auth.ts';
import { explore, getProviderStatus, ProviderError } from './providers.ts';
import { suggestHotels } from './suggestions.ts';
import { getNotificationStatus, sendNotifications, sendCreationConfirmation } from './notifications.ts';
import type { Delivery } from './notifications.ts';
import type { Storage } from './storage.ts';
import { createSearchJobStore } from './search-jobs.ts';
import type { SearchJob, SearchJobStore } from './search-jobs.ts';

const MAX_BODY_BYTES = 20_000;
const MAX_MONITORS = 10;
const MAX_SCHEDULED_MONITORS = 2;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const length = request.headers.get('content-length');
  if (length && Number(length) > MAX_BODY_BYTES) throw new HttpError(413, 'A solicitação excede o limite permitido.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'A solicitação excede o limite permitido.');
      }
      chunks.push(chunk.value);
    }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Envie um objeto JSON válido.'); }
}

function validated(input: unknown): Monitor {
  try { return validateMonitor(input); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Critérios inválidos.'); }
}

function minimumHistoryDays(): number {
  const value = Number(process.env.MIN_HISTORY_DAYS ?? '7');
  return Number.isInteger(value) && value >= 7 && value <= 365 ? value : 7;
}

function sameFareScope(first: Offer, second: Offer): boolean {
  return first.provider === second.provider && first.currency === second.currency &&
    (first.priceBasis || 'unknown') === (second.priceBasis || 'unknown') && first.passengers === second.passengers;
}

export async function summarizeMonitor(storage: Storage, monitor: Monitor): Promise<MonitorSummary> {
  const observations = (await storage.listObservations(monitor.id)).filter(observation => (observation.criteriaVersion ?? 0) === (monitor.criteriaVersion ?? 0));
  const latest = observations.sort((first, second) => second.observedAt.localeCompare(first.observedAt))[0] ?? null;
  const comparable = observations.filter(observation => !needsPassengerRecheck(observation.offer, monitor.query.adults) && (!latest || sameFareScope(observation.offer, latest.offer)));
  const baseline = getBaseline(comparable, monitor.rule.windowDays);
  return {
    monitor,
    baseline: { ...baseline, dropPercent: latest?.complete && !needsPassengerRecheck(latest.offer, monitor.query.adults) && baseline.validDays >= minimumHistoryDays() ? getPriceDrop(latest.price, baseline.mean) : null },
    latest: latest?.offer ?? null,
  };
}

export interface ApiOptions {
  storage: Storage;
  development?: boolean;
  password?: string;
  search?: typeof explore;
  providerStatus?: typeof getProviderStatus;
  notify?: typeof sendNotifications;
  confirmCreation?: typeof sendCreationConfirmation;
  hotelSuggestions?: typeof suggestHotels;
  searchJobs?: SearchJobStore;
  /** Only the separate Netlify background function awaits long-running work. */
  backgroundExecution?: boolean;
}

interface RunResult {
  offers: Offer[];
  search?: ExploreResult['search'];
  summary: MonitorSummary;
  coverage: ExploreResult['coverage'];
  warnings: string[];
  notifications: Delivery[];
  found: number;
  message?: string;
}

async function runMonitor(storage: Storage, monitor: Monitor, search: typeof explore, notify: typeof sendNotifications, searchOptions?: { budgetMs?: number }): Promise<RunResult> {
  const result = await search(monitor.kind, monitor.query, searchOptions);
  const validOffers = result.offers.filter((candidate) => candidate.kind === monitor.kind && candidate.currency === 'BRL' && Number.isSafeInteger(candidate.price) && candidate.price > 0 && !needsPassengerRecheck(candidate, monitor.query.adults));
  if (result.offers.length && !validOffers.length) throw new ProviderError('PROVIDER_PASSENGER_MISMATCH', 'A fonte não confirmou a quantidade de adultos. Nenhum preço foi salvo. Faça uma nova consulta.', 502);
  const offer = validOffers
    .sort((first, second) => first.price - second.price)[0];
  const observations = (await storage.listObservations(monitor.id)).filter(observation => (observation.criteriaVersion ?? 0) === (monitor.criteriaVersion ?? 0) && !needsPassengerRecheck(observation.offer, monitor.query.adults));
  const baseline = getBaseline(offer ? observations.filter((observation) => sameFareScope(observation.offer, offer)) : observations, monitor.rule.windowDays);
  const warnings = [...result.warnings];
  let deliveries: Delivery[] = [];
  if (offer) {
    const complete = result.coverage.complete === true && offer.confirmed === true;
    const observation: Observation = {
      id: randomUUID(), monitorId: monitor.id, observedAt: new Date().toISOString(),
      price: offer.price, currency: 'BRL', offer, complete, criteriaVersion: monitor.criteriaVersion ?? 0,
    };
    await storage.saveObservation(observation);
    const drop = complete ? getPriceDrop(offer.price, baseline.mean) : null;
    if (complete && baseline.validDays >= minimumHistoryDays() && drop !== null && drop >= monitor.rule.dropPercent) {
      deliveries = await notify(storage, monitor, offer, baseline);
    } else if (!complete) {
      warnings.push('Esta consulta é parcial ou o preço ainda não foi confirmado. Foi registrada fora da média e não gera alerta.');
    } else if (baseline.validDays < minimumHistoryDays()) {
      warnings.push(`Alertas aguardam pelo menos ${minimumHistoryDays()} dias históricos válidos. Há ${baseline.validDays} dias disponíveis.`);
    }
  }
  return { offers: validOffers, search: result.search, summary: await summarizeMonitor(storage, monitor), coverage: result.coverage, warnings, notifications: deliveries, found: validOffers.length, message: result.search?.message };
}

export function createApiHandler(options: ApiOptions): (request: Request) => Promise<Response> {
  const { storage, development = false, search = explore, providerStatus = getProviderStatus, notify = sendNotifications, confirmCreation = sendCreationConfirmation, hotelSuggestions = suggestHotels } = options;
  const password = options.password ?? process.env.DASHBOARD_PASSWORD ?? (development ? 'viagem-local' : '');
  const configured = development ? password.length > 0 : password.length >= 12;
  const authConfiguration = configured ? 'ready' : password.length ? 'too-short' : 'missing';
  const setupMessage = authConfiguration === 'too-short'
    ? 'A senha do painel foi recebida pelo servidor, mas tem menos de 12 caracteres. Altere DASHBOARD_PASSWORD no contexto Production do Netlify e faça um novo deploy.'
    : 'Configure DASHBOARD_PASSWORD no servidor com pelo menos 12 caracteres para habilitar o painel.';
  const mayAttemptLogin = createLoginLimiter();
  let jobStore = options.searchJobs;
  const jobs = (): SearchJobStore => jobStore ??= createSearchJobStore();
  const executeJob = async (job: SearchJob): Promise<void> => {
    try {
      let result: unknown;
      if ('monitorId' in job.payload) {
        const monitor = await storage.getMonitor(job.payload.monitorId);
        if (!monitor) throw new HttpError(404, 'Este alerta foi removido. Crie uma nova busca.');
        result = await runMonitor(storage, monitor, search, notify);
      } else {
        result = await search(job.payload.kind, job.payload.query);
      }
      await jobs().complete(job.id, result);
    } catch (error) {
      const safe = error instanceof ProviderError ? { code: error.code, message: error.userMessage }
        : error instanceof HttpError ? { code: 'SEARCH_JOB_UNAVAILABLE', message: error.message }
          : { code: 'SEARCH_JOB_FAILED', message: 'Não conseguimos concluir esta busca. Tente novamente em alguns instantes.' };
      await jobs().fail(job.id, safe);
    }
  };
  return async (request) => {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/\.netlify\/functions\/api(?:\/|$)/, '/api/').replace(/\/$/, '');
      const method = request.method.toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !isSameOrigin(request)) {
        throw new HttpError(403, 'Solicitação de outra origem recusada. Reabra o painel e tente novamente.');
      }
      if (path === '/api/status' && method === 'GET') {
        const status: Status & { collection: { enabled: boolean; minimumHistoryDays: number; maxMonitorsPerRun: number } } = {
          providers: providerStatus(), notifications: getNotificationStatus(),
          authConfigured: configured, authConfiguration, authenticated: configured && hasSession(request, password), development,
          collection: { enabled: process.env.ENABLE_SCHEDULED_COLLECTION === 'true', minimumHistoryDays: minimumHistoryDays(), maxMonitorsPerRun: MAX_SCHEDULED_MONITORS },
        };
        return json(status);
      }
      if (path === '/api/session' && method === 'DELETE') {
        return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie(development) });
      }
      if (!configured) throw new HttpError(503, setupMessage);
      if (path === '/api/session' && method === 'POST') {
        if (!mayAttemptLogin(request)) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
        const body = await bodyOf(request);
        if (typeof body.password !== 'string' || !passwordMatches(body.password, password)) throw new HttpError(401, 'Senha incorreta.');
        return json({ authenticated: true }, 200, { 'Set-Cookie': createSessionCookie(password, development) });
      }
      if (!hasSession(request, password)) throw new HttpError(401, 'Entre com sua senha para acessar o painel.');
      if (path === '/api/search-jobs' && method === 'POST') {
        const body = await bodyOf(request);
        let payload: SearchJob['payload'];
        if ('monitorId' in body) {
          if (typeof body.monitorId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.monitorId)) throw new HttpError(400, 'Informe um alerta válido.');
          if (!await storage.getMonitor(body.monitorId)) throw new HttpError(404, 'Alerta não encontrado.');
          payload = { monitorId: body.monitorId };
        } else {
          const criteria = validated({ id: 'explore', name: 'Pesquisa', kind: body.kind, query: body.query,
            rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false }, enabled: false, createdAt: new Date().toISOString() });
          payload = criteria.kind === 'flight' ? { kind: 'flight', query: criteria.query as FlightQuery } : { kind: 'hotel', query: criteria.query as HotelQuery };
        }
        const job = await jobs().create(payload);
        return json({ jobId: job.id, startUrl: development ? `/api/search-jobs/${job.id}/start` : '/.netlify/functions/search-background' }, 202);
      }
      const jobMatch = path.match(/^\/api\/search-jobs\/([A-Za-z0-9_-]+)(\/start)?$/);
      if (jobMatch && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobMatch[1])) throw new HttpError(400, 'Identificador de busca inválido.');
      if (jobMatch && !jobMatch[2] && method === 'GET') {
        const job = await jobs().get(jobMatch[1]);
        if (!job) throw new HttpError(404, 'Esta busca expirou ou não foi encontrada. Faça uma nova busca.');
        return json({ status: job.status, ...(job.status === 'complete' ? { result: job.result } : {}), ...(job.status === 'failed' ? { error: job.error } : {}) });
      }
      const backgroundStart = path === '/.netlify/functions/search-background' && options.backgroundExecution === true;
      if ((backgroundStart || (jobMatch?.[2] === '/start' && development)) && method === 'POST') {
        const body = await bodyOf(request);
        const jobId = body.jobId;
        if (typeof jobId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId) || (jobMatch && jobMatch[1] !== jobId)) throw new HttpError(400, 'Identificador de busca inválido.');
        const current = await jobs().get(jobId);
        if (!current) throw new HttpError(404, 'Esta busca expirou ou não foi encontrada. Faça uma nova busca.');
        // Strong atomic claim prevents duplicate browser requests or Netlify
        // background retries from issuing a second paid provider search.
        const claimed = current.status === 'pending' ? await jobs().claim(jobId) : undefined;
        if (claimed) {
          if (options.backgroundExecution) await executeJob(claimed);
          else void executeJob(claimed).catch(() => { /* A storage failure leaves the claim in place; never repeat a paid search. */ });
        }
        return json({ accepted: true }, 202);
      }
      if (path === '/api/suggestions/hotels' && method === 'GET') {
        return json(await hotelSuggestions(url.searchParams.get('q') ?? '', url.searchParams.get('location') ?? undefined));
      }
      if (path === '/api/monitors' && method === 'GET') {
        const monitors = await storage.listMonitors();
        return json({ monitors: await Promise.all(monitors.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((monitor) => summarizeMonitor(storage, monitor))) });
      }
      if (path === '/api/monitors' && method === 'POST') {
        const body = await bodyOf(request);
        const monitor = validated({ ...body, id: randomUUID(), createdAt: new Date().toISOString(), enabled: body.enabled ?? true, criteriaVersion: 0 });
        // Reuse only a server-held completed search with identical validated
        // criteria. Browser-supplied prices are never trusted or persisted.
        let seed: Offer | undefined;
        if (body.sourceSearchJobId !== undefined) {
          if (typeof body.sourceSearchJobId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.sourceSearchJobId)) throw new HttpError(400, 'A busca de origem é inválida.');
          const source = await jobs().get(body.sourceSearchJobId);
          if (source) {
            if (source.status !== 'complete' || 'monitorId' in source.payload || source.payload.kind !== monitor.kind) throw new HttpError(400, 'Conclua a busca antes de criar o alerta.');
            const original = validated({ ...monitor, query: source.payload.query });
            if (JSON.stringify(original.query) !== JSON.stringify(monitor.query)) throw new HttpError(400, 'As preferências mudaram. Faça uma nova busca antes de criar o alerta.');
            const result = source.result as ExploreResult;
            seed = result.offers.filter(candidate => candidate.kind === monitor.kind && candidate.currency === 'BRL' && Number.isSafeInteger(candidate.price) && candidate.price > 0 &&
              (monitor.kind !== 'flight' || (candidate.passengerValidation === 'source-verified' && candidate.passengers === monitor.query.adults))).sort((a, b) => a.price - b.price)[0];
          }
        }
        const monitors = monitor.kind === 'hotel' && (monitor.query as HotelQuery).pattern === 'both'
          ? (['weekend', 'weekdays'] as const).map((pattern, index) => ({
            ...monitor, id: index === 0 ? monitor.id : randomUUID(),
            name: `${monitor.name.slice(0, 95)} · ${pattern === 'weekend' ? 'fim de semana' : 'dias de semana'}`,
            query: { ...monitor.query, pattern } as HotelQuery,
          })) : [monitor];
        if ((await storage.listMonitors()).length + monitors.length > MAX_MONITORS) throw new HttpError(409, `O painel pessoal permite até ${MAX_MONITORS} monitores. A opção "ambos" usa dois históricos separados.`);
        for (const entry of monitors) await storage.saveMonitor(entry);
        if (seed) await storage.saveObservation({ id: randomUUID(), monitorId: monitor.id, observedAt: seed.observedAt,
          price: seed.price, currency: 'BRL', offer: seed, complete: false, criteriaVersion: 0 });
        for (const entry of monitors) {
          entry.creationEmail = await confirmCreation(storage, entry, url.origin).catch(() => ({ status: 'failed' as const, attemptedAt: new Date().toISOString() }));
          await storage.saveMonitor(entry);
        }
        return json({ monitor: monitors[0], seeded: Boolean(seed), summary: await summarizeMonitor(storage, monitors[0]), additionalMonitors: monitors.slice(1) }, 201);
      }
      if (path === '/api/explore' && method === 'POST') {
        const body = await bodyOf(request);
        const monitor = validated({
          id: 'explore', name: 'Pesquisa', kind: body.kind, query: body.query,
          rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false }, enabled: false, createdAt: new Date().toISOString(),
        });
        return json(await search(monitor.kind, monitor.query, { budgetMs: 25_000 }));
      }
      if (path === '/api/history' && method === 'GET') {
        const monitorId = url.searchParams.get('monitorId') ?? '';
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(monitorId)) throw new HttpError(400, 'Informe um monitor válido.');
        if (!await storage.getMonitor(monitorId)) throw new HttpError(404, 'Monitor não encontrado.');
        const observations = await storage.listObservations(monitorId);
        return json({ observations: observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt)).slice(-2_000) });
      }
      const confirmation = path.match(/^\/api\/monitors\/([A-Za-z0-9_-]{1,100})\/confirmation$/);
      if (confirmation && method === 'POST') {
        const monitor = await storage.getMonitor(confirmation[1]);
        if (!monitor) throw new HttpError(404, 'Alerta não encontrado.');
        monitor.creationEmail = await confirmCreation(storage, monitor, url.origin);
        await storage.saveMonitor(monitor);
        return json({ confirmation: monitor.creationEmail });
      }
      const match = path.match(/^\/api\/monitors\/([A-Za-z0-9_-]{1,100})(\/run)?$/);
      if (match) {
        const monitor = await storage.getMonitor(match[1]);
        if (!monitor) throw new HttpError(404, 'Monitor não encontrado.');
        if (method === 'POST' && match[2] === '/run') return json(await runMonitor(storage, monitor, search, notify, { budgetMs: 25_000 }));
        if (!match[2] && method === 'PUT') {
          const body = await bodyOf(request);
          const updated = validated({ ...body, id: monitor.id, createdAt: monitor.createdAt, enabled: body.enabled ?? monitor.enabled, criteriaVersion: monitor.criteriaVersion ?? 0 });
          const criteriaChanged = updated.kind !== monitor.kind || JSON.stringify(validated(monitor).query) !== JSON.stringify(updated.query);
          updated.criteriaVersion = (monitor.criteriaVersion ?? 0) + (criteriaChanged ? 1 : 0);
          updated.creationEmail = monitor.creationEmail;
          await storage.saveMonitor(updated);
          return json({ monitor: updated, criteriaChanged, summary: await summarizeMonitor(storage, updated) });
        }
        if (!match[2] && method === 'PATCH') {
          const body = await bodyOf(request);
          if (typeof body.enabled !== 'boolean' || Object.keys(body).some((key) => key !== 'enabled')) {
            throw new HttpError(400, 'Altere apenas o campo enabled. Crie um novo monitor para mudar os critérios sem misturar históricos.');
          }
          const updated = { ...monitor, enabled: body.enabled };
          await storage.saveMonitor(updated);
          return json({ monitor: updated, summary: await summarizeMonitor(storage, updated) });
        }
        if (!match[2] && method === 'DELETE') {
          await storage.deleteMonitor(monitor.id);
          return json({ deleted: true });
        }
      }
      throw new HttpError(404, 'Operação não encontrada.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof ProviderError) return json({ error: error.userMessage, code: error.code }, error.statusCode);
      return json({ error: 'Não foi possível concluir esta operação. Tente novamente mais tarde.' }, 500);
    }
  };
}

/** Opt-in cron: at most two monitors per run, rotated without multiplying provider queries. */
export async function collectMonitors(storage: Storage): Promise<{ enabled: boolean; processed: number; skipped: number; results: Array<{ monitorId: string; ok: boolean }> }> {
  if (process.env.ENABLE_SCHEDULED_COLLECTION !== 'true') return { enabled: false, processed: 0, skipped: 0, results: [] };
  const providers = getProviderStatus();
  const monitors = (await storage.listMonitors()).filter((monitor) => monitor.enabled).sort((a, b) => a.id.localeCompare(b.id));
  const eligible = monitors.filter((monitor) => monitor.kind === 'flight' ? providers.flights.configured : providers.hotels.configured);
  const offset = eligible.length ? (Math.floor(Date.now() / (12 * 60 * 60_000)) * MAX_SCHEDULED_MONITORS) % eligible.length : 0;
  const selected = Array.from({ length: Math.min(MAX_SCHEDULED_MONITORS, eligible.length) }, (_, index) => eligible[(offset + index) % eligible.length]);
  const results = await Promise.all(selected.map(async (monitor) => {
    try { await runMonitor(storage, monitor, explore, sendNotifications, { budgetMs: 25_000 }); return { monitorId: monitor.id, ok: true }; }
    catch { return { monitorId: monitor.id, ok: false }; }
  }));
  return { enabled: true, processed: selected.length, skipped: monitors.length - selected.length, results };
}
