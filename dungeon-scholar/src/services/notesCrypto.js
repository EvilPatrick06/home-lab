// notesCrypto — generic, dependency-free passphrase encryption for string
// payloads, built on the WebCrypto SubtleCrypto API only (no app imports, no
// npm deps). Reusable as a standalone leaf service (e.g. by sealed tomes).
//
// Wire format (versioned so future refactors can't silently break stored
// payloads): see PAYLOAD_VERSION + the object returned by encryptPayload.

/**
 * PBKDF2-HMAC-SHA-256 iteration count. OWASP 2026 floor for PBKDF2-SHA-256.
 * Exported so callers can surface it / compare against stored payloads.
 */
export const KDF_ITERATIONS = 600_000;

/**
 * Hard ceiling on an IMPORTED payload's PBKDF2 iteration count. Encrypted notes
 * travel inside importable/shareable tomes, so `payload.iter` is untrusted; an
 * unbounded value would make decryptPayload run PBKDF2 effectively forever and
 * freeze the main thread (DoS). decryptPayload rejects any payload above this.
 * The legitimate production value (KDF_ITERATIONS = 600_000) sits well under it.
 * No floor is enforced here: this is a generic leaf service whose callers choose
 * the iteration count (and may legitimately use small counts in tests), so the
 * production floor is owned by those callers, not this primitive.
 */
export const MAX_KDF_ITERATIONS = 2_000_000;

// Bumped only on incompatible wire-format changes. decryptPayload rejects any
// other version with `unsupported-version`.
const PAYLOAD_VERSION = 1;

// ---- base64 helpers over Uint8Array --------------------------------------
const toB64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// ---- derived-key cache ----------------------------------------------------
// Keyed by `${passphrase}|${saltB64}|${iterations}` — the passphrase component
// is required for correctness (two passphrases sharing a salt must not collide).
// Caches the non-extractable CryptoKey so repeated saves in one session don't
// re-pay the ~100-300ms derivation cost.
// Never persisted — process-memory only, cleared via clearKeyCache().
const keyCache = new Map();

/**
 * Clear the in-memory derived-key cache. Safe to call any time; never throws.
 */
export function clearKeyCache() {
  keyCache.clear();
}

/**
 * Derive a 256-bit AES-GCM key from a passphrase + salt via PBKDF2-SHA-256.
 * Result is non-extractable and usable for encrypt/decrypt. Caches by
 * passphrase|salt|iterations so repeated derivations in a session are free.
 *
 * @param {string} passphrase
 * @param {Uint8Array} saltBytes
 * @param {number} [iterations]
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, saltBytes, iterations = KDF_ITERATIONS) {
  const cacheKey = `${passphrase}|${toB64(saltBytes)}|${iterations}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(cacheKey, key);
  return key;
}

/**
 * Encrypt a string with a passphrase. Always uses a fresh random 12-byte IV;
 * salt is supplied (base64) or freshly generated (16 random bytes).
 *
 * @param {string} passphrase
 * @param {string} plaintext
 * @param {{ salt?: string, iterations?: number }} [opts]
 * @returns {Promise<{ v: number, kdf: string, iter: number, salt: string, iv: string, ct: string, updatedAt: number }>}
 */
export async function encryptPayload(passphrase, plaintext, { salt, iterations } = {}) {
  const saltBytes = salt ? fromB64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const iter = iterations ?? KDF_ITERATIONS;
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(passphrase, saltBytes, iter);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));

  return {
    v: PAYLOAD_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iter,
    salt: toB64(saltBytes),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ctBuf)),
    updatedAt: Date.now(),
  };
}

/**
 * Decrypt a payload produced by encryptPayload. Throws `unsupported-version`
 * for an unknown wire version, `bad-iterations` if the declared PBKDF2 count is
 * not a positive integer within the accepted ceiling (so an untrusted imported
 * payload can't dictate unbounded KDF work), or `decrypt-failed` on any
 * decryption failure (wrong passphrase, tampered ciphertext, malformed input).
 *
 * @param {string} passphrase
 * @param {{ v: number, iter: number, salt: string, iv: string, ct: string }} payload
 * @returns {Promise<string>}
 */
export async function decryptPayload(passphrase, payload) {
  if (payload.v !== PAYLOAD_VERSION) throw new Error('unsupported-version');

  // payload.iter is attacker-controlled for imported notes; reject a
  // non-integer or above-ceiling count before deriveKey so a hostile payload
  // can't pin the main thread on an unbounded PBKDF2 run (DoS).
  if (!Number.isInteger(payload.iter) || payload.iter < 1 || payload.iter > MAX_KDF_ITERATIONS) {
    throw new Error('bad-iterations');
  }

  const saltBytes = fromB64(payload.salt);
  const key = await deriveKey(passphrase, saltBytes, payload.iter);

  try {
    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.ct));
    return new TextDecoder().decode(ptBuf);
  } catch {
    throw new Error('decrypt-failed');
  }
}
