import { collectMonitors } from '../../server/api.ts';
import { createNetlifyStorage } from '../../server/storage.ts';

// UTC: 08:00 and 20:00 in America/Sao_Paulo. Collection also requires explicit opt-in.
export const config = { schedule: '0 11,23 * * *' };

export default async function collect(): Promise<Response> {
  const result = await collectMonitors(createNetlifyStorage());
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
