/**
 * Global screen reader announcer using an aria-live region.
 *
 * Usage:
 *   import { announce } from './ScreenReaderAnnouncer'
 *   announce('Rolled 2d6+3 = 12')
 *
 * The component must be rendered once at the app root.
 */

import { useEffect, useRef, useState } from 'react'
import { useAccessibilityStore } from '../../stores/use-accessibility-store'

let pendingAnnouncement: string | null = null
let listener: (() => void) | null = null

/** Queue a text announcement for screen readers. */
export function announce(text: string): void {
  pendingAnnouncement = text
  listener?.()
}

export default function ScreenReaderAnnouncer(): JSX.Element | null {
  const screenReaderMode = useAccessibilityStore((s) => s.screenReaderMode)
  const [message, setMessage] = useState('')
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    listener = () => {
      if (pendingAnnouncement) {
        // Clear then set to force re-announcement of identical messages
        setMessage('')
        requestAnimationFrame(() => {
          setMessage(pendingAnnouncement ?? '')
          pendingAnnouncement = null
        })

        // Clear after a delay so it doesn't accumulate
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
        clearTimerRef.current = setTimeout(() => setMessage(''), 5000)
      }
    }
    return () => {
      listener = null
    }
  }, [])

  if (!screenReaderMode) return null

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
