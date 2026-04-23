import { useState } from 'react'

interface DisputeModalProps {
  /** The AI ruling text being disputed */
  ruling: string
  /** AI's cited source (rule, page number) */
  citation: string
  onUphold: () => void
  onOverride: (dmNote: string) => void
  onClose: () => void
}

/**
 * Dispute Resolution Modal — DM can review an AI ruling and uphold or override it.
 * When overridden, the DM note is logged to the campaign journal.
 */
export default function DisputeModal({
  ruling,
  citation,
  onUphold,
  onOverride,
  onClose
}: DisputeModalProps): JSX.Element {
  const [dmNote, setDmNote] = useState('')

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[28rem] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-amber-400">Rule Dispute</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* AI Ruling */}
        <div className="bg-gray-800 rounded-lg p-3 mb-3 border border-gray-700">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">AI Ruling</div>
          <div className="text-sm text-gray-200">{ruling}</div>
        </div>

        {/* Citation */}
        {citation && (
          <div className="bg-amber-900/20 rounded-lg p-3 mb-3 border border-amber-700/30">
            <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-1">Rules Citation</div>
            <div className="text-xs text-amber-200">{citation}</div>
          </div>
        )}

        {/* DM Override Note */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-1">DM Override Note (optional)</label>
          <textarea
            value={dmNote}
            onChange={(e) => setDmNote(e.target.value)}
            placeholder="Reason for overriding (logged to campaign journal)..."
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-amber-500 resize-none"
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onUphold}
            className="flex-1 py-2 text-xs font-semibold rounded-lg bg-green-700 hover:bg-green-600 text-white cursor-pointer"
          >
            Uphold Ruling
          </button>
          <button
            onClick={() => onOverride(dmNote.trim())}
            className="flex-1 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-600 text-white cursor-pointer"
          >
            Override
          </button>
        </div>

        <div className="text-[10px] text-gray-600 mt-2 text-center">
          Overridden rulings are logged to the DM Rulings Log.
        </div>
      </div>
    </div>
  )
}
