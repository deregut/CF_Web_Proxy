/**
 * Header hygiene helpers.
 *
 * The original implementation forwarded *every* client header to the upstream
 * origin (including `Cookie`, `Authorization` and `CF-*` headers) and copied
 * *every* upstream header back to the browser (including `Set-Cookie`,
 * `Content-Security-Policy` and hop-by-hop headers).
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'content-encoding',
  'expect',
]);

/** Client headers that are safe (and useful) to relay to the origin. */
const FORWARDABLE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'accept-datetime',
  'cache-control',
  'content-type',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'pragma',
  'range',
  'user-agent',
]);

/** Response headers that must never be relayed verbatim to the browser. */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'x-xss-protection',
  'strict-transport-security',
  'public-key-pins',
  'server',
  'alt-svc',
]);

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CF_Web_Proxy';

/**
 * Build the header set that is sent to the upstream origin.
 * Cookies and authorisation headers are dropped unless explicitly allowed, so
 * the visitor's own credentials are never leaked to a third-party site.
 */
export function buildUpstreamHeaders(request, { allowCredentials = false } = {}) {
  const headers = new Headers();

  if (request && request.headers) {
    for (const [name, value] of request.headers.entries()) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower)) continue;
      if (!allowCredentials && (lower === 'cookie' || lower === 'authorization')) continue;
      if (!FORWARDABLE_REQUEST_HEADERS.has(lower)) continue;
      headers.set(name, value);
    }
  }

  if (!headers.get('user-agent')) {
    headers.set('User-Agent', DEFAULT_USER_AGENT);
  }
  if (!headers.get('accept')) {
    headers.set('Accept', '*/*');
  }

  return headers;
}

/**
 * Copy upstream response headers into a fresh `Headers` object, dropping
 * hop-by-hop headers, the upstream framing/security headers and — when the
 * body was rewritten — the headers that describe the original body.
 */
export function buildDownstreamHeaders(upstreamHeaders, { transformed = false } = {}) {
  const headers = new Headers();
  for (const [name, value] of upstreamHeaders.entries()) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === 'set-cookie') continue;
    headers.set(name, value);
  }

  copySetCookies(upstreamHeaders, headers);

  if (transformed) {
    for (const name of ['content-length', 'content-range', 'etag', 'digest', 'content-md5', 'last-modified']) {
      headers.delete(name);
    }
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  return headers;
}

/**
 * Relay `Set-Cookie` headers one by one.
 *
 * `Headers.set()` would merge multiple cookies into a single comma separated
 * value, which corrupts cookies whose `Expires` attribute contains a comma.
 * The `Domain` attribute is removed so the cookie can only ever be set on the
 * proxy host instead of the whole parent domain.
 */
export function copySetCookies(source, target) {
  let cookies = [];
  if (typeof source.getSetCookie === 'function') {
    cookies = source.getSetCookie();
  } else {
    const raw = source.get('set-cookie');
    if (raw) cookies = [raw];
  }

  for (const cookie of cookies) {
    const sanitized = cookie
      .split(';')
      .filter((part) => {
        const key = part.split('=')[0].trim().toLowerCase();
        return key !== 'domain' && key !== 'partitioned';
      })
      .join(';');
    if (sanitized.trim()) {
      target.append('set-cookie', sanitized);
    }
  }
}

/** Headers that describe the body of a ranged response. */
export function copyRangeHeaders(source, target) {
  for (const name of ['content-range', 'accept-ranges']) {
    const value = source.get(name);
    if (value) target.set(name, value);
  }
}

/**
 * Build a safe `Content-Disposition` value (RFC 6266).
 * The plain `filename` parameter is restricted to ASCII, the `filename*`
 * parameter carries the original UTF-8 name.
 */
export function contentDisposition(filename) {
  const raw = String(filename ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const fallback = (raw.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download').slice(0, 180);
  const encoded = encodeURIComponent(raw).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Apply the standard hardening headers to a response. */
export function applySecurityHeaders(headers, { frame = 'DENY' } = {}) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', frame);
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return headers;
}

/** Build a small JSON error response. */
export function jsonResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(body), { status, headers });
}
