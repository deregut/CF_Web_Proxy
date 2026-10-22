import { resolveTarget, payloadFilename } from '../lib/target.js';
import { ProxyError, safeFetch, validateTarget } from '../lib/guard.js';
import {
  buildUpstreamHeaders,
  buildDownstreamHeaders,
  applySecurityHeaders,
} from '../lib/headers.js';
import { rewriteHtml, buildNavigationScript, escapeHtml, injectIntoHead } from '../lib/html.js';
import { encodePayload } from '../lib/codec.js';
import { checkAccess } from '../lib/auth.js';

/**
 * `/browse` — renders a full web page through the proxy.
 *
 * Compared with `/watch` this endpoint is meant for interactive browsing:
 *   - `POST` requests are forwarded, so HTML forms keep working.
 *   - Redirects are surfaced as proxied redirects instead of being followed
 *     silently, so the address bar always reflects the proxied page.
 *   - A small banner shows the real origin and offers direct links.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const denied = checkAccess(context);
  if (denied) return denied;

  const requestUrl = new URL(request.url);
  const encodedData = requestUrl.searchParams.get('data');
  const origin = requestUrl.origin;

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
  const method = request.method === 'HEAD' ? 'HEAD' : request.method === 'POST' ? 'POST' : 'GET';

  const payload = method === 'POST' ? await request.arrayBuffer() : null;

  let response;
  try {
    const result = await safeFetch(target, {
      method,
      body: payload,
      headers: upstreamHeaders,
      followRedirects: false,
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

  // Surface redirects through the proxy instead of following them upstream.
  // The new location is validated first, so a redirect cannot be used to
  // reach an internal address.
  const location = response.headers.get('Location');
  if (location && response.status >= 300 && response.status < 400) {
    let next;
    try {
      next = new URL(location, target).toString();
    } catch {
      next = location;
    }

    try {
      validateTarget(next, policy);
    } catch (error) {
      const status = error instanceof ProxyError ? error.status : 403;
      return new Response(`Error: ${error.message}`, {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const headers = new Headers({
      Location: `${origin}/browse?data=${encodePayload({ url: next })}`,
      'Cache-Control': 'no-store',
    });
    applySecurityHeaders(headers);
    return new Response(null, { status: 302, headers });
  }

  const contentType = response.headers.get('Content-Type') || '';

  if (!/text\/html/i.test(contentType)) {
    // Not a document: hand it over to the raw endpoint.
    const headers = new Headers({
      Location: `${origin}/raw?data=${encodePayload({ url: target.toString(), filename: payloadFilename(decoded) })}`,
      'Cache-Control': 'no-store',
    });
    applySecurityHeaders(headers);
    return new Response(null, { status: 302, headers });
  }

  let html;
  try {
    html = await response.text();
  } catch (error) {
    return new Response(`Error: could not read the response (${error && error.message})`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const token = encodePayload({ url: target.toString(), filename: payloadFilename(decoded) });
  const rewritingContext = {
    baseUrl: target.toString(),
    toBrowse: (url) => `/browse?data=${encodePayload({ url })}`,
    toRaw: (url) => `/raw?data=${encodePayload({ url })}`,
  };

  let rewritten = rewriteHtml(html, rewritingContext);
  rewritten = injectIntoHead(rewritten, buildNavigationScript('/browse?data='));
  rewritten = injectBanner(rewritten, {
    origin: target.origin,
    download: `/download?data=${token}`,
    raw: `/raw?data=${token}`,
    watch: `/watch?data=${token}`,
  });

  const headers = buildDownstreamHeaders(response.headers, { transformed: true });
  headers.set('Cache-Control', 'no-store');
  applySecurityHeaders(headers, { frame: 'SAMEORIGIN' });

  return new Response(rewritten, { status: response.status, headers });
}

const BANNER_CSS = `
  #cf-proxy-banner {
    position: sticky; top: 0; z-index: 2147483647;
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 8px 12px; background: #111418; color: #fff;
    font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  #cf-proxy-banner a { color: #7fd1ff; text-decoration: none; }
  #cf-proxy-banner a:hover { text-decoration: underline; }
  #cf-proxy-banner .cf-proxy-target {
    flex: 1 1 240px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
`;

function injectBanner(html, { origin, download, raw, watch }) {
  const banner =
    `<style>${BANNER_CSS}</style>` +
    `<div id="cf-proxy-banner">` +
    `<span class="cf-proxy-target" title="${escapeHtml(origin)}">${escapeHtml(origin)}</span>` +
    `<a href="${escapeHtml(download)}" rel="noopener noreferrer">Download</a>` +
    `<a href="${escapeHtml(watch)}" rel="noopener noreferrer">Watch</a>` +
    `<a href="${escapeHtml(raw)}" rel="noopener noreferrer">Raw</a>` +
    `</div>`;

  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b[^>]*>/i, (match) => `${match}${banner}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}<body>${banner}`);
  }
  return `${banner}${html}`;
}
