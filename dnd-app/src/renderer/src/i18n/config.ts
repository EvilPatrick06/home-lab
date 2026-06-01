import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * Phase 34a — i18n configuration. Locales are bundled directly (no async
 * backend) so init is synchronous and tests are deterministic. English is the
 * default; Spanish is the one translated alternate (picker-selectable).
 */
export const SUPPORTED_LOCALES = ['en', 'es'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/** Human-readable label per locale, for the language picker. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español'
}

export const i18n: I18nInstance = i18next.createInstance()

i18n.use(initReactI18next)
