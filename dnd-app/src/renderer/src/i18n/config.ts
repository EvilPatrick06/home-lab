import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * Phase 34a — i18n configuration. English is bundled directly (no async backend)
 * so init is synchronous and tests are deterministic. Additional locales are
 * added to `resources` (or swapped to a lazy backend) in a later sweep.
 */
export const SUPPORTED_LOCALES = ['en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const i18n: I18nInstance = i18next.createInstance()

i18n.use(initReactI18next)
