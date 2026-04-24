import { useEffect, useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import { LIFESTYLE_COSTS, type LifestyleLevel } from '../../../../services/character/stat-calculator-5e'
import { type LanguageEntry, load5eLanguages } from '../../../../services/data-provider'
import { rollSingle } from '../../../../services/dice/dice-service'
import {
  addDowntimeProgress,
  advanceTrackedDowntime,
  type ComplicationEntry,
  type ComplicationTables,
  calculateDowntimeCost,
  type DowntimeActivity,
  type ExtendedDowntimeActivity,
  getActiveDowntimeForCharacter,
  loadComplications,
  loadDowntimeActivities,
  loadExtendedDowntimeActivities,
  removeDowntimeProgress,
  rollComplication,
  updateDowntimeProgress
} from '../../../../services/downtime-service'
import type { Campaign, DowntimeProgressEntry } from '../../../../types/campaign'
import type { Character5e } from '../../../../types/character-5e'
import { logger } from '../../../../utils/logger'
import CraftingBrowser from './CraftingBrowser'

type _ComplicationEntry = ComplicationEntry
type _ComplicationTables = ComplicationTables

type DowntimeTab = 'activities' | 'extended' | 'crafting' | 'training'

interface DowntimeModalProps {
  characterName?: string
  characterId?: string
  character?: Character5e | null
  campaign: Campaign
  onClose: () => void
  onApply?: (activity: string, days: number, goldCost: number, details: string) => void
  onSaveCampaign?: (campaign: Campaign) => void
  onBroadcastResult?: (message: string) => void
}

// ─── Available tools and languages for training ──────────────

const TRAINABLE_TOOLS = [
  "Alchemist's Supplies",
  "Brewer's Supplies",
  "Calligrapher's Supplies",
  "Carpenter's Tools",
  "Cartographer's Tools",
  "Cobbler's Tools",
  "Cook's Utensils",
  "Glassblower's Tools",
  "Jeweler's Tools",
  "Leatherworker's Tools",
  "Mason's Tools",
  "Painter's Supplies",
  "Potter's Tools",
  "Smith's Tools",
  "Tinker's Tools",
  "Weaver's Tools",
  "Woodcarver's Tools",
  'Disguise Kit',
  'Forgery Kit',
  'Herbalism Kit',
  "Navigator's Tools",
  "Poisoner's Kit",
  "Thieves' Tools",
  'Dice Set',
  'Dragonchess Set',
  'Playing Card Set',
  'Three-Dragon Ante Set',
  'Bagpipes',
  'Drum',
  'Dulcimer',
  'Flute',
  'Lute',
  'Lyre',
  'Horn',
  'Pan Flute',
  'Shawm',
  'Viol'
]

export default function DowntimeModal({
  characterName,
  characterId,
  character,
  campaign,
  onClose,
  onApply,
  onSaveCampaign,
  onBroadcastResult
}: DowntimeModalProps): JSX.Element {
  const [tab, setTab] = useState<DowntimeTab>('activities')
  const [activities, setActivities] = useState<DowntimeActivity[]>([])
  const [extendedActivities, setExtendedActivities] = useState<ExtendedDowntimeActivity[]>([])
  const [languages, setLanguages] = useState<LanguageEntry[]>([])

  useEffect(() => {
    loadDowntimeActivities()
      .then(setActivities)
      .catch((err) => {
        logger.error('Failed to load downtime activities', err)
        addToast('Failed to load downtime activities', 'error')
        setActivities([])
      })
    loadExtendedDowntimeActivities()
      .then(setExtendedActivities)
      .catch((err) => {
        logger.error('Failed to load extended downtime activities', err)
        addToast('Failed to load extended downtime activities', 'error')
        setExtendedActivities([])
      })
    load5eLanguages()
      .then(setLanguages)
      .catch((err) => {
        logger.error('Failed to load languages', err)
        addToast('Failed to load languages', 'error')
        setLanguages([])
      })
  }, [])

  const activeEntries = characterId ? getActiveDowntimeForCharacter(campaign, characterId) : []

  const saveCampaign = (c: Campaign): void => {
    onSaveCampaign?.(c)
    window.api.saveCampaign(c as unknown as Record<string, unknown>)
  }

  const tabs: { id: DowntimeTab; label: string }[] = [
    { id: 'activities', label: 'Activities' },
    { id: 'extended', label: 'Extended' },
    { id: 'crafting', label: 'Crafting' },
    { id: 'training', label: 'Training' }
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[600px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-bold text-amber-400">
            Downtime Activities {characterName ? `\u2014 ${characterName}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 cursor-pointer">
            &#10005;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                tab === t.id
                  ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-800/50'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {tab === 'activities' && (
            <ActivitiesTab
              activities={activities}
              activeEntries={activeEntries}
              characterId={characterId}
              characterName={characterName}
              campaign={campaign}
              onApply={onApply}
              onClose={onClose}
              saveCampaign={saveCampaign}
              onBroadcastResult={onBroadcastResult}
            />
          )}
          {tab === 'extended' && (
            <ExtendedTab
              activities={extendedActivities}
              characterName={characterName}
              onBroadcastResult={onBroadcastResult}
            />
          )}
          {tab === 'crafting' && (
            <CraftingTab
              character={character}
              characterId={characterId}
              characterName={characterName}
              campaign={campaign}
              saveCampaign={saveCampaign}
              onBroadcastResult={onBroadcastResult}
            />
          )}
          {tab === 'training' && (
            <TrainingTab
              character={character}
              characterId={characterId}
              characterName={characterName}
              campaign={campaign}
              activeEntries={activeEntries}
              languages={languages}
              saveCampaign={saveCampaign}
              onBroadcastResult={onBroadcastResult}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Activities Tab (PHB)
// ═══════════════════════════════════════════════════════════════

function ActivitiesTab({
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
      selectedRarity || selectedPotion || (selected.spellLevelTable ? `Level ${selectedSpellLevel} spell` : '')
    onApply?.(selected.name, cost.days, cost.goldCost, details)
    onClose()
  }

  const handleTrackProgress = (): void => {
    if (!selected || !cost || !characterId) return
    const details =
      selectedRarity || selectedPotion || (selected.spellLevelTable ? `Level ${selectedSpellLevel} spell` : '')
    const entry: DowntimeProgressEntry = {
      id: `dt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      activityId: selected.id,
      activityName: selected.name,
      characterId,
      characterName: characterName ?? 'Unknown',
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
      `**${characterName}** started tracking: ${selected.name}${details ? ` (${details})` : ''} \u2014 ${cost.days} days, ${cost.goldCost.toLocaleString()} GP`
    )
  }

  const handleAdvance = (entryId: string, advDays: number): void => {
    const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entryId, advDays)
    saveCampaign(updated)
    const entry = (updated.downtimeProgress ?? []).find((e) => e.id === entryId)
    if (entry) {
      if (complete) {
        onBroadcastResult?.(
          `**${entry.characterName}** completed: ${entry.activityName}${entry.details ? ` (${entry.details})` : ''}!`
        )
      } else {
        onBroadcastResult?.(
          `**${entry.characterName}** advanced ${entry.activityName}: ${entry.daysSpent}/${entry.daysRequired} days`
        )
      }
    }
  }

  const handleAbandon = (entryId: string): void => {
    const entry = (campaign.downtimeProgress ?? []).find((e) => e.id === entryId)
    saveCampaign(updateDowntimeProgress(campaign, entryId, { status: 'abandoned' }))
    if (entry) {
      onBroadcastResult?.(`**${entry.characterName}** abandoned: ${entry.activityName}`)
    }
  }

  return (
    <div className="space-y-3">
      {/* Active progress entries */}
      {activeEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400">Active Progress</h3>
          {activeEntries.map((entry) => (
            <div key={entry.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-300">{entry.activityName}</span>
                <span className="text-[10px] text-gray-500">
                  {entry.daysSpent}/{entry.daysRequired} days
                </span>
              </div>
              {entry.details && <p className="text-[10px] text-gray-500 mb-1">{entry.details}</p>}
              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (entry.daysSpent / entry.daysRequired) * 100)}%` }}
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAdvance(entry.id, 1)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Day
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +5 Days
                </button>
                {entry.daysSpent >= entry.daysRequired && (
                  <button
                    onClick={() => {
                      saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'completed' }))
                      onBroadcastResult?.(`**${entry.characterName}** completed: ${entry.activityName}!`)
                    }}
                    className="px-2 py-0.5 text-[10px] bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => handleAbandon(entry.id)}
                  className="px-2 py-0.5 text-[10px] bg-red-600/50 hover:bg-red-600 text-red-300 rounded cursor-pointer ml-auto"
                >
                  Abandon
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
                : 'bg-gray-800/50 border border-gray-700/50 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="font-semibold">{activity.name}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{activity.reference}</div>
          </button>
        ))}
      </div>

      {/* Selected activity details */}
      {selected && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2">
          <p className="text-xs text-gray-300 leading-relaxed">{selected.description}</p>

          {selected.requirements.length > 0 && (
            <div className="text-[10px] text-gray-500">
              <span className="font-semibold text-gray-400">Requirements:</span> {selected.requirements.join(', ')}
            </div>
          )}

          <div className="text-[10px] text-amber-400">
            <span className="font-semibold">Outcome:</span> {selected.outcome}
          </div>

          {/* Rarity selector */}
          {selected.rarityTable && (
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold">Item Rarity:</label>
              <div className="flex flex-wrap gap-1">
                {selected.rarityTable.map((r) => (
                  <button
                    key={r.rarity}
                    onClick={() => setSelectedRarity(r.rarity)}
                    className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                      selectedRarity === r.rarity
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {r.rarity} ({r.days}d, {r.goldCost.toLocaleString()} GP, Lv {r.minLevel}+)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Spell level selector */}
          {selected.spellLevelTable && (
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold">Spell Level:</label>
              <div className="flex flex-wrap gap-1">
                {selected.spellLevelTable.map((r) => (
                  <button
                    key={r.level}
                    onClick={() => setSelectedSpellLevel(r.level)}
                    className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                      selectedSpellLevel === r.level
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {r.level === 0 ? 'Cantrip' : `Lv ${r.level}`} ({r.days}d, {r.goldCost.toLocaleString()} GP)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Potion type selector */}
          {selected.potionTable && (
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold">Potion Type:</label>
              <div className="flex flex-wrap gap-1">
                {selected.potionTable.map((r) => (
                  <button
                    key={r.type}
                    onClick={() => setSelectedPotion(r.type)}
                    className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                      selectedPotion === r.type
                        ? 'bg-amber-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {r.type} ({r.days}d, {r.goldCost} GP, {r.heals})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Days input */}
          {selected.daysRequired > 0 && !selected.rarityTable && !selected.spellLevelTable && !selected.potionTable && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 font-semibold">Days:</label>
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 bg-gray-800 border border-gray-600 rounded text-center text-xs text-gray-200 px-1 py-0.5"
              />
            </div>
          )}

          {/* Cost summary */}
          {cost && (
            <div className="flex items-center gap-4 pt-1 border-t border-gray-700">
              <span className="text-xs text-gray-400">
                Time:{' '}
                <span className="text-white font-semibold">
                  {cost.days} day{cost.days !== 1 ? 's' : ''}
                </span>
              </span>
              <span className="text-xs text-gray-400">
                Cost: <span className="text-amber-400 font-semibold">{cost.goldCost.toLocaleString()} GP</span>
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleApply}
              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer"
            >
              Start Activity
            </button>
            {characterId && cost && cost.days > 1 && (
              <button
                onClick={handleTrackProgress}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer"
              >
                Track Progress
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Extended Activities Tab (DMG)
// ═══════════════════════════════════════════════════════════════

function ExtendedTab({
  activities,
  characterName,
  onBroadcastResult
}: {
  activities: ExtendedDowntimeActivity[]
  characterName?: string
  onBroadcastResult?: (message: string) => void
}): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkResults, setCheckResults] = useState<Array<{ check: string; roll: number; success: boolean }>>([])
  const [resultText, setResultText] = useState('')
  const [complicationText, setComplicationText] = useState('')
  const [lifestyleTier, setLifestyleTier] = useState('modest')

  const selected = activities.find((a) => a.id === selectedId)

  const handleSelect = (id: string): void => {
    setSelectedId(id)
    setCheckResults([])
    setResultText('')
    setComplicationText('')
    setLifestyleTier('modest')
  }

  const handleRollCheck = (check: string, dc: number): void => {
    const roll = rollSingle(20)
    const success = roll >= dc
    setCheckResults((prev) => [...prev, { check, roll, success }])
  }

  const resolveResults = (): void => {
    if (!selected) return
    const successes = checkResults.filter((r) => r.success).length

    // Find matching result
    const match = selected.results.find((r) => {
      if (r.successes !== undefined) return r.successes === successes
      if (r.rollMin !== undefined && r.rollMax !== undefined) {
        const total = checkResults.reduce((sum, c) => sum + c.roll, 0)
        return total >= r.rollMin && total <= r.rollMax
      }
      return false
    })

    const text = match?.result ?? `${successes} successes \u2014 DM determines the outcome.`
    setResultText(text)
    onBroadcastResult?.(`**${characterName ?? 'Character'}** \u2014 ${selected.name} result: ${text}`)
  }

  const handleRollComplication = async (): Promise<void> => {
    if (!selected) return
    const tables = await loadComplications()
    const tableId =
      selected.id === 'carousing'
        ? lifestyleTier === 'wealthy' || lifestyleTier === 'aristocratic' || lifestyleTier === 'comfortable'
          ? 'carousing-upper'
          : 'carousing-lower'
        : tables.tables[selected.id]
          ? selected.id
          : 'general'
    const entry = rollComplication(tables, tableId)
    if (entry) {
      setComplicationText(entry.result)
      onBroadcastResult?.(`**Complication:** ${entry.result}`)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-500">
        DMG extended activities with dice resolution. Select an activity, roll the required checks, then see results.
      </p>

      {/* Activity list */}
      <div className="space-y-1">
        {activities.map((act) => (
          <button
            key={act.id}
            onClick={() => handleSelect(act.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
              selectedId === act.id
                ? 'bg-purple-600/20 border border-purple-500/50 text-purple-300'
                : 'bg-gray-800/50 border border-gray-700/50 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="font-semibold">{act.name}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {act.minimumDuration ?? 'Varies'}{' '}
              {act.costPerDayGP > 0 ? `\u2014 ${act.costPerDayGP} GP/day` : '\u2014 Free'}
            </div>
          </button>
        ))}
      </div>

      {/* Selected activity detail */}
      {selected && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-3">
          <p className="text-xs text-gray-300 leading-relaxed">{selected.description}</p>
          <p className="text-[10px] text-gray-500">{selected.resolution}</p>

          {selected.requirements && selected.requirements.length > 0 && (
            <div className="text-[10px] text-gray-500">
              <span className="font-semibold text-gray-400">Requirements:</span> {selected.requirements.join(', ')}
            </div>
          )}

          {/* Lifestyle selector for carousing */}
          {selected.costs && (
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold">Lifestyle:</label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(selected.costs).map(([tier, info]) => {
                  const phbCost = LIFESTYLE_COSTS[tier as LifestyleLevel]
                  return (
                    <button
                      key={tier}
                      onClick={() => setLifestyleTier(tier)}
                      className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                        lifestyleTier === tier
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {tier} ({info.costPerDayGP} GP/day
                      {phbCost !== undefined && phbCost !== info.costPerDayGP ? ` + ${phbCost} GP/day living` : ''})
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Checks */}
          {selected.checks && selected.checks.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold">
                Resolution Checks (DC {selected.dcBase ?? '?'}):
              </label>
              {selected.checks.map((check, i) => {
                const existing = checkResults[i]
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-300 flex-1">{check.check}</span>
                    {existing ? (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          existing.success ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                        }`}
                      >
                        {existing.roll} \u2014 {existing.success ? 'Success' : 'Fail'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRollCheck(check.check, selected.dcBase ?? 10)}
                        disabled={i > checkResults.length}
                        className="px-2 py-0.5 text-[10px] bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer disabled:opacity-40"
                      >
                        Roll
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Resolve button */}
              {checkResults.length === selected.checks.length && !resultText && (
                <button
                  onClick={resolveResults}
                  className="mt-1 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
                >
                  Resolve ({checkResults.filter((r) => r.success).length}/{selected.checks.length} successes)
                </button>
              )}
            </div>
          )}

          {/* Research: single Intelligence check */}
          {selected.id === 'research' && selected.dcGuidelines && (
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-semibold">DC Guidelines:</label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(selected.dcGuidelines).map(([label, dc]) => (
                  <span key={label} className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                    {label}: DC {dc}
                  </span>
                ))}
              </div>
              {checkResults.length === 0 && (
                <button
                  onClick={() => {
                    const roll = rollSingle(20)
                    setCheckResults([{ check: 'Intelligence', roll, success: roll >= 10 }])
                    const msg = `**${characterName ?? 'Character'}** \u2014 Research roll: ${roll}`
                    onBroadcastResult?.(msg)
                    setResultText(`Intelligence check: ${roll}. DM determines what lore is revealed based on the DC.`)
                  }}
                  className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer"
                >
                  Roll Intelligence Check
                </button>
              )}
            </div>
          )}

          {/* Results display */}
          {resultText && (
            <div className="bg-amber-600/10 border border-amber-500/30 rounded-lg p-2">
              <span className="text-[10px] text-amber-400 font-semibold">Result: </span>
              <span className="text-xs text-gray-200">{resultText}</span>
            </div>
          )}

          {/* Favor examples */}
          {selected.favorExamples && resultText && (
            <div className="text-[10px] text-gray-500">
              <span className="font-semibold text-gray-400">Favor examples:</span>
              <ul className="list-disc ml-4 mt-0.5 space-y-0.5">
                {selected.favorExamples.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Complication roll */}
          {resultText && (
            <div className="pt-1 border-t border-gray-700">
              {complicationText ? (
                <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-2">
                  <span className="text-[10px] text-red-400 font-semibold">Complication: </span>
                  <span className="text-xs text-gray-200">{complicationText}</span>
                </div>
              ) : (
                <button
                  onClick={handleRollComplication}
                  className="px-3 py-1 text-xs bg-red-600/50 hover:bg-red-600 text-red-200 rounded cursor-pointer"
                >
                  Roll for Complication (Optional)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Crafting Tab
// ═══════════════════════════════════════════════════════════════

function CraftingTab({
  character,
  characterId,
  characterName,
  campaign,
  saveCampaign,
  onBroadcastResult
}: {
  character?: Character5e | null
  characterId?: string
  characterName?: string
  campaign: Campaign
  saveCampaign: (c: Campaign) => void
  onBroadcastResult?: (message: string) => void
}): JSX.Element {
  const characterTools = character?.proficiencies.tools ?? []

  // Show active crafting progress
  const craftingEntries = (campaign.downtimeProgress ?? []).filter(
    (e) => e.characterId === characterId && e.status === 'in-progress' && e.craftingRecipeId
  )

  const handleStartCrafting = (item: string, tool: string, days: number, cost: string, recipeId?: string): void => {
    if (!characterId) return
    const entry: DowntimeProgressEntry = {
      id: `craft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      activityId: 'crafting',
      activityName: `Craft: ${item}`,
      characterId,
      characterName: characterName ?? 'Unknown',
      daysSpent: 0,
      daysRequired: days,
      goldSpent: 0,
      goldRequired: 0,
      startedAt: new Date().toISOString(),
      details: `${item} (${tool}, materials: ${cost})`,
      craftingRecipeId: recipeId ?? item.toLowerCase().replace(/\s+/g, '-'),
      status: 'in-progress'
    }
    saveCampaign(addDowntimeProgress(campaign, entry))
    onBroadcastResult?.(
      `**${characterName}** started crafting: ${item} (${tool}) \u2014 ${days} day${days !== 1 ? 's' : ''}, materials: ${cost}`
    )
  }

  const handleAdvanceCrafting = (entryId: string, days: number): void => {
    const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entryId, days)
    saveCampaign(updated)
    const entry = (updated.downtimeProgress ?? []).find((e) => e.id === entryId)
    if (entry) {
      if (complete) {
        onBroadcastResult?.(`**${entry.characterName}** finished crafting: ${entry.activityName}!`)
      } else {
        onBroadcastResult?.(
          `**${entry.characterName}** crafting progress: ${entry.daysSpent}/${entry.daysRequired} days`
        )
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Active crafting progress */}
      {craftingEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400">Active Crafting</h3>
          {craftingEntries.map((entry) => (
            <div key={entry.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-300">{entry.activityName}</span>
                <span className="text-[10px] text-gray-500">
                  {entry.daysSpent}/{entry.daysRequired} days
                </span>
              </div>
              {entry.details && <p className="text-[10px] text-gray-500 mb-1">{entry.details}</p>}
              <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (entry.daysSpent / entry.daysRequired) * 100)}%` }}
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAdvanceCrafting(entry.id, 1)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Day
                </button>
                <button
                  onClick={() => handleAdvanceCrafting(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +5 Days
                </button>
                {entry.daysSpent >= entry.daysRequired && (
                  <button
                    onClick={() => {
                      saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'completed' }))
                      onBroadcastResult?.(`**${entry.characterName}** completed crafting: ${entry.activityName}!`)
                    }}
                    className="px-2 py-0.5 text-[10px] bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => {
                    saveCampaign(removeDowntimeProgress(campaign, entry.id))
                    onBroadcastResult?.(`**${entry.characterName}** abandoned crafting: ${entry.activityName}`)
                  }}
                  className="px-2 py-0.5 text-[10px] bg-red-600/50 hover:bg-red-600 text-red-300 rounded cursor-pointer ml-auto"
                >
                  Abandon
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Crafting browser */}
      <CraftingBrowser characterTools={characterTools} onStartCrafting={handleStartCrafting} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Training Tab
// ═══════════════════════════════════════════════════════════════

function TrainingTab({
  character,
  characterId,
  characterName,
  campaign,
  activeEntries,
  languages,
  saveCampaign,
  onBroadcastResult
}: {
  character?: Character5e | null
  characterId?: string
  characterName?: string
  campaign: Campaign
  activeEntries: DowntimeProgressEntry[]
  languages: LanguageEntry[]
  saveCampaign: (c: Campaign) => void
  onBroadcastResult?: (message: string) => void
}): JSX.Element {
  const [trainingType, setTrainingType] = useState<'tool' | 'language'>('tool')
  const [selectedTarget, setSelectedTarget] = useState('')

  const trainingEntries = activeEntries.filter((e) => e.activityId === 'training')

  const knownTools = character?.proficiencies.tools ?? []
  const knownLanguages = character?.proficiencies.languages ?? []

  const availableTools = TRAINABLE_TOOLS.filter((t) => !knownTools.some((k) => k.toLowerCase() === t.toLowerCase()))
  const availableLanguages = languages
    .map((l) => l.name)
    .filter((l) => !knownLanguages.some((k) => k.toLowerCase() === l.toLowerCase()))

  const handleStartTraining = (): void => {
    if (!characterId || !selectedTarget) return
    const entry: DowntimeProgressEntry = {
      id: `train-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      activityId: 'training',
      activityName: `Training: ${selectedTarget}`,
      characterId,
      characterName: characterName ?? 'Unknown',
      daysSpent: 0,
      daysRequired: 250,
      goldSpent: 0,
      goldRequired: 250,
      startedAt: new Date().toISOString(),
      details: `${trainingType === 'tool' ? 'Tool' : 'Language'}: ${selectedTarget}`,
      trainingTarget: selectedTarget,
      status: 'in-progress'
    }
    saveCampaign(addDowntimeProgress(campaign, entry))
    onBroadcastResult?.(`**${characterName}** started training: ${selectedTarget} (250 days, 1 GP/day)`)
    setSelectedTarget('')
  }

  const handleAdvance = (entryId: string, days: number): void => {
    const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entryId, days)
    saveCampaign(updated)
    const entry = (updated.downtimeProgress ?? []).find((e) => e.id === entryId)
    if (entry && complete) {
      onBroadcastResult?.(
        `**${entry.characterName}** completed training: ${entry.trainingTarget ?? entry.activityName}! New proficiency gained.`
      )
    } else if (entry) {
      onBroadcastResult?.(`**${entry.characterName}** training progress: ${entry.daysSpent}/${entry.daysRequired} days`)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-500">
        Train to gain a new tool proficiency or language. Takes 250 days and costs 1 GP/day. Requires an instructor.
      </p>

      {/* Active training */}
      {trainingEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400">Active Training</h3>
          {trainingEntries.map((entry) => (
            <div key={entry.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-300">{entry.activityName}</span>
                <span className="text-[10px] text-gray-500">
                  {entry.daysSpent}/{entry.daysRequired} days (
                  {Math.round((entry.daysSpent / entry.daysRequired) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (entry.daysSpent / entry.daysRequired) * 100)}%` }}
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAdvance(entry.id, 1)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Day
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Workweek
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 30)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +30 Days
                </button>
                {entry.daysSpent >= entry.daysRequired && (
                  <button
                    onClick={() => {
                      saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'completed' }))
                      onBroadcastResult?.(
                        `**${entry.characterName}** completed training: ${entry.trainingTarget}! Proficiency gained.`
                      )
                    }}
                    className="px-2 py-0.5 text-[10px] bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => {
                    saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'abandoned' }))
                    onBroadcastResult?.(`**${entry.characterName}** abandoned training: ${entry.trainingTarget}`)
                  }}
                  className="px-2 py-0.5 text-[10px] bg-red-600/50 hover:bg-red-600 text-red-300 rounded cursor-pointer ml-auto"
                >
                  Abandon
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Start new training */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-gray-400">Start New Training</h3>

        {/* Type toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => {
              setTrainingType('tool')
              setSelectedTarget('')
            }}
            className={`px-3 py-1 text-[10px] rounded cursor-pointer ${
              trainingType === 'tool' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Tool Proficiency
          </button>
          <button
            onClick={() => {
              setTrainingType('language')
              setSelectedTarget('')
            }}
            className={`px-3 py-1 text-[10px] rounded cursor-pointer ${
              trainingType === 'language' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Language
          </button>
        </div>

        {/* Selection dropdown */}
        <select
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-gray-200 px-2 py-1.5"
        >
          <option value="">Select {trainingType === 'tool' ? 'a tool' : 'a language'}...</option>
          {(trainingType === 'tool' ? availableTools : availableLanguages).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        {selectedTarget && (
          <div className="flex items-center gap-4 text-[10px] text-gray-400">
            <span>
              Duration: <span className="text-white font-semibold">250 days</span>
            </span>
            <span>
              Cost: <span className="text-amber-400 font-semibold">250 GP</span> (1 GP/day)
            </span>
          </div>
        )}

        <button
          onClick={handleStartTraining}
          disabled={!selectedTarget || !characterId}
          className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Start Training
        </button>
      </div>
    </div>
  )
}
