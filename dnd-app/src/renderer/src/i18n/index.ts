import { i18n } from './config'
import en from './locales/en.json'

/**
 * Phase 34a — initialize i18next once. Idempotent; resolves after English loads.
 * Call from main.tsx before rendering.
 */
export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return
  await i18n.init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false
  })
}

export { i18n } from './config'
export { useT } from './use-translation'
