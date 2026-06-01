import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react'
import { useT } from '../../i18n'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  hideHeader?: boolean
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  className = 'max-w-lg',
  hideHeader = false
}: ModalProps): JSX.Element | null {
  const { t } = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

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
    const timer = requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.[0]?.focus()
    })
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(timer)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" role="presentation" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && !hideHeader ? titleId : undefined}
        aria-label={title && hideHeader ? title : undefined}
        className={`relative bg-surface border border-border rounded-lg w-full mx-4 max-h-[80vh] flex flex-col ${className}`}
      >
        {/* Phase 17e (GUI-9) — header is a non-scrolling sibling; only the body scrolls, so the
            title + close button stay pinned with long content. */}
        {!hideHeader && (
          <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
            {title && (
              <h2 id={titleId} className="text-xl font-bold">
                {title}
              </h2>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-2xl leading-none cursor-pointer ml-auto"
              aria-label={t('ui.modal.closeDialog')}
            >
              &times;
            </button>
          </div>
        )}
        <div className={`flex-1 overflow-y-auto px-6 pb-6 ${hideHeader ? 'pt-6' : ''}`}>{children}</div>
      </div>
    </div>
  )
}
