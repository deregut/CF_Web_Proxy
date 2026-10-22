/**
 * Target URL validation (SSRF hardening) and safe fetching.
 *
 * The original proxy forwarded whatever string it was given straight into
 * `fetch()`. That allowed an attacker to make the worker request
 * internal-only endpoints (cloud metadata, loopback, the deployment's own
 * Pages/Workers routes) and to abuse the worker as an open relay.
 */

import { isBlockedHost } from './blacklist.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
  '.onion',
];

// Service ports that have no business being reachable through a public web
// proxy (SSH, mail, databases, caches, container/K8s control planes).
const BLOCKED_PORTS = new Set([
  22, 23, 25, 110, 143, 445, 465, 587, 993, 995,
  1433, 1521, 2049, 2375, 2376, 3306, 5432, 5672, 5900, 6379, 6443,
  9200, 11211, 27017, 33060,
]);

export class ProxyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProxyError';
    this.status = status;
  }
}

/** Normalise a user supplied string into an absolute http(s) URL. */
export function normalizeUrl(raw) {
  let value = String(raw ?? '').trim();
  if (!value) {
    throw new ProxyError('URL parameter is missing', 400);
  }
  if (value.length > 4096) {
    throw new ProxyError('URL is too long', 414);
  }
  // Strip control characters that could be used to smuggle a different host.
  value = value.replace(/[\u0000-\u001f\u007f]/g, '');

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      throw new ProxyError('Only http and https URLs are supported', 400);
    }
    value = `https://${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProxyError('Invalid URL', 400);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ProxyError('Only http and https URLs are supported', 400);
  }
  if (!parsed.hostname) {
    throw new ProxyError('Invalid URL', 400);
  }
  return parsed;
}

/** Convert decimal / hex / octal IPv4 literals into dotted-quad form. */
function normalizeIPv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4) {
    if (/^\d+$/.test(host)) {
      const value = Number.parseInt(host, 10);
      if (Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) {
        return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
      }
      return null;
    }
    if (/^0x[0-9a-f]+$/.test(host)) {
      const value = Number.parseInt(host.slice(2), 16);
      if (Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) {
        return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
      }
      return null;
    }
    return null;
  }

  const numbers = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number.parseInt(part, 10);
    if (value > 255) return null;
    numbers.push(value);
  }
  return numbers.join('.');
}

/** True for IPv4 literals that must never be reachable through the proxy. */
export function isPrivateIPv4(host) {
  const normalized = normalizeIPv4(host);
  if (!normalized) return false;
  const [a, b, c] = normalized.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

/** True for IPv6 literals that must never be reachable through the proxy. */
export function isPrivateIPv6(host) {
  const value = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (value === '::' || value === '::1') return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(value)) return true;
  if (/^fe[89ab][0-9a-f]?:/.test(value)) return true;

  // IPv4 mapped addresses, dotted (`::ffff:127.0.0.1`) and hexadecimal
  // (`::ffff:7f00:1`, which is what the URL parser normalises them to).
  const dotted = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return isPrivateIPv4(dotted[1]);

  const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return isPrivateIPv4([high >> 8, high & 255, low >> 8, low & 255].join('.'));
  }

  return false;
}

/**
 * Hosts that may be proxied even though they look private.
 * Used for local development (`TARGET_HOST_ALLOWLIST=localhost,127.0.0.1`).
 *
 * This is an explicit per-host allow list on purpose: a blanket
 * "allow private targets" switch would also disable the protection for every
 * redirect hop, which is exactly where the interesting attacks live.
 */
export function allowedTargetHosts(env = {}) {
  const raw = env.TARGET_HOST_ALLOWLIST;
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validate a target URL.
 *
 * @param {string|URL} raw             user supplied target
 * @param {object}      policy
 * @param {string[]}    policy.selfHosts   hosts that belong to this deployment
 * @param {string[]}    policy.blocklist   hosts that are blocked
 * @param {string[]}    policy.allowedHosts hosts that bypass the private range checks
 */
export function validateTarget(raw, { selfHosts = [], blocklist = [], allowedHosts = [] } = {}) {
  const parsed = raw instanceof URL ? raw : normalizeUrl(raw);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const permitted = allowedHosts.includes(host);

  if (!permitted) {
    if (BLOCKED_HOSTNAMES.has(host)) {
      throw new ProxyError('This host is not allowed', 403);
    }
    for (const suffix of BLOCKED_HOST_SUFFIXES) {
      if (host.endsWith(suffix)) {
        throw new ProxyError('This host is not allowed', 403);
      }
    }
    if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
      throw new ProxyError('This host is not allowed', 403);
    }
    if (parsed.port && BLOCKED_PORTS.has(Number.parseInt(parsed.port, 10))) {
      throw new ProxyError('This port is not allowed', 403);
    }
  }

  for (const selfHost of selfHosts) {
    if (!selfHost) continue;
    if (host === selfHost.toLowerCase() || host.endsWith(`.${selfHost.toLowerCase()}`)) {
      throw new ProxyError('Recursive proxying is not allowed', 403);
    }
  }
  if (!permitted && isBlockedHost(host, blocklist)) {
    throw new ProxyError('This domain is not allowed', 403);
  }

  return parsed;
}

/**
 * Fetch a target while validating every redirect hop, so an allowed URL
 * cannot bounce the worker towards an internal address.
 *
 * `redirect: 'follow'` is deliberately *not* used: the runtime would follow
 * the redirect without giving us a chance to validate the new location.
 */
export async function safeFetch(rawTarget, options = {}) {
  const {
    selfHosts = [],
    blocklist = [],
    allowedHosts = [],
    headers,
    method = 'GET',
    body,
    followRedirects = true,
    maxRedirects = MAX_REDIRECTS,
  } = options;

  const policy = { selfHosts, blocklist, allowedHosts };

  let current = validateTarget(rawTarget, policy);
  let currentMethod = method;
  let currentBody = body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response;
    try {
      response = await fetch(current.toString(), {
        method: currentMethod,
        headers,
        body: currentBody ?? undefined,
        redirect: 'manual',
      });
    } catch (error) {
      // Legacy HTTP-only sites: retry once over plain HTTP.
      if (hop === 0 && current.protocol === 'https:' && currentMethod === 'GET' && !currentBody) {
        current = new URL(current.toString().replace(/^https:/, 'http:'));
        response = await fetch(current.toString(), { method: currentMethod, headers, redirect: 'manual' });
      } else {
        throw new ProxyError(`Upstream request failed: ${error && error.message}`, 502);
      }
    }

    const location = response.headers.get('Location');
    const isRedirect = response.status >= 300 && response.status < 400 && location;

    if (!isRedirect || !followRedirects) {
      return { response, finalUrl: current };
    }

    if (hop === maxRedirects) {
      throw new ProxyError('Too many redirects', 502);
    }

    let next;
    try {
      next = new URL(location, current);
    } catch {
      throw new ProxyError('Upstream returned an invalid redirect', 502);
    }

    // Validate the new location *before* following it.
    current = validateTarget(next, policy);

    if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
      currentMethod = 'GET';
      currentBody = null;
    }
  }

  throw new ProxyError('Too many redirects', 502);
}

/**
 * Derive a sensible file name from a target URL.
 * Falls back to the host name when the path has no useful last segment.
 */
export function deriveFilename(targetUrl) {
  let parsed;
  try {
    parsed = targetUrl instanceof URL ? targetUrl : new URL(String(targetUrl));
  } catch {
    return 'download';
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  let name = segments.length ? segments[segments.length - 1] : '';
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep the raw value */
  }

  name = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!name || name === '.' || name === '..') {
    name = parsed.hostname || 'download';
  }
  return name.slice(0, 180);
}

/** Hostnames that belong to this deployment (used to stop self-proxying). */
export function collectSelfHosts(request, env = {}) {
  const hosts = new Set();
  try {
    hosts.add(new URL(request.url).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  if (env.CF_PAGES_URL) {
    try {
      hosts.add(new URL(env.CF_PAGES_URL).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  if (env.SELF_HOSTS) {
    for (const host of String(env.SELF_HOSTS).split(',')) {
      const trimmed = host.trim().toLowerCase();
      if (trimmed) hosts.add(trimmed);
    }
  }
  return [...hosts];
}
