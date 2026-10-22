import { resolveTarget, payloadFilename } from '../lib/target.js';
import { ProxyError, safeFetch } from '../lib/guard.js';
import {
  buildUpstreamHeaders,
  buildDownstreamHeaders,
  applySecurityHeaders,
  contentDisposition,
} from '../lib/headers.js';
import { checkAccess } from '../lib/auth.js';

/**
 * `/raw` — raw passthrough for images, stylesheets, scripts, fonts and other
 * binary assets. The response is rendered inline so browsers can display it.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const denied = checkAccess(context);
  if (denied) return denied;

  const requestUrl = new URL(request.url);
  const encodedData = requestUrl.searchParams.get('data');

  let target;
  let decoded;
  let policy;
  try {
    const resolved = await resolveTarget(context, encodedData);
    target = resolved.target;
    decoded = resolved.decoded;
    policy = resolved.policy;
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 400;
    return new Response(`Error: ${error.message}`, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const upstreamHeaders = buildUpstreamHeaders(request);

  let response;
  try {
    const result = await safeFetch(target, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      ...policy,
    });
    response = result.response;
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 502;
    return new Response(`Error: ${error.message}`, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const headers = buildDownstreamHeaders(response.headers);
  headers.set('Content-Disposition', contentDisposition(payloadFilename(decoded)).replace('attachment', 'inline'));
  headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
  if (!headers.get('Accept-Ranges')) {
    headers.set('Accept-Ranges', 'bytes');
  }
  applySecurityHeaders(headers, { frame: 'SAMEORIGIN' });

  if (request.method === 'HEAD') {
    return new Response(null, { status: response.status, headers });
  }

  return new Response(response.body, { status: response.status, headers });
}
