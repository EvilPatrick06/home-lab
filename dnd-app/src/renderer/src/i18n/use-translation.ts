import { useTranslation } from 'react-i18next'
import type { TranslationKeys } from './types'

/**
 * Phase 34a — typed translation hook. Wraps react-i18next's `useTranslation`
 * and narrows the key to `TranslationKeys` (a `string` stub today; a literal
 * union after the 34k generator).
 */
export function useT(): { t: (key: TranslationKeys, opts?: Record<string, unknown>) => string } {
  const { t } = useTranslation()
  return { t: (key, opts) => t(key, opts ?? {}) as string }
}
