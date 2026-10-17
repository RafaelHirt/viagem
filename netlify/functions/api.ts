import { createApiHandler } from '../../server/api.ts';
import { createNetlifyStorage } from '../../server/storage.ts';
import { createNetlifySearchJobStore } from '../../server/search-jobs.ts';

let handler: ReturnType<typeof createApiHandler> | undefined;

export default async function api(request: Request): Promise<Response> {
  handler ??= createApiHandler({ storage: createNetlifyStorage(), searchJobs: createNetlifySearchJobStore() });
  return handler(request);
}
