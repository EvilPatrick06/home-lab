import { describe, expect, it } from 'vitest';
import { availableLocales, getCatalogKeys } from './i18n.js';

// Locale-completeness guard (S7 follow-up). The i18n foundation is only safe
// to expose via an in-app picker if every non-en catalog has EXACTLY the en
// keys — a missing key would silently fall back to English, and an extra key
// is dead weight that drifts from the source catalog. This test fails loudly
// on either, so partial catalogs can't ship unnoticed.
describe('i18n locale completeness', () => {
  const enKeys = [...getCatalogKeys('en')].sort();

  it('ships en plus at least one other locale', () => {
    expect(availableLocales()).toContain('en');
    expect(availableLocales().length).toBeGreaterThan(1);
  });

  for (const loc of availableLocales().filter((l) => l !== 'en')) {
    it(`"${loc}" has exactly the en keys (no missing, no extra)`, () => {
      const keys = [...getCatalogKeys(loc)].sort();
      const missing = enKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !enKeys.includes(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }
});
