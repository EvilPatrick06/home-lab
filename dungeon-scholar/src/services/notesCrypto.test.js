import { beforeEach, describe, expect, it } from 'vitest';
import { clearKeyCache, decryptPayload, deriveKey, encryptPayload, KDF_ITERATIONS } from './notesCrypto.js';

// Most tests use a low iteration count to keep the suite fast — the KDF cost is
// not what's under test (round-trip / tamper / wire-format are). One test below
// pins the real production floor.
const FAST = { iterations: 1000 };

describe('notesCrypto', () => {
  // Avoid cross-test cache bleed (same salt|iter could otherwise resolve a key
  // derived in a prior test); a clean slate keeps each case self-contained.
  beforeEach(() => {
    clearKeyCache();
  });

  it('pins the OWASP 2026 PBKDF2 iteration floor', () => {
    expect(KDF_ITERATIONS).toBe(600000);
  });

  it('round-trips ASCII plaintext', async () => {
    const pass = 'open sesame';
    const pt = 'meet at the tavern at dusk';
    const payload = await encryptPayload(pass, pt, FAST);
    expect(await decryptPayload(pass, payload)).toBe(pt);
  });

  it('round-trips unicode plaintext', async () => {
    const pass = 'pâsswörd-✨';
    const pt = 'Dragönslayer — 龍 — 🐉 emoji & accénts';
    const payload = await encryptPayload(pass, pt, FAST);
    expect(await decryptPayload(pass, payload)).toBe(pt);
  });

  it('rejects a wrong passphrase with decrypt-failed', async () => {
    const payload = await encryptPayload('right-pass', 'secret tome', FAST);
    await expect(decryptPayload('wrong-pass', payload)).rejects.toThrow('decrypt-failed');
  });

  it('rejects tampered ciphertext with decrypt-failed', async () => {
    const pass = 'tamper-test';
    const payload = await encryptPayload(pass, 'do not modify', FAST);

    // Flip one ciphertext byte: decode, mutate, re-encode.
    const ctBytes = Uint8Array.from(atob(payload.ct), (c) => c.charCodeAt(0));
    ctBytes[0] ^= 0xff;
    let s = '';
    for (const b of ctBytes) s += String.fromCharCode(b);
    const tampered = { ...payload, ct: btoa(s) };

    await expect(decryptPayload(pass, tampered)).rejects.toThrow('decrypt-failed');
  });

  it('produces a unique IV and ciphertext per encrypt', async () => {
    const pass = 'same-everything';
    const pt = 'identical plaintext';
    const a = await encryptPayload(pass, pt, FAST);
    const b = await encryptPayload(pass, pt, FAST);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('reuses a supplied salt and iterations', async () => {
    const pass = 'reuse-test';
    const first = await encryptPayload(pass, 'first note', FAST);
    const second = await encryptPayload(pass, 'second note', {
      salt: first.salt,
      iterations: first.iter,
    });
    // Supplied salt + iterations flow through unchanged...
    expect(second.salt).toBe(first.salt);
    expect(second.iter).toBe(first.iter);
    expect(second.iter).toBe(1000);
    // ...but the IV is still freshly random.
    expect(second.iv).not.toBe(first.iv);
  });

  it('rejects an unknown wire version with unsupported-version', async () => {
    const valid = await encryptPayload('v-test', 'versioned', FAST);
    await expect(decryptPayload('v-test', { ...valid, v: 2 })).rejects.toThrow('unsupported-version');
  });

  it('decrypts a committed fixture (pins the wire format)', async () => {
    // Generated once via encryptPayload('correct horse battery staple',
    // 'The dragon sleeps beneath the old keep.', { iterations: 1000 }).
    // Pasting the literal here freezes the wire format: any future refactor
    // that changes how payloads are produced/consumed will fail this test
    // rather than silently corrupting previously stored notes.
    const fixture = {
      v: 1,
      kdf: 'PBKDF2-SHA-256',
      iter: 1000,
      salt: 'jSWcimyrVtchwCkyQHzYBA==',
      iv: 'M1oOpVroNXc74CUg',
      ct: 'YbPwTrDB5rNf9pWzjqwiRGz8DA1kI83eeaVu/8vj4Eb5a9PkzNJRvvQ+bZxlm8pxzqOoBStllw==',
      updatedAt: 1781759978014,
    };
    expect(await decryptPayload('correct horse battery staple', fixture)).toBe(
      'The dragon sleeps beneath the old keep.',
    );
  });

  it('exposes a callable deriveKey returning a CryptoKey', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('derive-test', salt, 1000);
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('exports a clearKeyCache that does not throw', () => {
    expect(() => clearKeyCache()).not.toThrow();
  });
});
