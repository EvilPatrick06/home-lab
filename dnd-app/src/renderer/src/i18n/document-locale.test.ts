// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyDocumentLocale, i18n, initI18n } from './index'

describe('document <html lang>/<dir> tracking (Phase 56A / WEB-I18N-1)', () => {
  it('applyDocumentLocale sets lang + ltr dir for es/en', () => {
    applyDocumentLocale('es')
    expect(document.documentElement.lang).toBe('es')
    expect(document.documentElement.dir).toBe('ltr')
    applyDocumentLocale('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('a languageChanged event updates document.documentElement.lang', async () => {
    await initI18n()
    await i18n.changeLanguage('es')
    expect(document.documentElement.lang).toBe('es')
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
