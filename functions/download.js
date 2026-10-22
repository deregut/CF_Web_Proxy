import { resolveTarget, payloadFilename } from '../lib/target.js';
import { ProxyError, safeFetch, deriveFilename } from '../lib/guard.js';
import {
  buildUpstreamHeaders,
  buildDownstreamHeaders,
  applySecurityHeaders,
  contentDisposition,
} from '../lib/headers.js';
import { checkAccess } from '../lib/auth.js';

/**
 * `/download` — downloads a file through the proxy.
 *
 * Security / correctness fixes compared to the original implementation:
 *   - The `Range` header is now relayed to the origin and the origin's
 *     `206`/`Content-Range` answer is returned verbatim. The original code
 *     computed `Content-Range`/`Content-Length` itself, which produced
 *     corrupted files whenever the origin ignored the range request or did not
 *     send a `Content-Length`.
 *   - Suffix ranges (`bytes=-500`) and open ranges (`bytes=500-`) are handled
 *     by the origin instead of being turned into `NaN`.
 *   - The file name is sanitised and encoded according to RFC 6266, so a
 *     crafted name can no longer inject response headers.
 *   - Upstream status codes are passed through instead of being converted to
 *     a generic `400`.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const denied = checkAccess(context);
  if (denied) return denied;

  const requestUrl = new URL(request.url);
  const encodedData = requestUrl.searchParams.get('data');

  if (!encodedData) {
    return new Response('Data parameter is missing', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  let decoded;
  let target;
  let policy;
  try {
    const resolved = await resolveTarget(context, encodedData);
    decoded = resolved.decoded;
    target = resolved.target;
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
  let finalUrl = target;
  try {
    const result = await safeFetch(target, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      ...policy,
    });
    response = result.response;
    finalUrl = result.finalUrl;
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 502;
    return new Response(`Error: ${error.message}`, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Prefer the name from the payload, fall back to the (post redirect) URL.
  const filename = decoded.filename ? payloadFilename(decoded) : deriveFilename(finalUrl);

  const headers = buildDownstreamHeaders(response.headers);
  headers.set('Content-Disposition', contentDisposition(filename));
  headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
  if (!headers.get('Accept-Ranges')) {
    headers.set('Accept-Ranges', 'bytes');
  }
  applySecurityHeaders(headers);

  if (request.method === 'HEAD') {
    return new Response(null, { status: response.status, headers });
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
