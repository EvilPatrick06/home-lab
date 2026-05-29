import { useEffect, useState } from 'react'
import { Z } from '../../constants'
import { useAccessibilityStore } from '../../stores/use-accessibility-store'

/**
 * Phase 18j — first-run screen-reader detection prompt.
 *
 * We can't detect a screen reader directly in the browser, but `prefers-reduced-
 * motion: reduce` is a strong correlate. On first launch, if the user hasn't yet
 * answered AND the OS requests reduced motion, ask once. Either answer persists
 * `screenReaderMode` (via the store), so the prompt never shows again.
 */
export default function ScreenReaderPrompt(): JSX.Element | null {
  const screenReaderModeSet = useAccessibilityStore((s) => s.screenReaderModeSet)
  const setScreenReaderMode = useAccessibilityStore((s) => s.setScreenReaderMode)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    try {
      setPrefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    } catch {
      setPrefersReducedMotion(false)
    }
  }, [])

  // Only prompt when the user has never answered and the OS hints reduced motion.
  if (screenReaderModeSet || !prefersReducedMotion) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex: Z.MODAL }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sr-prompt-title"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 text-center shadow-2xl">
        <h2 id="sr-prompt-title" className="text-lg font-bold text-gray-100 mb-2">
          Do you use a screen reader?
        </h2>
        <p className="text-sm text-gray-400 mb-5">
          Enabling Screen Reader Mode adds extra announcements for combat, dice, and turn changes. You can change this
          any time in Settings.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setScreenReaderMode(false)}
            className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer"
          >
            No
          </button>
          <button
            onClick={() => setScreenReaderMode(true)}
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
          >
            Yes, enable it
          </button>
        </div>
      </div>
    </div>
  )
}
