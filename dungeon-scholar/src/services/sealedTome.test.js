import { beforeAll, describe, expect, it } from 'vitest';
import {
  isSealedTome,
  PBKDF2_ITERATIONS,
  SEAL_VERSION,
  sealTome,
  unsealTome,
} from './sealedTome.js';

// Known-secret strings woven into the mini-tome so the secrecy assertion can
// prove they never leak into the envelope JSON.
const SECRET_BACK = 'The mitochondrion is the powerhouse — secret-back-π';
const SECRET_EXPLANATION = 'Because TLS 1.3 drops RSA key exchange — secret-explanation-✓';
const SECRET_ACCEPTED = 'rivest-shamir-adleman-secret-✗';
const SECRET_KB = 'Knowledge base body: the SHA-256 digest of … — secret-kb-✦';

const PASSPHRASE = 'correct horse battery staple';

function makeTome() {
  return {
    metadata: {
      id: 'tome-42',
      title: 'Cryptography Primer ✦',
      domain: 'Security',
      createdAt: 1700000000000,
    },
    flashcards: [
      { id: 'f1', front: 'What is the powerhouse of the cell?', back: SECRET_BACK },
      { id: 'f2', front: 'Unicode front ☣', back: 'plain back' },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Why was RSA key exchange removed?',
        choices: ['a', 'b', 'c'],
        explanation: SECRET_EXPLANATION,
        acceptedAnswers: [SECRET_ACCEPTED, 'rsa'],
      },
    ],
    labs: [{ id: 'l1', title: 'Lab one', steps: ['do a thing ⚙'] }],
    knowledge_base: SECRET_KB,
  };
}

describe('sealedTome', () => {
  let tome;
  let envelope;

  // One real 600k-iteration derive + seal, shared across the tests that need a
  // valid envelope, to keep the suite well under the time budget.
  beforeAll(async () => {
    tome = makeTome();
    envelope = await sealTome(tome, PASSPHRASE);
  });

  it('roundtrips: seal then unseal deep-equals the original tome', async () => {
    const out = await unsealTome(envelope, PASSPHRASE);
    expect(out).toEqual(tome);
  });

  it('rejects unseal with the wrong passphrase', async () => {
    await expect(unsealTome(envelope, 'wrong passphrase!!')).rejects.toThrow(
      'wrong-passphrase',
    );
  });

  it('rejects unseal when the ciphertext is tampered', async () => {
    const ct = envelope.cipher.ciphertext;
    // Flip one base64 char (somewhere past the GCM tag boundary safety: just
    // mutate index 0 to a different valid base64 char).
    const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    const tampered = { ...envelope, cipher: { ...envelope.cipher, ciphertext: flipped } };
    await expect(unsealTome(tampered, PASSPHRASE)).rejects.toThrow('wrong-passphrase');
  });

  it('keeps all secret content out of the envelope JSON (F3)', () => {
    const json = JSON.stringify(envelope);
    expect(json).not.toContain(SECRET_BACK);
    expect(json).not.toContain(SECRET_EXPLANATION);
    expect(json).not.toContain(SECRET_ACCEPTED);
    expect(json).not.toContain(SECRET_KB);
    // sanity: public metadata + counts ARE present
    expect(json).toContain('Cryptography Primer');
    expect(envelope.sealCounts).toEqual({ flashcards: 2, quiz: 1, labs: 1 });
  });

  describe('isSealedTome', () => {
    it('is true for a sealed envelope', () => {
      expect(isSealedTome(envelope)).toBe(true);
    });
    it('is false for a plain tome', () => {
      expect(isSealedTome(makeTome())).toBe(false);
    });
    it('is false for null', () => {
      expect(isSealedTome(null)).toBe(false);
    });
    it('is false for a future seal version', () => {
      expect(isSealedTome({ sealVersion: 2 })).toBe(false);
    });
  });

  describe('sealTome validation', () => {
    it('rejects a short passphrase', async () => {
      await expect(sealTome(makeTome(), 'short')).rejects.toThrow('weak-passphrase');
    });
    it('rejects an already-sealed input', async () => {
      await expect(sealTome(envelope, PASSPHRASE)).rejects.toThrow('already-sealed');
    });
    it('rejects a content-empty tome', async () => {
      const empty = { metadata: { id: 'e', title: 'Empty' }, flashcards: [], quiz: [], labs: [] };
      await expect(sealTome(empty, PASSPHRASE)).rejects.toThrow('empty-tome');
    });
    it('rejects a tome with no metadata', async () => {
      await expect(sealTome({ flashcards: [{ id: 'f' }] }, PASSPHRASE)).rejects.toThrow(
        'empty-tome',
      );
    });
  });

  it('exposes the documented constants', () => {
    expect(SEAL_VERSION).toBe(1);
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  // PHASE-41 41B: the import handlers accept a tome when it's a sealed envelope
  // OR a plain { metadata, flashcards } shape. Prove the combined predicate is
  // truthy for a sealed envelope (which lacks top-level flashcards).
  describe('import-guard predicate (41B)', () => {
    it('is truthy for a sealed envelope', () => {
      expect(isSealedTome(envelope) || (envelope.metadata && envelope.flashcards)).toBeTruthy();
      // A sealed envelope deliberately has no top-level flashcards array.
      expect(envelope.flashcards).toBeUndefined();
    });
    it('is truthy for a plain tome', () => {
      const plain = makeTome();
      expect(isSealedTome(plain) || (plain.metadata && plain.flashcards)).toBeTruthy();
    });
  });

  // PHASE-41 41B: the in-memory unlock state (unsealedTomes) is NEVER written to
  // playerState, but the library entry that DOES persist holds the envelope. A
  // serialized library row must leak no decrypted answer content.
  it('a persisted library row carrying the envelope leaks no secrets (41B)', () => {
    const persisted = JSON.stringify({ library: [{ id: 't1', data: envelope, progress: {} }] });
    expect(persisted).not.toContain(SECRET_BACK);
    expect(persisted).not.toContain(SECRET_EXPLANATION);
    expect(persisted).not.toContain(SECRET_ACCEPTED);
    expect(persisted).not.toContain(SECRET_KB);
    // sanity: the public title is still present in the persisted row.
    expect(persisted).toContain('Cryptography Primer');
  });
});
