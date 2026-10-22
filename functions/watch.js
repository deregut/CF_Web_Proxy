import { resolveTarget, payloadFilename } from '../lib/target.js';
import { ProxyError, safeFetch } from '../lib/guard.js';
import {
  buildUpstreamHeaders,
  buildDownstreamHeaders,
  applySecurityHeaders,
  contentDisposition,
} from '../lib/headers.js';
import { rewriteHtml, buildNavigationScript, injectIntoHead } from '../lib/html.js';
import { encodePayload } from '../lib/codec.js';
import { checkAccess } from '../lib/auth.js';

/**
 * `/watch` — streams media through the proxy and renders HTML documents.
 *
 * Fixes compared to the original implementation:
 *   - The rewritten links pointed at `/proxy/<base64>`, a route that does not
 *     exist, so every link inside a proxied page was broken. They now point at
 *     `/browse?data=...` (navigation) and `/raw?data=...` (sub resources).
 *   - `Set-Cookie` was appended to a header set that already contained it,
 *     which produced duplicated cookies.
 *   - Single quoted attributes, `srcset`, inline styles and `<base href>` were
 *     not handled at all.
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

  const contentType = response.headers.get('Content-Type') || '';

  if (!/text\/html/i.test(contentType)) {
    // Media / binary passthrough.
    const headers = buildDownstreamHeaders(response.headers);
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

  // HTML document: rewrite every URL so the page keeps working through the proxy.
  const toPayload = (url) => encodePayload({ url });

  const rewritingContext = {
    baseUrl: target.toString(),
    toBrowse: (url) => `/browse?data=${toPayload(url)}`,
    toRaw: (url) => `/raw?data=${toPayload(url)}`,
  };

  let html;
  try {
    html = await response.text();
  } catch (error) {
    return new Response(`Error: could not read the response (${error && error.message})`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const rewritten = rewriteHtml(html, rewritingContext);
  const script = buildNavigationScript('/browse?data=');
  const injected = injectIntoHead(rewritten, script);

  const headers = buildDownstreamHeaders(response.headers, { transformed: true });
  headers.set('Cache-Control', 'no-store');
  applySecurityHeaders(headers, { frame: 'SAMEORIGIN' });

  return new Response(injected, { status: response.status, headers });
}
