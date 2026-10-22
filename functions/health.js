import { getBlocklist } from '../lib/blacklist.js';
import { configuredAccessKey } from '../lib/auth.js';
import { jsonResponse } from '../lib/headers.js';

/**
 * `/health` — lightweight status endpoint.
 *
 * It reports how the deployment is configured without exposing any secret
 * values, which makes it handy for uptime checks.
 */
export async function onRequest(context) {
  const { env } = context;

  let blocklistSize = 0;
  try {
    blocklistSize = (await getBlocklist(env || {})).length;
  } catch {
    blocklistSize = -1;
  }

  return jsonResponse({
    status: 'ok',
    service: 'CF Web Proxy',
    version: 2,
    time: new Date().toISOString(),
    features: {
      accessKeyRequired: Boolean(configuredAccessKey(env || {})),
      blocklistEntries: blocklistSize,
      mediaProxyBase: env && env.MEDIA_PROXY_BASE ? env.MEDIA_PROXY_BASE : null,
    },
  });
}
