import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TranslationKeys } from './types'

/**
 * Phase 34a — typed translation hook. Wraps react-i18next's `useTranslation`
 * and narrows the key to `TranslationKeys` (a `string` stub today; a literal
 * union after the 34k generator).
 *
 * The wrapped `t` is memoized so it is a STABLE reference across renders
 * (react-i18next's underlying `t` only changes on a language/namespace change —
 * exactly when callers SHOULD re-run). Without this, `useT()` returned a
 * brand-new `t` every render, so any `useEffect([..., t])` that also called
 * setState looped forever → React #185 "Maximum update depth exceeded" (this is
 * what crashed LibraryPage from every entry point).
 */
export function useT(): { t: (key: TranslationKeys, opts?: Record<string, unknown>) => string } {
  const { t } = useTranslation()
  const stableT = useCallback(
    (key: TranslationKeys, opts?: Record<string, unknown>) => t(key, opts ?? {}) as string,
    [t]
  )
  return useMemo(() => ({ t: stableT }), [stableT])
}
