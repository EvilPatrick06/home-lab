// Sealed tomes (audit F3). A sealed tome's entire study content (flashcards,
// quiz, labs, knowledge_base) is AES-256-GCM-encrypted under a key derived from
// a proctor passphrase via PBKDF2-HMAC-SHA256. Only metadata + content counts
// stay public. Protects content at rest (repo, localStorage, Supabase row,
// exports, share codes) and from view-source; does NOT protect against a user
// inspecting memory/React state while a tome is unlocked.
export const SEAL_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;

// Accepted PBKDF2 iteration band for IMPORTED envelopes. A sealed tome is
// shareable/importable (share codes / paste), so `kdf.iterations` is
// attacker-controlled; an unbounded value (e.g. 1e12) would make deriveKey run
// PBKDF2 effectively forever and freeze the main thread (DoS). An imported
// envelope must declare an integer count within [MIN, MAX]; the legitimate
// production value (PBKDF2_ITERATIONS = 600_000) sits inside it. The floor also
// blocks a hostile envelope from downgrading KDF strength.
export const MIN_PBKDF2_ITERATIONS = 100_000;
export const MAX_PBKDF2_ITERATIONS = 2_000_000;

/**
 * Is `n` an accepted PBKDF2 iteration count (integer within the import band)?
 * @param {*} n
 * @returns {boolean}
 */
export function isValidIterations(n) {
  return Number.isInteger(n) && n >= MIN_PBKDF2_ITERATIONS && n <= MAX_PBKDF2_ITERATIONS;
}

// Minimum passphrase length for user-chosen encryption passphrases. Shared
// with the private-notes create flow (TomeNotes.jsx) so the two passphrase
// surfaces cannot drift apart again — the KDF work factor is only as strong as
// the entropy of the secret it stretches (SECURITY-LOG 2026-07-16).
export const MIN_PASSPHRASE_LEN = 8;

// Random-byte counts for the per-tome salt + AES-GCM IV.
const SALT_BYTES = 16;
const IV_BYTES = 12;

// ---- chunk-safe base64 helpers -------------------------------------------
// Tomes can be multi-MB; String.fromCharCode.apply(null, hugeArray) overflows
// the call-stack / arg limit, so encode in <=0x8000-byte slices. Decode walks
// the binary string byte-by-byte (apply-free) into a Uint8Array.
const CHUNK = 0x8000;

/**
 * Encode a Uint8Array to base64 in stack-safe chunks.
 * @param {Uint8Array} uint8
 * @returns {string}
 */
export function b64(uint8) {
  let s = '';
  for (let i = 0; i < uint8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/**
 * Decode a base64 string to a Uint8Array (apply-free byte loop).
 * @param {string} str
 * @returns {Uint8Array}
 */
export function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Structural check: does `data` look like a sealed-tome envelope?
 * @param {*} data
 * @returns {boolean}
 */
export function isSealedTome(data) {
  return !!(
    data &&
    data.sealVersion === SEAL_VERSION &&
    data.cipher &&
    typeof data.cipher.ciphertext === 'string' &&
    data.kdf &&
    typeof data.kdf.salt === 'string' &&
    Number.isInteger(data.kdf.iterations)
  );
}

/**
 * Derive a non-extractable 256-bit AES-GCM key from a passphrase via
 * PBKDF2-HMAC-SHA-256. Honors the supplied salt + iteration count so unseal can
 * rebuild the key from a stored envelope (forward-compat with future iters).
 * @param {string} passphrase
 * @param {Uint8Array} saltBytes
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase, saltBytes, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    /** @type {BufferSource} */ (new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: /** @type {BufferSource} */ (saltBytes), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Seal (encrypt) an entire tome under a proctor passphrase. The full tome JSON
 * becomes opaque ciphertext; only metadata + per-section counts stay public.
 *
 * @param {object} tomeData - must have `.metadata` and a non-empty union of
 *   `flashcards` / `quiz` / `labs` arrays.
 * @param {string} passphrase - >= 8 chars.
 * @returns {Promise<object>} the sealed envelope.
 * @throws {Error} `empty-tome` | `weak-passphrase` | `already-sealed`
 */
export async function sealTome(tomeData, passphrase) {
  // Reject an already-sealed envelope first: it has `metadata` but no top-level
  // content arrays, so it would otherwise trip the empty-tome guard below.
  if (isSealedTome(tomeData)) throw new Error('already-sealed');

  if (!tomeData?.metadata) throw new Error('empty-tome');
  const contentCount = (tomeData.flashcards?.length || 0) + (tomeData.quiz?.length || 0) + (tomeData.labs?.length || 0);
  if (contentCount === 0) throw new Error('empty-tome');

  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LEN) {
    throw new Error('weak-passphrase');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);

  const plaintext = new TextEncoder().encode(JSON.stringify(tomeData));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    sealVersion: SEAL_VERSION,
    metadata: { ...tomeData.metadata, sealed: true },
    sealCounts: {
      flashcards: (tomeData.flashcards || []).length,
      quiz: (tomeData.quiz || []).length,
      labs: (tomeData.labs || []).length,
    },
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: b64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: b64(iv),
      ciphertext: b64(new Uint8Array(ct)),
    },
  };
}

/**
 * Unseal (decrypt) a sealed-tome envelope back to the original tome object.
 * Rebuilds the key honoring the STORED iteration count.
 *
 * @param {object} envelope - a sealed envelope (see isSealedTome).
 * @param {string} passphrase
 * @returns {Promise<object>} the original tome data.
 * @throws {Error} `not-sealed` | `bad-iterations` | `wrong-passphrase`
 */
export async function unsealTome(envelope, passphrase) {
  if (!isSealedTome(envelope)) throw new Error('not-sealed');

  // The envelope is attacker-controlled (sealed tomes are importable/shareable),
  // so its KDF iteration count is untrusted. Hard-reject anything outside the
  // accepted band BEFORE deriveKey, so a hostile envelope can't dictate an
  // unbounded PBKDF2 run that freezes the main thread (DoS) — defense-in-depth
  // alongside the isSealedTome integer check.
  if (!isValidIterations(envelope.kdf.iterations)) throw new Error('bad-iterations');

  const saltBytes = unb64(envelope.kdf.salt);
  const key = await deriveKey(passphrase, saltBytes, envelope.kdf.iterations);

  let pt;
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: /** @type {BufferSource} */ (unb64(envelope.cipher.iv)) },
      key,
      /** @type {BufferSource} */ (unb64(envelope.cipher.ciphertext)),
    );
  } catch {
    // OperationError: wrong passphrase or tampered ciphertext.
    throw new Error('wrong-passphrase');
  }
  return JSON.parse(new TextDecoder().decode(pt));
}
