import { type ReactNode, useId } from 'react'
import { useT } from '../../i18n'
import { ModalScaffold } from './ModalScaffold'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  hideHeader?: boolean
}

/**
 * Thin header-chrome wrapper around ModalScaffold (PHASE-13 13L). The dialog
 * semantics + focus management live in ModalScaffold; Modal adds the pinned header
 * + scrolling body. NOTE: the root layer moved from Tailwind `z-50` to `Z.MODAL`
 * (60, via ModalScaffold) so modals sit above MODAL_BACKDROP-level overlays.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  className = 'max-w-lg',
  hideHeader = false
}: ModalProps): JSX.Element | null {
  const { t } = useT()
  const titleId = useId()

  return (
    <ModalScaffold
      open={open}
      onClose={onClose}
      labelledBy={title && !hideHeader ? titleId : undefined}
      ariaLabel={title && hideHeader ? title : undefined}
    >
      <div
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
    </ModalScaffold>
  )
}
