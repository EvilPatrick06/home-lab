import { type ReactNode, type RefObject, useCallback, useEffect, useRef } from 'react'
import { Z } from '../../constants/z-index'

interface ModalScaffoldProps {
  open: boolean
  onClose: () => void
  /** id of the element labelling the dialog (preferred over ariaLabel). */
  labelledBy?: string
  /** Accessible name when there is no visible title element. */
  ariaLabel?: string
  /** Focus this on open instead of the first focusable (WAI-ARIA least-destructive hook). */
  initialFocusRef?: RefObject<HTMLElement | null>
  zIndex?: number
  backdropClassName?: string
  children: ReactNode
}

/**
 * Headless, correctly-layered modal-dialog scaffold (PHASE-13 13L). Owns the WAI-ARIA
 * mechanics — `role="dialog"` + `aria-modal`, focus trap, Escape, focus restore, and
 * initial focus — at `Z.MODAL` (above `Z.MODAL_BACKDROP`-level overlays). `ui/Modal.tsx`
 * wraps it with header chrome; new feature modals can adopt it directly.
 */
export function ModalScaffold({
  open,
  onClose,
  labelledBy,
  ariaLabel,
  initialFocusRef,
  zIndex,
  backdropClassName = 'absolute inset-0 bg-black/70',
  children
}: ModalScaffoldProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement
    const raf = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.[0]?.focus()
    })
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open, handleKeyDown, initialFocusRef])

  if (!open) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: zIndex ?? Z.MODAL }}>
      <div className={backdropClassName} onClick={onClose} aria-hidden="true" role="presentation" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  )
}
