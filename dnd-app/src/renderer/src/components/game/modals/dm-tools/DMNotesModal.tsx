import { FloatingWindow } from '../../../ui'
import { DMNotepad } from '../../dm'

interface DMNotesModalProps {
  onClose: () => void
  /** Phase 16c — render inside a non-blocking FloatingWindow instead of a blocking modal. */
  floating?: boolean
  /** Phase 16c — present when the tool can be floated; renders the Float button. */
  onFloat?: () => void
}

export default function DMNotesModal({ onClose, floating, onFloat }: DMNotesModalProps): JSX.Element {
  if (floating) {
    return (
      <FloatingWindow
        storageKey="notes"
        title="DM Notes"
        defaultPosition={{ x: 120, y: 100 }}
        defaultSize={{ width: 420, height: 460 }}
        resizable
        onClose={onClose}
      >
        <DMNotepad />
      </FloatingWindow>
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-lg w-full mx-4 shadow-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">DM Notes</h3>
          <div className="flex items-center gap-2">
            {onFloat && (
              <button
                onClick={onFloat}
                className="text-gray-500 hover:text-amber-300 text-xs cursor-pointer"
                title="Float this panel (keeps the map interactive)"
                aria-label="Float panel"
              >
                ⇱ Float
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <DMNotepad />
        </div>
      </div>
    </div>
  )
}
