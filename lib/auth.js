/**
 * Optional access-key gate.
 *
 * A public web proxy is an open relay, which is a magnet for abuse. Set the
 * `ACCESS_KEY` environment variable (Pages: Settings -> Environment variables,
 * or a secret in `wrangler.toml`) to require a shared key before any target
 * URL is fetched. The key can be supplied either as the `X-Access-Key` header
 * or as the `key` query parameter.
 */

const KEY_HEADER = 'x-access-key';

function constantTimeEquals(a, b) {
  const left = String(a);
  const right = String(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** The access key configured for this deployment (empty string when unset). */
export function configuredAccessKey(env = {}) {
  return env.ACCESS_KEY ? String(env.ACCESS_KEY) : '';
}

/** The access key supplied by the current request (empty string when unset). */
export function providedAccessKey(request) {
  const header = request.headers.get(KEY_HEADER);
  if (header) return header;
  try {
    return new URL(request.url).searchParams.get('key') || '';
  } catch {
    return '';
  }
}

/**
 * Returns a `Response` when access is denied, otherwise `null`.
 */
export function checkAccess(context) {
  const env = context.env || {};
  const expected = configuredAccessKey(env);
  if (!expected) return null;

  const provided = providedAccessKey(context.request);
  if (!provided) {
    return new Response('This proxy requires an access key. Append ?key=YOUR_KEY to the URL.', {
      status: 401,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Key realm="CF Web Proxy"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (!constantTimeEquals(provided, expected)) {
    return new Response('Invalid access key.', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return null;
}

/**
 * The key that must be carried over into generated links so that they keep
 * working when an access key is configured.
 */
export function accessKeyParam(env, request) {
  const expected = configuredAccessKey(env || {});
  if (!expected) return '';
  const provided = providedAccessKey(request);
  return provided ? `&key=${encodeURIComponent(provided)}` : '';
}
