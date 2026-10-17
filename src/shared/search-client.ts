/** Searches run in a durable job so provider latency does not hold a web request open. */
export async function runSearchJob<T>(request: Record<string, unknown>, onCreated?: (jobId: string) => void): Promise<T> {
  async function send(path: string, options?: RequestInit) {
    try {
      return await fetch(path, { ...options, credentials: 'same-origin', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json' } });
    } catch {
      throw new Error('A conexão com o painel foi interrompida. Verifique sua conexão e tente novamente.');
    }
  }
  async function json(path: string, options?: RequestInit) {
    const response = await send(`/api${path}`, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Não foi possível iniciar a consulta. Tente novamente.');
    return body;
  }
  const job = await json('/search-jobs', { method: 'POST', body: JSON.stringify(request) });
  onCreated?.(job.jobId);
  if (!/^\/(?:api\/search-jobs\/[a-zA-Z0-9_-]+\/start|\.netlify\/functions\/search-background)$/.test(job.startUrl)) {
    throw new Error('Não foi possível iniciar a consulta. Recarregue a página e tente novamente.');
  }
  const started = await send(job.startUrl, {
    method: 'POST',
    body: JSON.stringify({ jobId: job.jobId }),
  });
  if (!started.ok) {
    const body = await started.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível iniciar a consulta. Tente novamente.');
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await json(`/search-jobs/${encodeURIComponent(job.jobId)}`);
    if (state.status === 'complete') return state.result as T;
    if (state.status === 'failed') throw new Error(state.error?.message || 'A consulta não pôde ser concluída. Tente novamente.');
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }
  throw new Error('A consulta está levando mais tempo que o esperado. Aguarde um momento antes de tentar novamente.');
}
