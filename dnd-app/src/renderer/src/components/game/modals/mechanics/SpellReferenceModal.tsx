import QuickReferencePanel from '../../sidebar/QuickReferencePanel'

interface SpellReferenceModalProps {
  onClose: () => void
}

export default function SpellReferenceModal({ onClose }: SpellReferenceModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-[700px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Quick Reference</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <QuickReferencePanel onClose={onClose} />
        </div>
      </div>
    </div>
  )
}
