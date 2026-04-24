import { useAccessibilityStore } from '../stores/use-accessibility-store'

/**
 * Returns whether animations should be reduced, respecting both
 * the in-app setting and the OS-level prefers-reduced-motion media query.
 */
export function useReducedMotion(): boolean {
  const storeSetting = useAccessibilityStore((s) => s.reducedMotion)

  if (storeSetting) return true

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  return false
}
