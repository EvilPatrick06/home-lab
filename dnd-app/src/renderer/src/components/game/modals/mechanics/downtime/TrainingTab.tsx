import { useState } from 'react'
import type { LanguageEntry } from '../../../../../services/data-provider'
import {
  addDowntimeProgress,
  advanceTrackedDowntime,
  updateDowntimeProgress
} from '../../../../../services/downtime-service'
import type { Campaign, DowntimeProgressEntry } from '../../../../../types/campaign'
import type { Character5e } from '../../../../../types/character-5e'
import { cryptoRandom } from '../../../../../utils/crypto-random'
import { TRAINABLE_TOOLS } from './constants'

// ═══════════════════════════════════════════════════════════════
// Training Tab
// ═══════════════════════════════════════════════════════════════

export default function TrainingTab({
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
      id: `train-${Date.now()}-${cryptoRandom().toString(36).slice(2, 8)}`,
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
      <p className="text-xs text-gray-500">
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
                <span className="text-xs text-gray-500">
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
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Day
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  +1 Workweek
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 30)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
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
                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => {
                    saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'abandoned' }))
                    onBroadcastResult?.(`**${entry.characterName}** abandoned training: ${entry.trainingTarget}`)
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
            className={`px-3 py-1 text-xs rounded cursor-pointer ${
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
            className={`px-3 py-1 text-xs rounded cursor-pointer ${
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
          <div className="flex items-center gap-4 text-xs text-gray-400">
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
