import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'

interface NarrationOverlayProps {
  text: string
  onDismiss: () => void
  autoDismissSeconds?: number
}

export default function NarrationOverlay({ text, onDismiss, autoDismissSeconds }: NarrationOverlayProps): JSX.Element {
  const { t } = useT()
  const [visible, setVisible] = useState(false)
  const [remaining, setRemaining] = useState(autoDismissSeconds ?? 0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // PHASE-10 10I — move focus inside the dialog on open (WAI-ARIA modal pattern). The close
  // button is the only tabbable control + a focusable scroll region; a full focus trap is
  // overkill for a single-button transient overlay (Escape-to-close already exists).
  const closeRef = useRef<HTMLButtonElement>(null)

  const handleDismiss = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
    // Delay the actual dismiss to allow fade-out
    setTimeout(onDismiss, 300)
  }, [onDismiss])

  // Fade in on mount + move focus into the dialog
  useEffect(() => {
    const rafId = requestAnimationFrame(() => setVisible(true))
    closeRef.current?.focus()
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Auto-dismiss timer
  useEffect(() => {
    if (!autoDismissSeconds || autoDismissSeconds <= 0) return

    setRemaining(autoDismissSeconds)
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          handleDismiss()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [autoDismissSeconds, handleDismiss])

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleDismiss()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleDismiss])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleDismiss}
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Parchment text box */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('game.narrationOverlay.ariaLabel')}
        className="relative max-w-2xl mx-8 bg-amber-50 border-2 border-amber-700/60 rounded-lg shadow-2xl px-10 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative top border */}
        <div className="absolute top-0 left-4 right-4 h-0.5 bg-amber-700/30" />
        <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-amber-700/30" />

        {/* Scrollable narration — a long scene scrolls here so countdown/hint/close stay visible.
            tabIndex makes the region keyboard-scrollable (arrow keys). */}
        <div className="max-h-[60vh] overflow-y-auto" tabIndex={0} aria-label={t('game.narrationOverlay.ariaLabel')}>
          <p className="text-amber-950 font-serif text-lg leading-relaxed whitespace-pre-wrap text-center">{text}</p>
        </div>

        {/* Auto-dismiss countdown */}
        {autoDismissSeconds && autoDismissSeconds > 0 && remaining > 0 && (
          <div className="mt-4 flex flex-col items-center gap-1">
            <span className="text-xs text-amber-700/60 font-serif">
              {t('game.narrationOverlay.countdown', { remaining })}
            </span>
            <div className="w-32 h-1 bg-amber-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600/60 rounded-full transition-all duration-1000"
                style={{ width: `${(remaining / autoDismissSeconds) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Click to dismiss hint */}
        <p className="mt-4 text-center text-xs text-amber-700/40 font-serif">
          {t('game.narrationOverlay.dismissHint')}
        </p>

        {/* Close button */}
        <button
          ref={closeRef}
          onClick={handleDismiss}
          className="absolute top-2 right-3 text-amber-700/40 hover:text-amber-700 text-lg cursor-pointer transition-colors"
          title={t('game.narrationOverlay.dismiss')}
        >
          &#10005;
        </button>
      </div>
    </div>
  )
}
