import { useState } from 'react'
import { useT } from '../../../../../i18n'
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
  const { t } = useT()
  const [trainingType, setTrainingType] = useState<'tool' | 'language'>('tool')
  const [selectedTarget, setSelectedTarget] = useState('')

  const trainingEntries = activeEntries.filter((e) => e.activityId === 'training')

  const knownTools = character?.proficiencies.tools ?? []
  const knownLanguages = character?.proficiencies.languages ?? []

  const availableTools = TRAINABLE_TOOLS.filter(
    (tool) => !knownTools.some((k) => k.toLowerCase() === tool.toLowerCase())
  )
  const availableLanguages = languages
    .map((l) => l.name)
    .filter((l) => !knownLanguages.some((k) => k.toLowerCase() === l.toLowerCase()))

  const handleStartTraining = (): void => {
    if (!characterId || !selectedTarget) return
    const entry: DowntimeProgressEntry = {
      id: `train-${Date.now()}-${cryptoRandom().toString(36).slice(2, 8)}`,
      activityId: 'training',
      activityName: t('game.trainingTab.trainingActivity', { target: selectedTarget }),
      characterId,
      characterName: characterName ?? t('game.trainingTab.unknown'),
      daysSpent: 0,
      daysRequired: 250,
      goldSpent: 0,
      goldRequired: 250,
      startedAt: new Date().toISOString(),
      details:
        trainingType === 'tool'
          ? t('game.trainingTab.toolDetails', { target: selectedTarget })
          : t('game.trainingTab.languageDetails', { target: selectedTarget }),
      trainingTarget: selectedTarget,
      status: 'in-progress'
    }
    saveCampaign(addDowntimeProgress(campaign, entry))
    onBroadcastResult?.(t('game.trainingTab.broadcastStarted', { name: characterName, target: selectedTarget }))
    setSelectedTarget('')
  }

  const handleAdvance = (entryId: string, days: number): void => {
    const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entryId, days)
    saveCampaign(updated)
    const entry = (updated.downtimeProgress ?? []).find((e) => e.id === entryId)
    if (entry && complete) {
      onBroadcastResult?.(
        t('game.trainingTab.broadcastCompleted', {
          name: entry.characterName,
          target: entry.trainingTarget ?? entry.activityName
        })
      )
    } else if (entry) {
      onBroadcastResult?.(
        t('game.trainingTab.broadcastProgress', {
          name: entry.characterName,
          spent: entry.daysSpent,
          required: entry.daysRequired
        })
      )
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t('game.trainingTab.intro')}</p>

      {/* Active training */}
      {trainingEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted">{t('game.trainingTab.activeTraining')}</h3>
          {trainingEntries.map((entry) => (
            <div key={entry.id} className="bg-surface-2/50 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-300">{entry.activityName}</span>
                <span className="text-xs text-gray-500">
                  {t('game.trainingTab.daysProgress', {
                    spent: entry.daysSpent,
                    required: entry.daysRequired,
                    pct: Math.round((entry.daysSpent / entry.daysRequired) * 100)
                  })}
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
                  {t('game.trainingTab.plusOneDay')}
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 5)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  {t('game.trainingTab.plusWorkweek')}
                </button>
                <button
                  onClick={() => handleAdvance(entry.id, 30)}
                  disabled={entry.daysSpent >= entry.daysRequired}
                  className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer disabled:opacity-40"
                >
                  {t('game.trainingTab.plus30Days')}
                </button>
                {entry.daysSpent >= entry.daysRequired && (
                  <button
                    onClick={() => {
                      saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'completed' }))
                      onBroadcastResult?.(
                        t('game.trainingTab.broadcastCompletedSimple', {
                          name: entry.characterName,
                          target: entry.trainingTarget
                        })
                      )
                    }}
                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
                  >
                    {t('game.trainingTab.complete')}
                  </button>
                )}
                <button
                  onClick={() => {
                    saveCampaign(updateDowntimeProgress(campaign, entry.id, { status: 'abandoned' }))
                    onBroadcastResult?.(
                      t('game.trainingTab.broadcastAbandoned', {
                        name: entry.characterName,
                        target: entry.trainingTarget
                      })
                    )
                  }}
                  className="px-2 py-0.5 text-xs bg-red-600/50 hover:bg-red-600 text-red-300 rounded cursor-pointer ml-auto"
                >
                  {t('game.trainingTab.abandon')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Start new training */}
      <div className="bg-surface-2/50 border border-border rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-muted">{t('game.trainingTab.startNewTraining')}</h3>

        {/* Type toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => {
              setTrainingType('tool')
              setSelectedTarget('')
            }}
            className={`px-3 py-1 text-xs rounded cursor-pointer ${
              trainingType === 'tool' ? 'bg-green-600 text-white' : 'bg-gray-700 text-muted hover:bg-gray-600'
            }`}
          >
            {t('game.trainingTab.toolProficiency')}
          </button>
          <button
            onClick={() => {
              setTrainingType('language')
              setSelectedTarget('')
            }}
            className={`px-3 py-1 text-xs rounded cursor-pointer ${
              trainingType === 'language' ? 'bg-green-600 text-white' : 'bg-gray-700 text-muted hover:bg-gray-600'
            }`}
          >
            {t('game.trainingTab.language')}
          </button>
        </div>

        {/* Selection dropdown */}
        <select
          name="training-target"
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          className="w-full bg-surface-2 border border-gray-600 rounded text-xs text-gray-200 px-2 py-1.5"
        >
          <option value="">
            {trainingType === 'tool' ? t('game.trainingTab.selectTool') : t('game.trainingTab.selectLanguage')}
          </option>
          {(trainingType === 'tool' ? availableTools : availableLanguages).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        {selectedTarget && (
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>
              {t('game.trainingTab.duration')}{' '}
              <span className="text-white font-semibold">{t('game.trainingTab.days250')}</span>
            </span>
            <span>
              {t('game.trainingTab.cost')}{' '}
              <span className="text-accent font-semibold">{t('game.trainingTab.gp250')}</span>{' '}
              {t('game.trainingTab.perDay')}
            </span>
          </div>
        )}

        <button
          onClick={handleStartTraining}
          disabled={!selectedTarget || !characterId}
          className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('game.trainingTab.startTraining')}
        </button>
      </div>
    </div>
  )
}
