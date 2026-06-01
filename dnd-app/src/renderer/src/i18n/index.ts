import { i18n, type SupportedLocale } from './config'
import en from './locales/en.json'
import es from './locales/es.json'

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
