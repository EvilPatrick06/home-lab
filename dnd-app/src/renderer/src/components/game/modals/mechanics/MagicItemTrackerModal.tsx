import { lazy, Suspense } from 'react'
import type { Campaign } from '../../../../types/campaign'

const MagicItemTracker = lazy(() => import('../../../campaign/MagicItemTracker'))

interface MagicItemTrackerModalProps {
  campaign: Campaign
  onClose: () => void
}

export default function MagicItemTrackerModal({ campaign, onClose }: MagicItemTrackerModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-amber-400">Magic Item Distribution</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <Suspense fallback={<div className="text-xs text-gray-500 p-2">Loading tracker...</div>}>
          <MagicItemTracker campaign={campaign} />
        </Suspense>
      </div>
    </div>
  )
}
