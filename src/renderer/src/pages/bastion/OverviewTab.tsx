import { useBastionStore } from '../../stores/use-bastion-store'
import type { Bastion } from '../../types/bastion'
import { ORDER_COLORS, ORDER_LABELS } from './bastion-constants'

export function SummaryCard({
  label,
  value,
  accent
}: {
  label: string
  value: string | number
  accent?: boolean
}): JSX.Element {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${accent ? 'text-yellow-400' : 'text-gray-100'}`}>{value}</div>
    </div>
  )
}

export function OverviewTab({
  bastion,
  ownerLevel: _ownerLevel,
  maxSpecial,
  onStartTurn
}: {
  bastion: Bastion
  ownerLevel: number
  maxSpecial: number
  onStartTurn: () => void
}): JSX.Element {
  const daysSinceTurn = bastion.inGameTime.currentDay - bastion.inGameTime.lastBastionTurnDay
  const daysUntilTurn = Math.max(0, bastion.inGameTime.turnFrequencyDays - daysSinceTurn)
  const turnReady = daysUntilTurn === 0

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Basic Facilities" value={bastion.basicFacilities.length} />
        <SummaryCard label="Special Facilities" value={`${bastion.specialFacilities.length}/${maxSpecial}`} />
        <SummaryCard label="Defenders" value={bastion.defenders.length} />
        <SummaryCard label="Treasury" value={`${bastion.treasury} GP`} accent />
      </div>

      {/* Turn status */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Bastion Turn Status</h3>
            <p className="text-xs text-gray-500 mt-1">
              {turnReady
                ? 'A bastion turn is ready! Assign orders and roll for events.'
                : `Next turn in ${daysUntilTurn} day${daysUntilTurn !== 1 ? 's' : ''} (every ${bastion.inGameTime.turnFrequencyDays} days)`}
            </p>
          </div>
          <button
            onClick={onStartTurn}
            className={`px-4 py-2 text-sm rounded font-semibold transition-colors ${
              turnReady ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {turnReady ? 'Start Turn' : 'Force Turn'}
          </button>
        </div>
      </div>

      {/* Construction queue */}
      {bastion.construction.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Construction Queue</h3>
          <div className="space-y-2">
            {bastion.construction.map((p) => {
              const pct = p.daysRequired > 0 ? Math.round((p.daysCompleted / p.daysRequired) * 100) : 100
              return (
                <div key={p.id} className="bg-gray-800 rounded p-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300 capitalize">
                      {p.projectType === 'add-special' && p.specialFacilityName
                        ? `Building: ${p.specialFacilityName}`
                        : `${p.projectType.replace(/-/g, ' ')}${p.facilityType ? `: ${p.facilityType}` : ''}`}
                    </span>
                    <span className="text-gray-500">
                      {p.daysCompleted}/{p.daysRequired} days ({p.cost} GP)
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active orders */}
      {bastion.specialFacilities.some((f) => f.currentOrder) && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Active Orders</h3>
          {bastion.specialFacilities
            .filter((f) => f.currentOrder)
            .map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs mb-1">
                <span className="text-gray-300">{f.name}:</span>
                <span className={`px-1.5 py-0.5 rounded border ${ORDER_COLORS[f.currentOrder!]}`}>
                  {ORDER_LABELS[f.currentOrder!]}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Notes */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Notes</h3>
        <textarea
          value={bastion.notes}
          onChange={(e) => useBastionStore.getState().updateNotes(bastion.id, e.target.value)}
          placeholder="Bastion notes..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
        />
      </div>
    </div>
  )
}
