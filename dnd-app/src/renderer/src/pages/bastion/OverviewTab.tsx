import { useState } from 'react'
import { useT } from '../../i18n'
import { useBastionStore } from '../../stores/use-bastion-store'
import type { Bastion } from '../../types/bastion'
import { getBpPerTurn } from '../../types/bastion'
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
    <div className="bg-surface border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${accent ? 'text-yellow-400' : 'text-fg'}`}>{value}</div>
    </div>
  )
}

function FactionRenownSection({ bastion }: { bastion: Bastion }): JSX.Element {
  const { t } = useT()
  const [newFaction, setNewFaction] = useState('')
  const renown = bastion.factionRenown ?? {}
  const factions = Object.entries(renown)

  const updateRenown = (updated: Record<string, number>): void => {
    useBastionStore.getState().updateBastionMetadata(bastion.id, { factionRenown: updated })
  }

  return (
    <div className="bg-surface border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">{t('pages.overviewTab.factionRenown')}</h3>
      {factions.length > 0 ? (
        <div className="space-y-2 mb-3">
          {factions.map(([name, value]) => (
            <div
              key={name}
              className="flex items-center justify-between text-xs bg-surface-2 rounded px-3 py-2 border border-border"
            >
              <span className="text-gray-200 capitalize">{name.replace(/-/g, ' ')}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateRenown({ ...renown, [name]: Math.max(0, value - 1) })}
                  className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                >
                  -
                </button>
                <span className="text-accent font-medium w-6 text-center">{value}</span>
                <button
                  onClick={() => updateRenown({ ...renown, [name]: value + 1 })}
                  className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                >
                  +
                </button>
                <button
                  onClick={() => {
                    const next = { ...renown }
                    delete next[name]
                    updateRenown(next)
                  }}
                  className="text-red-400 hover:text-red-300 ml-1 transition-colors"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-3">{t('pages.overviewTab.noFactionRenown')}</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newFaction}
          onChange={(e) => setNewFaction(e.target.value)}
          placeholder={t('pages.overviewTab.factionNamePlaceholder')}
          className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newFaction.trim()) {
              const key = newFaction.trim().toLowerCase().replace(/\s+/g, '-')
              updateRenown({ ...renown, [key]: 0 })
              setNewFaction('')
            }
          }}
        />
        <button
          onClick={() => {
            if (!newFaction.trim()) return
            const key = newFaction.trim().toLowerCase().replace(/\s+/g, '-')
            updateRenown({ ...renown, [key]: 0 })
            setNewFaction('')
          }}
          className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded transition-colors"
        >
          {t('pages.overviewTab.addFaction')}
        </button>
      </div>
    </div>
  )
}

export function OverviewTab({
  bastion,
  ownerLevel,
  maxSpecial,
  onStartTurn
}: {
  bastion: Bastion
  ownerLevel: number
  maxSpecial: number
  onStartTurn: () => void
}): JSX.Element {
  const { t } = useT()
  const daysSinceTurn = bastion.inGameTime.currentDay - bastion.inGameTime.lastBastionTurnDay
  const daysUntilTurn = Math.max(0, bastion.inGameTime.turnFrequencyDays - daysSinceTurn)
  const turnReady = daysUntilTurn === 0

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4">
        <SummaryCard label={t('pages.overviewTab.basicFacilities')} value={bastion.basicFacilities.length} />
        <SummaryCard
          label={t('pages.overviewTab.specialFacilities')}
          value={`${bastion.specialFacilities.length}/${maxSpecial}`}
        />
        <SummaryCard label={t('pages.overviewTab.defenders')} value={bastion.defenders.length} />
        <SummaryCard label={t('pages.overviewTab.treasury')} value={`${bastion.treasury} GP`} accent />
        <SummaryCard label={t('pages.overviewTab.bastionPoints')} value={`${bastion.bastionPoints} BP`} accent />
      </div>

      {/* Turn status */}
      <div className="bg-surface border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">{t('pages.overviewTab.turnStatus')}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {turnReady
                ? t('pages.overviewTab.turnReady')
                : t('pages.overviewTab.nextTurnIn', {
                    days: daysUntilTurn,
                    plural: daysUntilTurn !== 1 ? 's' : '',
                    frequency: bastion.inGameTime.turnFrequencyDays
                  })}
            </p>
            {getBpPerTurn(ownerLevel) > 0 && (
              <p className="text-xs text-purple-400 mt-1">
                {t('pages.overviewTab.earningBpPerTurn', { bp: getBpPerTurn(ownerLevel) })}
              </p>
            )}
          </div>
          <button
            onClick={onStartTurn}
            className={`px-4 py-2 text-sm rounded font-semibold transition-colors ${
              turnReady
                ? 'bg-amber-600 hover:bg-accent-strong text-white'
                : 'bg-surface-2 text-muted hover:text-gray-200'
            }`}
          >
            {turnReady ? t('pages.overviewTab.startTurn') : t('pages.overviewTab.forceTurn')}
          </button>
        </div>
      </div>

      {/* Construction queue */}
      {bastion.construction.length > 0 && (
        <div className="bg-surface border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">{t('pages.overviewTab.constructionQueue')}</h3>
          <div className="space-y-2">
            {bastion.construction.map((p) => {
              const pct = p.daysRequired > 0 ? Math.round((p.daysCompleted / p.daysRequired) * 100) : 100
              return (
                <div key={p.id} className="bg-surface-2 rounded p-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300 capitalize">
                      {p.projectType === 'add-special' && p.specialFacilityName
                        ? t('pages.overviewTab.building', { name: p.specialFacilityName })
                        : `${p.projectType.replace(/-/g, ' ')}${p.facilityType ? `: ${p.facilityType}` : ''}`}
                    </span>
                    <span className="text-gray-500">
                      {t('pages.overviewTab.constructionProgress', {
                        completed: p.daysCompleted,
                        required: p.daysRequired,
                        cost: p.cost
                      })}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div className="bg-accent-strong h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active orders */}
      {bastion.specialFacilities.some((f) => f.currentOrder) && (
        <div className="bg-surface border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">{t('pages.overviewTab.activeOrders')}</h3>
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

      {/* Active Charms */}
      {(bastion.activeCharms ?? []).length > 0 && (
        <div className="bg-surface border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-purple-300 mb-3">{t('pages.overviewTab.activeCharms')}</h3>
          <div className="space-y-2">
            {bastion.activeCharms.map((charm, i) => {
              const remaining = charm.grantedOnDay + charm.durationDays - bastion.inGameTime.currentDay
              return (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs bg-surface-2 rounded px-3 py-2 border border-border"
                >
                  <div>
                    <span className="text-purple-300 font-medium">{charm.name}</span>
                    <span className="text-gray-500 ml-2">{charm.description}</span>
                  </div>
                  <span className="text-muted">
                    {t('pages.overviewTab.daysLeft', {
                      remaining,
                      plural: remaining !== 1 ? 's' : ''
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Faction Renown */}
      <FactionRenownSection bastion={bastion} />

      {/* Notes */}
      <div className="bg-surface border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">{t('pages.overviewTab.notes')}</h3>
        <textarea
          value={bastion.notes}
          onChange={(e) => useBastionStore.getState().updateNotes(bastion.id, e.target.value)}
          placeholder={t('pages.overviewTab.notesPlaceholder')}
          rows={4}
          className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
        />
      </div>
    </div>
  )
}
