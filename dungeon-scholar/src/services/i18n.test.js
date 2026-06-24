import { describe, expect, it } from 'vitest';
import { availableLocales, getLocale, setLocale, t } from './i18n.js';

describe('i18n (S7)', () => {
  it('returns catalog values for known keys', () => {
    expect(t('action.cancel')).toBe('Cancel');
    expect(t('nav.library')).toBe('The Grand Library');
  });
  it('falls back to the provided fallback, then the key', () => {
    expect(t('does.not.exist', 'Fallback')).toBe('Fallback');
    expect(t('does.not.exist')).toBe('does.not.exist');
  });
  it('defaults to en and ignores unknown locales', () => {
    expect(getLocale()).toBe('en');
    setLocale('zz');
    expect(getLocale()).toBe('en');
    expect(availableLocales()).toContain('en');
  });
});
