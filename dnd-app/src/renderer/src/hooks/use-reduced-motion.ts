import { useAccessibilityStore } from '../stores/use-accessibility-store'

/**
 * Phase 22a — single source of truth for "should I suppress animations?".
 *
 * Returns true when EITHER the in-app accessibility setting is on OR the OS
 * requests `prefers-reduced-motion: reduce`. Use this in React components that
 * drive JS/RAF/PixiJS animations the CSS `.reduce-motion` rules can't reach
 * (3D dice, fog/weather overlays, token tweens) — branch to the instant-result
 * path but always render the final state.
 */
export function useReducedMotion(): boolean {
  const storeFlag = useAccessibilityStore((s) => s.reducedMotion)
  const osPref =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  return storeFlag || osPref
}
