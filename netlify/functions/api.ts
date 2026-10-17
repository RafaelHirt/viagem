import { createApiHandler } from '../../server/api.ts';
import { createNetlifyStorage } from '../../server/storage.ts';

let handler: ReturnType<typeof createApiHandler> | undefined;

export default async function api(request: Request): Promise<Response> {
  handler ??= createApiHandler({ storage: createNetlifyStorage() });
  return handler(request);
}
