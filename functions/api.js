import { resolveTarget } from '../lib/target.js';
import { ProxyError, safeFetch } from '../lib/guard.js';
import { buildUpstreamHeaders, buildDownstreamHeaders } from '../lib/headers.js';
import { checkAccess } from '../lib/auth.js';

/**
 * `/api` — JSON / text API passthrough with CORS support.
 *
 * Useful to reach an API from a browser page that is not allowed to call the
 * origin directly. The `Origin` header of the caller is not forwarded, and
 * credentials are never relayed.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const denied = checkAccess(context);
  if (denied) return denied;

  const corsOrigin = env.CORS_ORIGIN || '*';

  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store',
    });
    return new Response(null, { status: 204, headers });
  }

  const requestUrl = new URL(request.url);
  const encodedData = requestUrl.searchParams.get('data');

  let target;
  let policy;
  try {
    const resolved = await resolveTarget(context, encodedData);
    target = resolved.target;
    policy = resolved.policy;
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 400;
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': corsOrigin,
        },
      },
    );
  }

  const upstreamHeaders = buildUpstreamHeaders(request);

  const method = request.method;
  const payload = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer();

  let response;
  try {
    const result = await safeFetch(target, {
      method,
      body: payload,
      headers: upstreamHeaders,
      ...policy,
    });
    response = result.response;
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 502;
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': corsOrigin,
        },
      },
    );
  }

  const headers = buildDownstreamHeaders(response.headers);
  headers.set('Access-Control-Allow-Origin', corsOrigin);
  headers.set('Cache-Control', 'no-store');

  if (request.method === 'HEAD') {
    return new Response(null, { status: response.status, headers });
  }

  return new Response(response.body, { status: response.status, headers });
}
