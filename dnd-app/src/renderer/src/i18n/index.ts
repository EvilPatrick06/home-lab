import { i18n } from './config'
import en from './locales/en.json'

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
