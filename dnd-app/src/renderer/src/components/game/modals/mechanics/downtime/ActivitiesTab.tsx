import { useState } from 'react'
import { useT } from '../../../../../i18n'
import {
  addDowntimeProgress,
  advanceTrackedDowntime,
  calculateDowntimeCost,
  type DowntimeActivity,
  updateDowntimeProgress
} from '../../../../../services/downtime-service'
import type { Campaign, DowntimeProgressEntry } from '../../../../../types/campaign'
import { cryptoRandom } from '../../../../../utils/crypto-random'

// ═══════════════════════════════════════════════════════════════
// Activities Tab (PHB)
// ═══════════════════════════════════════════════════════════════

export default function ActivitiesTab({
  activities,
  activeEntries,
  characterId,
  characterName,
  campaign,
  onApply,
  onClose,
  saveCampaign,
  onBroadcastResult
}: {
  activities: DowntimeActivity[]
  activeEntries: DowntimeProgressEntry[]
  characterId?: string
  characterName?: string
  campaign: Campaign
  onApply?: (activity: string, days: number, goldCost: number, details: string) => void
  onClose: () => void
  saveCampaign: (c: Campaign) => void
  onBroadcastResult?: (message: string) => void
}): JSX.Element {
  const { t } = useT()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [days, setDays] = useState(1)
  const [selectedRarity, setSelectedRarity] = useState('')
  const [selectedSpellLevel, setSelectedSpellLevel] = useState(0)
  const [selectedPotion, setSelectedPotion] = useState('')

  const selected = activities.find((a) => a.id === selectedId)
  const cost = selected
    ? calculateDowntimeCost(selected, days, {
        rarity: selectedRarity || undefined,
        spellLevel: selectedSpellLevel,
        potionType: selectedPotion || undefined
      })
    : null

  const handleApply = (): void => {
    if (!selected || !cost) return
    const details =
      selectedRarity ||
      selectedPotion ||
      (selected.spellLevelTable ? t('game.activitiesTab.spellDetails', { level: selectedSpellLevel }) : '')
    onApply?.(selected.name, cost.days, cost.goldCost, details)
    onClose()
  }

  const handleTrackProgress = (): void => {
    if (!selected || !cost || !characterId) return
    const details =
      selectedRarity ||
      selectedPotion ||
      (selected.spellLevelTable ? t('game.activitiesTab.spellDetails', { level: selectedSpellLevel }) : '')
    const entry: DowntimeProgressEntry = {
      id: `dt-${Date.now()}-${cryptoRandom().toString(36).slice(2, 8)}`,
      activityId: selected.id,
      activityName: selected.name,
      characterId,
      characterName: characterName ?? t('game.activitiesTab.unknown'),
      daysSpent: 0,
      daysRequired: cost.days,
      goldSpent: 0,
      goldRequired: cost.goldCost,
      startedAt: new Date().toISOString(),
      details: details || undefined,
      status: 'in-progress'
    }
    saveCampaign(addDowntimeProgress(campaign, entry))
    onBroadcastResult?.(
      t('game.activitiesTab.broadcastStarted', {
        name: characterName,
        activity: selected.name,
        details: details ? ` (${details})` : '',
        days: cost.days,
        gold: cost.goldCost.toLocaleString()
      })
    )
  }

  const handleAdvance = (entryId: string, advDays: number): void => {
    const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entryId, advDays)
    saveCampaign(updated)
    const entry = (updated.downtimeProgress ?? []).find((e) => e.id === entryId)
    if (entry) {
      if (complete) {
        onBroadcastResult?.(
          t('game.activitiesTab.broadcastCompleted', {
            name: entry.characterName,
            activity: entry.activityName,
            details: entry.details ? ` (${entry.details})` : ''
          })
        )
      } else {
        onBroadcastResult?.(
          t('game.activitiesTab.broadcastAdvanced', {
            name: entry.characterName,
            activity: entry.activityName,
            spent: entry.daysSpent,
            required: entry.daysRequired
          })
        )
      }
    }
  }

  const handleAbandon = (entryId: string): void => {
    const entry = (campaign.downtimeProgress ?? []).find((e) => e.id === entryId)
    saveCampaign(updateDowntimeProgress(campaign, entryId, { status: 'abandoned' }))
    if (entry) {
      onBroadcastResult?.(
        t('game.activitiesTab.broadcastAbandoned', { name: entry.characterName, activity: entry.activityName })
      )
    }
  }

  return (
    <div className="space-y-3">
      {/* Active progress entries */}
      {activeEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted">{t('game.activitiesTab.activeProgress')}</h3>
          {activeEntries.map((entry) => (
            <div key={entry.id} className="bg-surface-2/50 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-300">{entry.activityName}</span>
                <span className="text-xs text-gray-500">
                  {t('game.activitiesTab.daysProgress', { spent: entry.daysSpent, required: entry.daysRequired })}
                </span>
              </div>
              {entry.details && <p className="text-xs text-gray-500 mb-1">{entry.details}</p>}
              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
                <div
                  className="bg-accent-strong h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (entry.daysSpent / entry.daysRequired) * 100)}%` }}
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAdvance(entry.id, 1)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  {t('game.activitiesTab.plusOneDay')}
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  {t('game.activitiesTab.plusFiveDays')}
                </button>
                {entry.daysSpent >= entry.daysRequired && (
                  <button
                    onClick={() => {
                      saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'completed' }))
                      onBroadcastResult?.(
                        t('game.activitiesTab.broadcastCompletedSimple', {
                          name: entry.characterName,
                          activity: entry.activityName
                        })
                      )
                    }}
                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    {t('game.activitiesTab.complete')}
                  </button>
                )}
                <button
                  onClick={() => handleAbandon(entry.id)}
                  className="px-2 py-0.5 text-xs bg-red-600/50 hover:bg-red-600 text-red-300 rounded cursor-pointer ml-auto"
                >
                  {t('game.activitiesTab.abandon')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity list */}
      <div className="space-y-1">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => {
              setSelectedId(activity.id)
              if (activity.rarityTable) setSelectedRarity(activity.rarityTable[0].rarity)
              if (activity.spellLevelTable) setSelectedSpellLevel(0)
              if (activity.potionTable) setSelectedPotion(activity.potionTable[0].type)
            }}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
              selectedId === activity.id
                ? 'bg-amber-600/20 border border-amber-500/50 text-amber-300'
                : 'bg-surface-2/50 border border-border/50 text-gray-300 hover:bg-surface-2'
            }`}
          >
            <div className="font-semibold">{activity.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{activity.reference}</div>
          </button>
        ))}
      </div>

      {/* Selected activity details */}
      {selected && (
        <div className="bg-surface-2/50 border border-border rounded-lg p-3 space-y-2">
          <p className="text-xs text-gray-300 leading-relaxed">{selected.description}</p>

          {selected.requirements.length > 0 && (
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-muted">{t('game.activitiesTab.requirements')}</span>{' '}
              {selected.requirements.join(', ')}
            </div>
          )}

          <div className="text-xs text-accent">
            <span className="font-semibold">{t('game.activitiesTab.outcome')}</span> {selected.outcome}
          </div>

          {/* Rarity selector */}
          {selected.rarityTable && (
            <div className="space-y-1">
              <label className="text-xs text-muted font-semibold">{t('game.activitiesTab.itemRarity')}</label>
              <div className="flex flex-wrap gap-1">
                {selected.rarityTable.map((r) => (
                  <button
                    key={r.rarity}
                    onClick={() => setSelectedRarity(r.rarity)}
                    className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
                      selectedRarity === r.rarity
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-700 text-muted hover:bg-gray-600'
                    }`}
                  >
                    {r.rarity}{' '}
                    {t('game.activitiesTab.rarityMeta', {
                      days: r.days,
                      gold: r.goldCost.toLocaleString(),
                      level: r.minLevel
                    })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Spell level selector */}
          {selected.spellLevelTable && (
            <div className="space-y-1">
              <label className="text-xs text-muted font-semibold">{t('game.activitiesTab.spellLevel')}</label>
              <div className="flex flex-wrap gap-1">
                {selected.spellLevelTable.map((r) => (
                  <button
                    key={r.level}
                    onClick={() => setSelectedSpellLevel(r.level)}
                    className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
                      selectedSpellLevel === r.level
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-700 text-muted hover:bg-gray-600'
                    }`}
                  >
                    {r.level === 0
                      ? t('game.activitiesTab.cantrip')
                      : t('game.activitiesTab.spellLevelLabel', { level: r.level })}{' '}
                    {t('game.activitiesTab.spellMeta', { days: r.days, gold: r.goldCost.toLocaleString() })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Potion type selector */}
          {selected.potionTable && (
            <div className="space-y-1">
              <label className="text-xs text-muted font-semibold">{t('game.activitiesTab.potionType')}</label>
              <div className="flex flex-wrap gap-1">
                {selected.potionTable.map((r) => (
                  <button
                    key={r.type}
                    onClick={() => setSelectedPotion(r.type)}
                    className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
                      selectedPotion === r.type ? 'bg-amber-600 text-white' : 'bg-gray-700 text-muted hover:bg-gray-600'
                    }`}
                  >
                    {r.type} {t('game.activitiesTab.potionMeta', { days: r.days, gold: r.goldCost, heals: r.heals })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Days input */}
          {selected.daysRequired > 0 && !selected.rarityTable && !selected.spellLevelTable && !selected.potionTable && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted font-semibold">{t('game.activitiesTab.days')}</label>
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 bg-surface-2 border border-gray-600 rounded text-center text-xs text-gray-200 px-1 py-0.5"
              />
            </div>
          )}

          {/* Cost summary */}
          {cost && (
            <div className="flex items-center gap-4 pt-1 border-t border-border">
              <span className="text-xs text-muted">
                {t('game.activitiesTab.time')}{' '}
                <span className="text-white font-semibold">
                  {t('game.activitiesTab.daysCount', { count: cost.days })}
                </span>
              </span>
              <span className="text-xs text-muted">
                {t('game.activitiesTab.cost')}{' '}
                <span className="text-accent font-semibold">
                  {t('game.activitiesTab.goldAmount', { gold: cost.goldCost.toLocaleString() })}
                </span>
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleApply}
              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer"
            >
              {t('game.activitiesTab.startActivity')}
            </button>
            {characterId && cost && cost.days > 1 && (
              <button
                onClick={handleTrackProgress}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer"
              >
                {t('game.activitiesTab.trackProgress')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
