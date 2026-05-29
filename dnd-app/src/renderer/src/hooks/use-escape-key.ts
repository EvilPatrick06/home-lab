import { useEffect } from 'react'

/**
 * Phase 17e (GUI-8) — dismiss a modal/overlay on the Escape key. Shared so the ~dozen
 * hand-rolled modal shells (that don't route through the common `Modal` component) get
 * consistent Escape handling without copy-pasting a `useEffect` into each.
 *
 * `stopPropagation` keeps a nested modal's Escape from also closing its parent.
 */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape, enabled])
}
