import {
  addDowntimeProgress,
  advanceTrackedDowntime,
  removeDowntimeProgress,
  updateDowntimeProgress
} from '../../../../../services/downtime-service'
import type { Campaign, DowntimeProgressEntry } from '../../../../../types/campaign'
import type { Character5e } from '../../../../../types/character-5e'
import { cryptoRandom } from '../../../../../utils/crypto-random'
import CraftingBrowser from '../CraftingBrowser'

// ═══════════════════════════════════════════════════════════════
// Crafting Tab
// ═══════════════════════════════════════════════════════════════

export default function CraftingTab({
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
      id: `craft-${Date.now()}-${cryptoRandom().toString(36).slice(2, 8)}`,
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
                <span className="text-xs text-gray-500">
                  {entry.daysSpent}/{entry.daysRequired} days
                </span>
              </div>
              {entry.details && <p className="text-xs text-gray-500 mb-1">{entry.details}</p>}
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
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Day
                </button>
                <button
                  onClick={() => handleAdvanceCrafting(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +5 Days
                </button>
                {entry.daysSpent >= entry.daysRequired && (
                  <button
                    onClick={() => {
                      saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'completed' }))
                      onBroadcastResult?.(`**${entry.characterName}** completed crafting: ${entry.activityName}!`)
                    }}
                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => {
                    saveCampaign(removeDowntimeProgress(campaign, entry.id))
                    onBroadcastResult?.(`**${entry.characterName}** abandoned crafting: ${entry.activityName}`)
                  }}
                  className="px-2 py-0.5 text-xs bg-red-600/50 hover:bg-red-600 text-red-300 rounded cursor-pointer ml-auto"
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
