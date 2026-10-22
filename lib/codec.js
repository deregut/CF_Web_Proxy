/**
 * URL-safe, UTF-8 safe base64 helpers.
 *
 * The original implementation used plain `btoa(JSON.stringify(...))` which:
 *   - throws on any non-ASCII URL (e.g. Persian/Chinese paths),
 *   - produces `+` and `/` characters that are mangled by query-string parsers
 *     (`+` is decoded as a space), randomly breaking download/watch links.
 *
 * We now use "base64url" (RFC 4648 §5) plus TextEncoder/TextDecoder so the
 * payload survives any URL context and supports every Unicode code point.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const CHUNK_SIZE = 0x8000;

export function encodeBase64Url(input) {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Malformed payload');
  }
  // Tolerate legacy payloads that used standard base64 and/or whitespace.
  let normalized = input.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  if (remainder === 1) {
    throw new Error('Malformed payload');
  }
  if (remainder) {
    normalized += '='.repeat(4 - remainder);
  }

  let binary;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error('Malformed payload');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return textDecoder.decode(bytes);
}

/**
 * Encode a JSON-serialisable object into a URL-safe token.
 *
 * `legacy: true` produces standard (padded) base64 instead of base64url.
 * It is only required for third party services that implement the original
 * `btoa(JSON.stringify(...))` scheme.
 */
export function encodePayload(value, { legacy = false } = {}) {
  const encoded = encodeBase64Url(JSON.stringify(value));
  if (!legacy) return encoded;
  return encoded.replace(/-/g, '+').replace(/_/g, '/');
}

/**
 * Decode a token produced by `encodePayload` (or by the legacy `btoa` scheme).
 * Throws `Error` when the token is not valid JSON.
 */
export function decodePayload(token) {
  const parsed = JSON.parse(decodeBase64Url(token));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Malformed payload');
  }
  return parsed;
}
