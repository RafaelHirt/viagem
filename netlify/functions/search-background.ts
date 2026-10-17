import { createApiHandler } from '../../server/api.ts';
import { createNetlifyStorage } from '../../server/storage.ts';
import { createNetlifySearchJobStore } from '../../server/search-jobs.ts';

let handler: ReturnType<typeof createApiHandler> | undefined;

/** The -background suffix gives this worker Netlify's extended execution time.
 * Authentication and same-origin checks remain in the common API handler. */
export default async function searchBackground(request: Request): Promise<void> {
  handler ??= createApiHandler({
    storage: createNetlifyStorage(),
    searchJobs: createNetlifySearchJobStore(),
    backgroundExecution: true,
  });
  await handler(request);
}
