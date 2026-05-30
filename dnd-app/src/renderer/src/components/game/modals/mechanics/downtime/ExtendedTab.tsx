import { useState } from 'react'
import { useT } from '../../../../../i18n'
import { LIFESTYLE_COSTS, type LifestyleLevel } from '../../../../../services/character/stat-calculator-5e'
import { rollSingle } from '../../../../../services/dice/dice-service'
import {
  type ComplicationEntry,
  type ComplicationTables,
  type ExtendedDowntimeActivity,
  loadComplications,
  rollComplication
} from '../../../../../services/downtime-service'

type _ComplicationEntry = ComplicationEntry
type _ComplicationTables = ComplicationTables

// ═══════════════════════════════════════════════════════════════
// Extended Activities Tab (DMG)
// ═══════════════════════════════════════════════════════════════

export default function ExtendedTab({
  activities,
  characterName,
  onBroadcastResult
}: {
  activities: ExtendedDowntimeActivity[]
  characterName?: string
  onBroadcastResult?: (message: string) => void
}): JSX.Element {
  const { t } = useT()
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

    const text = match?.result ?? t('game.extendedTab.successesFallback', { count: successes })
    setResultText(text)
    onBroadcastResult?.(
      t('game.extendedTab.broadcastResult', {
        name: characterName ?? t('game.extendedTab.characterFallback'),
        activity: selected.name,
        text
      })
    )
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
      onBroadcastResult?.(t('game.extendedTab.broadcastComplication', { result: entry.result }))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t('game.extendedTab.intro')}</p>

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
            <div className="text-xs text-gray-500 mt-0.5">
              {act.minimumDuration ?? t('game.extendedTab.varies')}{' '}
              {act.costPerDayGP > 0
                ? t('game.extendedTab.costPerDay', { gold: act.costPerDayGP })
                : t('game.extendedTab.free')}
            </div>
          </button>
        ))}
      </div>

      {/* Selected activity detail */}
      {selected && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-3">
          <p className="text-xs text-gray-300 leading-relaxed">{selected.description}</p>
          <p className="text-xs text-gray-500">{selected.resolution}</p>

          {selected.requirements && selected.requirements.length > 0 && (
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-400">{t('game.extendedTab.requirements')}</span>{' '}
              {selected.requirements.join(', ')}
            </div>
          )}

          {/* Lifestyle selector for carousing */}
          {selected.costs && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-semibold">{t('game.extendedTab.lifestyle')}</label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(selected.costs).map(([tier, info]) => {
                  const phbCost = LIFESTYLE_COSTS[tier as LifestyleLevel]
                  return (
                    <button
                      key={tier}
                      onClick={() => setLifestyleTier(tier)}
                      className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
                        lifestyleTier === tier
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {tier} ({t('game.extendedTab.lifestyleCost', { gold: info.costPerDayGP })}
                      {phbCost !== undefined && phbCost !== info.costPerDayGP
                        ? t('game.extendedTab.lifestyleLiving', { gold: phbCost })
                        : ''}
                      )
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Checks */}
          {selected.checks && selected.checks.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-semibold">
                {t('game.extendedTab.resolutionChecks', { dc: selected.dcBase ?? '?' })}
              </label>
              {selected.checks.map((check, i) => {
                const existing = checkResults[i]
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 flex-1">{check.check}</span>
                    {existing ? (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          existing.success ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                        }`}
                      >
                        {existing.roll} \u2014{' '}
                        {existing.success ? t('game.extendedTab.success') : t('game.extendedTab.fail')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRollCheck(check.check, selected.dcBase ?? 10)}
                        disabled={i > checkResults.length}
                        className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer disabled:opacity-40"
                      >
                        {t('game.extendedTab.roll')}
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
                  {t('game.extendedTab.resolve', {
                    successes: checkResults.filter((r) => r.success).length,
                    total: selected.checks.length
                  })}
                </button>
              )}
            </div>
          )}

          {/* Research: single Intelligence check */}
          {selected.id === 'research' && selected.dcGuidelines && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-semibold">{t('game.extendedTab.dcGuidelines')}</label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(selected.dcGuidelines).map(([label, dc]) => (
                  <span key={label} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                    {t('game.extendedTab.dcGuideline', { label, dc })}
                  </span>
                ))}
              </div>
              {checkResults.length === 0 && (
                <button
                  onClick={() => {
                    const roll = rollSingle(20)
                    setCheckResults([{ check: 'Intelligence', roll, success: roll >= 10 }])
                    const msg = t('game.extendedTab.researchBroadcast', {
                      name: characterName ?? t('game.extendedTab.characterFallback'),
                      roll
                    })
                    onBroadcastResult?.(msg)
                    setResultText(t('game.extendedTab.researchResult', { roll }))
                  }}
                  className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer"
                >
                  {t('game.extendedTab.rollIntelligence')}
                </button>
              )}
            </div>
          )}

          {/* Results display */}
          {resultText && (
            <div className="bg-amber-600/10 border border-amber-500/30 rounded-lg p-2">
              <span className="text-xs text-amber-400 font-semibold">{t('game.extendedTab.result')}</span>
              <span className="text-xs text-gray-200">{resultText}</span>
            </div>
          )}

          {/* Favor examples */}
          {selected.favorExamples && resultText && (
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-400">{t('game.extendedTab.favorExamples')}</span>
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
                  <span className="text-xs text-red-400 font-semibold">{t('game.extendedTab.complication')}</span>
                  <span className="text-xs text-gray-200">{complicationText}</span>
                </div>
              ) : (
                <button
                  onClick={handleRollComplication}
                  className="px-3 py-1 text-xs bg-red-600/50 hover:bg-red-600 text-red-200 rounded cursor-pointer"
                >
                  {t('game.extendedTab.rollComplication')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
