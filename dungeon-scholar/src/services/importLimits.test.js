import { describe, expect, it } from 'vitest';
import { checkImportSize, MAX_TOME_IMPORT_BYTES } from './importLimits.js';

describe('checkImportSize (PHASE-40 40A / L14)', () => {
  it('accepts a payload exactly at the limit', () => {
    expect(checkImportSize(MAX_TOME_IMPORT_BYTES)).toEqual({ ok: true });
  });

  it('rejects a payload one byte over the limit, with an MB-mentioning message', () => {
    const res = checkImportSize(MAX_TOME_IMPORT_BYTES + 1);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/MB/);
  });

  it('accepts a small payload', () => {
    expect(checkImportSize(1234)).toEqual({ ok: true });
  });

  it('fails open for undefined / non-number sizes (exotic File objects)', () => {
    expect(checkImportSize(undefined)).toEqual({ ok: true });
    expect(checkImportSize(null)).toEqual({ ok: true });
    expect(checkImportSize('big')).toEqual({ ok: true });
  });
});
