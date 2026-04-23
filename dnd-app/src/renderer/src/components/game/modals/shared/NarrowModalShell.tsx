import type { ReactNode } from 'react'

interface NarrowModalShellProps {
  title: string
  onClose: () => void
  children: ReactNode
  zIndex?: string
}

/**
 * Shared shell for narrow (w-96) combat/mechanics modals.
 * Renders a centered backdrop + card with a standard header row.
 */
export default function NarrowModalShell({
  title,
  onClose,
  children,
  zIndex = 'z-30'
}: NarrowModalShellProps): JSX.Element {
  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
