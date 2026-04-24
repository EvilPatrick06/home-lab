import type { Bastion } from '../../types/bastion'
import { SummaryCard } from './OverviewTab'

export function DefendersTab({
  bastion,
  onRecruit,
  onRemove,
  onBuildWalls
}: {
  bastion: Bastion
  onRecruit: () => void
  onRemove: (ids: string[]) => void
  onBuildWalls: () => void
}): JSX.Element {
  const barracks = bastion.specialFacilities.filter((f) => f.type === 'barrack')
  const hasArmory = bastion.specialFacilities.some((f) => f.type === 'armory')

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total Defenders" value={bastion.defenders.length} />
        <SummaryCard label="Barracks" value={barracks.length} />
        <SummaryCard label="Armory" value={hasArmory ? 'Stocked' : 'None'} />
      </div>

      {/* Defender roster by barrack */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">Defender Roster</h3>
          <button
            onClick={onRecruit}
            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
          >
            + Recruit
          </button>
        </div>
        {barracks.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-900 rounded-lg p-4">
            Build a Barrack special facility to recruit defenders.
          </div>
        ) : (
          barracks.map((barrack) => {
            const defenders = bastion.defenders.filter((d) => d.barrackId === barrack.id)
            const max = barrack.space === 'vast' ? 25 : 12
            return (
              <div key={barrack.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-gray-100">
                    {barrack.name} ({defenders.length}/{max})
                  </span>
                </div>
                {defenders.length === 0 ? (
                  <p className="text-xs text-gray-500">No defenders assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {defenders.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-1 text-xs bg-gray-800 rounded px-2 py-1 border border-gray-700"
                      >
                        <span className="text-gray-200">{d.name}</span>
                        {d.isUndead && <span className="text-purple-400">(Undead)</span>}
                        {d.isConstruct && <span className="text-orange-400">(Construct)</span>}
                        <button onClick={() => onRemove([d.id])} className="text-red-400 hover:text-red-300 ml-1">
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
        {/* Unassigned defenders */}
        {bastion.defenders.filter((d) => !d.barrackId).length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <span className="font-medium text-sm text-gray-100 mb-2 block">Unassigned Defenders</span>
            <div className="flex flex-wrap gap-2">
              {bastion.defenders
                .filter((d) => !d.barrackId)
                .map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-1 text-xs bg-gray-800 rounded px-2 py-1 border border-gray-700"
                  >
                    <span className="text-gray-200">{d.name}</span>
                    <button onClick={() => onRemove([d.id])} className="text-red-400 hover:text-red-300 ml-1">
                      x
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Defensive Walls */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-200">Defensive Walls</h3>
          <button
            onClick={onBuildWalls}
            className="px-3 py-1.5 text-sm border border-gray-600 hover:border-amber-600 text-gray-300 hover:text-amber-400 rounded transition-colors"
          >
            + Build Walls
          </button>
        </div>
        {bastion.defensiveWalls ? (
          <div className="text-xs text-gray-400">
            {bastion.defensiveWalls.squaresBuilt} squares built
            {bastion.defensiveWalls.fullyEnclosed && (
              <span className="text-green-400 ml-2">(Fully enclosed: -2 attack losses)</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No defensive walls. Each 5-ft square costs 250 GP and 10 days.</p>
        )}
      </div>
    </div>
  )
}
