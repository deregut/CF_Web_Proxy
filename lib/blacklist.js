/**
 * Domain blocklist.
 *
 * Notes on the original implementation:
 *   - It fetched `.../main/Functions/blacklist.txt` (capital "F"). GitHub raw
 *     paths are case sensitive, so the request always 404'd and the blocklist
 *     was effectively empty.
 *   - It re-fetched the list on *every* request, adding a full network round
 *     trip (and a hard dependency on GitHub being reachable) to every proxy
 *     request.
 *   - It only matched exact hostnames, so `www.example.com` slipped through
 *     when `example.com` was blocked.
 *
 * The list is now cached in module scope (survives between requests on the
 * same isolate), supports subdomain/wildcard matching, and degrades gracefully
 * to a built-in fallback when GitHub is unreachable.
 */

const DEFAULT_BLOCKLIST = [
  'example.com',
  'another-example.com',
];

const REMOTE_SOURCES = [
  'https://raw.githubusercontent.com/MinitorMHS/CF_Web_Proxy/main/functions/blacklist.txt',
];

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { list: DEFAULT_BLOCKLIST, expiresAt: 0 };

function parseList(text) {
  const entries = [];
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim().replace(/\r$/, '');
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    entries.push(line.toLowerCase().replace(/^\*\./, ''));
  }
  return entries;
}

/**
 * Load the blocklist. Order of preference:
 *   1. KV binding `BLACKLIST` (key `blacklist`) — fastest and fully under
 *      your control.
 *   2. The raw GitHub file (cached for 5 minutes).
 *   3. The built-in fallback list.
 */
export async function getBlocklist(env = {}) {
  const now = Date.now();
  if (cache.expiresAt > now) {
    return cache.list;
  }

  let list = null;

  const kv = env.BLACKLIST;
  if (kv && typeof kv.get === 'function') {
    try {
      const stored = await kv.get('blacklist');
      if (stored) list = parseList(stored);
    } catch (error) {
      console.error('blocklist: KV read failed:', error && error.message);
    }
  }

  if (!list) {
    const sources = env.BLACKLIST_URL
      ? [String(env.BLACKLIST_URL), ...REMOTE_SOURCES]
      : REMOTE_SOURCES;

    for (const source of sources) {
      try {
        const response = await fetch(source, {
          headers: { 'User-Agent': 'CF_Web_Proxy' },
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (!response.ok) {
          console.error('blocklist: fetch failed for', source, response.status);
          continue;
        }
        const parsed = parseList(await response.text());
        if (parsed.length) {
          list = parsed;
          break;
        }
      } catch (error) {
        console.error('blocklist: fetch error for', source, error && error.message);
      }
    }
  }

  const resolved = list && list.length ? list : DEFAULT_BLOCKLIST;
  cache = { list: resolved, expiresAt: now + CACHE_TTL_MS };
  return resolved;
}

/**
 * Match a hostname against the blocklist.
 * `example.com` blocks `example.com` and every sub-domain of it, but never
 * `notexample.com`.
 */
export function isBlockedHost(hostname, list = DEFAULT_BLOCKLIST) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  for (const entry of list) {
    if (!entry) continue;
    if (host === entry) return true;
    if (host.endsWith(`.${entry}`)) return true;
  }
  return false;
}
