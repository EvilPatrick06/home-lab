import { i18n, type SupportedLocale } from './config'
import en from './locales/en.json'
import es from './locales/es.json'

// WEB-I18N-1 — keep <html lang>/<dir> in lockstep with the active locale. The
// entry HTML files hardcode lang="en" as a sensible default; without this the
// attribute never updated on a language switch, so screen readers + translation
// tooling treated Spanish content as English. `dir` is `ltr` for en/es today;
// wiring `dirFor` now makes adding an RTL locale a one-line change.
const RTL_LOCALES = new Set<string>([])

function dirFor(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale.split('-')[0]) ? 'rtl' : 'ltr'
}

/** Set the document's lang + dir from a locale. No-op outside a DOM (node tests). */
export function applyDocumentLocale(locale: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = dirFor(locale)
}

// Registered at module load (not inside initI18n) so it stays active even when
// initI18n early-returns on an already-initialized singleton, and fires for
// every change path including the App's post-settings-load locale switch.
i18n.on('languageChanged', applyDocumentLocale)

/**
 * Phase 34a — initialize i18next once. Idempotent; resolves after English loads.
 * Call from main.tsx before rendering.
 */
export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return
  // Phase 34a — single default namespace `translation` holding the whole
  // en.json tree. Keys are addressed by their full dotted path
  // (`t('common.actions.save')`, `t('lobby.title')`, …), where `common`,
  // `lobby`, … are top-level objects inside en.json. This is deliberately
  // NOT `defaultNS: 'common'` — that would make `t('actions.save')` resolve
  // but break every `t('common.*')` / `t('lobby.*')` call the sweeps add.
  await i18n.init({
    // Default `lng` stays 'en' so first paint + the test suite are deterministic;
    // App switches post-settings-load if a locale (es) is persisted.
    resources: { en: { translation: en }, es: { translation: es } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false
  })
  // First paint: reflect the initialized locale immediately.
  applyDocumentLocale(i18n.language)
}

/**
 * Switch the active locale and persist the choice to app settings so it
 * survives a relaunch. No-ops on an unsupported locale.
 */
export async function setLocale(lng: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(lng)
  try {
    const settings = await window.api.loadSettings()
    await window.api.saveSettings({ ...settings, language: lng })
  } catch {
    /* best-effort persist — the language still changed for this session */
  }
}

export { i18n, LOCALE_LABELS, SUPPORTED_LOCALES, type SupportedLocale } from './config'
export { useT } from './use-translation'
