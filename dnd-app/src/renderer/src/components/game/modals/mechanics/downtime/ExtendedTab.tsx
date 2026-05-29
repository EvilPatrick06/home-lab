import { useState } from 'react'
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
      <p className="text-xs text-gray-500">
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
            <div className="text-xs text-gray-500 mt-0.5">
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
          <p className="text-xs text-gray-500">{selected.resolution}</p>

          {selected.requirements && selected.requirements.length > 0 && (
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-400">Requirements:</span> {selected.requirements.join(', ')}
            </div>
          )}

          {/* Lifestyle selector for carousing */}
          {selected.costs && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-semibold">Lifestyle:</label>
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
              <label className="text-xs text-gray-400 font-semibold">
                Resolution Checks (DC {selected.dcBase ?? '?'}):
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
                        {existing.roll} \u2014 {existing.success ? 'Success' : 'Fail'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRollCheck(check.check, selected.dcBase ?? 10)}
                        disabled={i > checkResults.length}
                        className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer disabled:opacity-40"
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
              <label className="text-xs text-gray-400 font-semibold">DC Guidelines:</label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(selected.dcGuidelines).map(([label, dc]) => (
                  <span key={label} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
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
              <span className="text-xs text-amber-400 font-semibold">Result: </span>
              <span className="text-xs text-gray-200">{resultText}</span>
            </div>
          )}

          {/* Favor examples */}
          {selected.favorExamples && resultText && (
            <div className="text-xs text-gray-500">
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
                  <span className="text-xs text-red-400 font-semibold">Complication: </span>
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
