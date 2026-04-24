import type { Companion5e } from '../../../../types/companion'

interface CompanionStatusBannerProps {
  companion: Companion5e
  activeColor: string
  resummonColor: string
  onDismiss?: () => void
  onResummon?: () => void
}

/**
 * Displays the current status of a companion (familiar or steed) with
 * dismiss / resummon controls. The caller supplies the accent colour so
 * Familiar (amber/green) and Steed (blue) can both use this component.
 */
export default function CompanionStatusBanner({
  companion,
  activeColor,
  resummonColor,
  onDismiss,
  onResummon
}: CompanionStatusBannerProps): JSX.Element {
  return (
    <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700/50">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-200 font-medium">{companion.name}</span>
          <span
            className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
              companion.dismissed ? 'bg-gray-700 text-gray-400' : `${activeColor}`
            }`}
          >
            {companion.dismissed ? 'Dismissed' : 'Active'}
          </span>
          <span className="ml-2 text-xs text-gray-500">
            HP {companion.currentHP}/{companion.maxHP}
          </span>
        </div>
        <div className="flex gap-2">
          {companion.dismissed ? (
            <button
              onClick={onResummon}
              className={`px-3 py-1 text-xs ${resummonColor} text-white rounded cursor-pointer`}
            >
              Resummon
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
