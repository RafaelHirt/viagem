import { randomUUID } from 'node:crypto';
import type { ExploreResult, HotelQuery, Monitor, MonitorSummary, Observation, Status } from '../src/shared/types.ts';
import { getBaseline, getPriceDrop, validateMonitor } from '../src/shared/domain.ts';
import { clearSessionCookie, createLoginLimiter, createSessionCookie, hasSession, isSameOrigin, passwordMatches } from './auth.ts';
import { explore, getProviderStatus, ProviderError } from './providers.ts';
import { suggestHotels } from './suggestions.ts';
import { getNotificationStatus, sendNotifications } from './notifications.ts';
import type { Delivery } from './notifications.ts';
import type { Storage } from './storage.ts';

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

export async function summarizeMonitor(storage: Storage, monitor: Monitor): Promise<MonitorSummary> {
  const observations = await storage.listObservations(monitor.id);
  const latest = observations.sort((first, second) => second.observedAt.localeCompare(first.observedAt))[0] ?? null;
  const comparable = latest ? observations.filter((observation) => observation.offer.provider === latest.offer.provider) : observations;
  const baseline = getBaseline(comparable, monitor.rule.windowDays);
  return {
    monitor,
    baseline: { ...baseline, dropPercent: latest?.complete ? getPriceDrop(latest.price, baseline.mean) : null },
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
  hotelSuggestions?: typeof suggestHotels;
}

interface RunResult {
  summary: MonitorSummary;
  coverage: ExploreResult['coverage'];
  warnings: string[];
  notifications: Delivery[];
}

async function runMonitor(storage: Storage, monitor: Monitor, search: typeof explore, notify: typeof sendNotifications): Promise<RunResult> {
  const result = await search(monitor.kind, monitor.query);
  const offer = result.offers.filter((candidate) => candidate.kind === monitor.kind && candidate.currency === 'BRL' && Number.isSafeInteger(candidate.price) && candidate.price > 0)
    .sort((first, second) => first.price - second.price)[0];
  const observations = await storage.listObservations(monitor.id);
  const baseline = getBaseline(offer ? observations.filter((observation) => observation.offer.provider === offer.provider) : observations, monitor.rule.windowDays);
  const warnings = [...result.warnings];
  let deliveries: Delivery[] = [];
  if (offer) {
    const complete = result.coverage.complete === true && offer.confirmed === true;
    const observation: Observation = {
      id: randomUUID(), monitorId: monitor.id, observedAt: new Date().toISOString(),
      price: offer.price, currency: 'BRL', offer, complete,
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
  return { summary: await summarizeMonitor(storage, monitor), coverage: result.coverage, warnings, notifications: deliveries };
}

export function createApiHandler(options: ApiOptions): (request: Request) => Promise<Response> {
  const { storage, development = false, search = explore, providerStatus = getProviderStatus, notify = sendNotifications, hotelSuggestions = suggestHotels } = options;
  const password = options.password ?? process.env.DASHBOARD_PASSWORD ?? (development ? 'viagem-local' : '');
  const configured = development ? password.length > 0 : password.length >= 12;
  const mayAttemptLogin = createLoginLimiter();
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
          authConfigured: configured, authenticated: configured && hasSession(request, password), development,
          collection: { enabled: process.env.ENABLE_SCHEDULED_COLLECTION === 'true', minimumHistoryDays: minimumHistoryDays(), maxMonitorsPerRun: MAX_SCHEDULED_MONITORS },
        };
        return json(status);
      }
      if (path === '/api/session' && method === 'DELETE') {
        return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie(development) });
      }
      if (!configured) throw new HttpError(503, 'Configure DASHBOARD_PASSWORD no servidor com pelo menos 12 caracteres para habilitar o painel.');
      if (path === '/api/session' && method === 'POST') {
        if (!mayAttemptLogin(request)) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
        const body = await bodyOf(request);
        if (typeof body.password !== 'string' || !passwordMatches(body.password, password)) throw new HttpError(401, 'Senha incorreta.');
        return json({ authenticated: true }, 200, { 'Set-Cookie': createSessionCookie(password, development) });
      }
      if (!hasSession(request, password)) throw new HttpError(401, 'Entre com sua senha para acessar o painel.');
      if (path === '/api/suggestions/hotels' && method === 'GET') {
        return json(await hotelSuggestions(url.searchParams.get('q') ?? '', url.searchParams.get('location') ?? undefined));
      }
      if (path === '/api/monitors' && method === 'GET') {
        const monitors = await storage.listMonitors();
        return json({ monitors: await Promise.all(monitors.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((monitor) => summarizeMonitor(storage, monitor))) });
      }
      if (path === '/api/monitors' && method === 'POST') {
        const body = await bodyOf(request);
        const monitor = validated({ ...body, id: randomUUID(), createdAt: new Date().toISOString(), enabled: body.enabled ?? true });
        const monitors = monitor.kind === 'hotel' && (monitor.query as HotelQuery).pattern === 'both'
          ? (['weekend', 'weekdays'] as const).map((pattern, index) => ({
            ...monitor, id: index === 0 ? monitor.id : randomUUID(),
            name: `${monitor.name.slice(0, 95)} · ${pattern === 'weekend' ? 'fim de semana' : 'dias de semana'}`,
            query: { ...monitor.query, pattern } as HotelQuery,
          })) : [monitor];
        if ((await storage.listMonitors()).length + monitors.length > MAX_MONITORS) throw new HttpError(409, `O painel pessoal permite até ${MAX_MONITORS} monitores. A opção "ambos" usa dois históricos separados.`);
        for (const entry of monitors) await storage.saveMonitor(entry);
        return json({ monitor: monitors[0], summary: await summarizeMonitor(storage, monitors[0]), additionalMonitors: monitors.slice(1) }, 201);
      }
      if (path === '/api/explore' && method === 'POST') {
        const body = await bodyOf(request);
        const monitor = validated({
          id: 'explore', name: 'Pesquisa', kind: body.kind, query: body.query,
          rule: { dropPercent: 20, windowDays: 60 }, channels: { telegram: false }, enabled: false, createdAt: new Date().toISOString(),
        });
        return json(await search(monitor.kind, monitor.query));
      }
      if (path === '/api/history' && method === 'GET') {
        const monitorId = url.searchParams.get('monitorId') ?? '';
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(monitorId)) throw new HttpError(400, 'Informe um monitor válido.');
        if (!await storage.getMonitor(monitorId)) throw new HttpError(404, 'Monitor não encontrado.');
        const observations = await storage.listObservations(monitorId);
        return json({ observations: observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt)).slice(-2_000) });
      }
      const match = path.match(/^\/api\/monitors\/([A-Za-z0-9_-]{1,100})(\/run)?$/);
      if (match) {
        const monitor = await storage.getMonitor(match[1]);
        if (!monitor) throw new HttpError(404, 'Monitor não encontrado.');
        if (method === 'POST' && match[2] === '/run') return json(await runMonitor(storage, monitor, search, notify));
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
  const results: Array<{ monitorId: string; ok: boolean }> = [];
  for (const monitor of selected) {
    try { await runMonitor(storage, monitor, explore, sendNotifications); results.push({ monitorId: monitor.id, ok: true }); }
    catch { results.push({ monitorId: monitor.id, ok: false }); }
  }
  return { enabled: true, processed: selected.length, skipped: monitors.length - selected.length, results };
}
