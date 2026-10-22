import { decodePayload } from './codec.js';
import {
  validateTarget,
  collectSelfHosts,
  allowedTargetHosts,
  ProxyError,
} from './guard.js';
import { getBlocklist } from './blacklist.js';

/**
 * Build the validation policy for the current request.
 * Collected once so that every endpoint applies exactly the same rules.
 */
export async function buildPolicy(context) {
  const env = context.env || {};
  return {
    selfHosts: collectSelfHosts(context.request, env),
    blocklist: await getBlocklist(env),
    allowedHosts: allowedTargetHosts(env),
  };
}

/**
 * Decode a `data` token and resolve it to a validated, fetchable target.
 * Throws `ProxyError` with the appropriate HTTP status on failure.
 */
export async function resolveTarget(context, encodedData) {
  if (!encodedData) {
    throw new ProxyError('Data parameter is missing', 400);
  }

  let decoded;
  try {
    decoded = decodePayload(encodedData);
  } catch {
    throw new ProxyError('Malformed data parameter', 400);
  }

  if (!decoded.url || typeof decoded.url !== 'string') {
    throw new ProxyError('Malformed data parameter', 400);
  }

  const policy = await buildPolicy(context);
  const target = validateTarget(decoded.url, policy);

  return { target, decoded, policy };
}

/** The file name carried by a payload, with a safe fallback. */
export function payloadFilename(decoded) {
  if (!decoded || typeof decoded.filename !== 'string' || !decoded.filename) return 'download';
  return decoded.filename;
}
