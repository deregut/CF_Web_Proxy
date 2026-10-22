import { onRequest as indexHandler } from './functions/index.js';
import { onRequest as proxyHandler } from './functions/proxy.js';
import { onRequest as downloadHandler } from './functions/download.js';
import { onRequest as watchHandler } from './functions/watch.js';
import { onRequest as browseHandler } from './functions/browse.js';
import { onRequest as rawHandler } from './functions/raw.js';
import { onRequest as apiHandler } from './functions/api.js';
import { onRequest as healthHandler } from './functions/health.js';

/**
 * Cloudflare Workers entry point.
 *
 * The handlers in `functions/` follow the Pages Functions signature
 * (`onRequest(context)`), so they can be reused unchanged. This dispatcher
 * simply maps the request path to the matching handler and builds the
 * equivalent `EventContext` object.
 *
 * Cloudflare Pages users do not need this file — Pages maps
 * `functions/<name>.js` to `/<name>` automatically.
 */

const ROUTES = {
  '/': indexHandler,
  '/proxy': proxyHandler,
  '/download': downloadHandler,
  '/watch': watchHandler,
  '/browse': browseHandler,
  '/raw': rawHandler,
  '/api': apiHandler,
  '/health': healthHandler,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    const handler = ROUTES[pathname];

    if (!handler) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const context = {
      request,
      env,
      params: {},
      data: {},
      functionPath: pathname,
      waitUntil: (promise) => ctx.waitUntil(promise),
      passThroughOnException: () => {},
      next: async () =>
        new Response('Not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
    };

    return handler(context);
  },
};
