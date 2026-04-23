import abilityScoreConfigJson from '@data/5e/character/ability-score-config.json'
import { useState } from 'react'
import type { AbilityScoreMethod } from '../../../stores/use-builder-store'
import { POINT_BUY_BUDGET, POINT_BUY_COSTS, STANDARD_ARRAY, useBuilderStore } from '../../../stores/use-builder-store'
import type { AbilityName } from '../../../types/character-common'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'

const STANDARD_ARRAY_BY_CLASS = abilityScoreConfigJson.standardArrayByClass as Record<
  string,
  Record<AbilityName, number>
>
const CLASS_DISPLAY_ORDER = abilityScoreConfigJson.classDisplayOrder
const METHODS: Array<{ id: AbilityScoreMethod; label: string; desc: string }> =
  abilityScoreConfigJson.methods as Array<{ id: AbilityScoreMethod; label: string; desc: string }>

export default function AbilityScoreModal(): JSX.Element {
  const abilityScores = useBuilderStore((s) => s.abilityScores)
  const setAbilityScores = useBuilderStore((s) => s.setAbilityScores)
  const confirmAbilityScores = useBuilderStore((s) => s.confirmAbilityScores)
  const closeCustomModal = useBuilderStore((s) => s.closeCustomModal)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const method = useBuilderStore((s) => s.abilityScoreMethod)
  const setMethod = useBuilderStore((s) => s.setAbilityScoreMethod)
  const standardAssignments = useBuilderStore((s) => s.standardArrayAssignments)
  const setStandardAssignment = useBuilderStore((s) => s.setStandardArrayAssignment)
  const rollScores = useBuilderStore((s) => s.rollAbilityScores)

  const abilitySlot = buildSlots.find((s) => s.id === 'ability-scores')
  const isConfirmed = abilitySlot?.selectedId === 'confirmed'

  // Detect selected class for suggested standard array
  const classSlot = buildSlots.find((s) => s.category === 'class')
  const selectedClassId = classSlot?.selectedId ?? ''
  const suggestedScores = STANDARD_ARRAY_BY_CLASS[selectedClassId]
  const [showRefTable, setShowRefTable] = useState(false)

  // Point buy remaining
  const pointsSpent = ABILITY_NAMES.reduce((sum, ab) => {
    const score = Math.max(8, Math.min(15, abilityScores[ab]))
    return sum + (POINT_BUY_COSTS[score] ?? 0)
  }, 0)
  const pointsRemaining = POINT_BUY_BUDGET - pointsSpent

  // Standard array: which values are still unassigned
  const usedValues = Object.values(standardAssignments).filter((v) => v !== null) as number[]
  const availableValues = STANDARD_ARRAY.filter(
    (v) => usedValues.filter((u) => u === v).length < STANDARD_ARRAY.filter((s) => s === v).length
  )

  // Determine if Confirm is allowed based on method
  const canConfirm = (() => {
    if (method === 'standard') {
      return Object.values(standardAssignments).every((v) => v !== null)
    }
    if (method === 'pointBuy') {
      return pointsRemaining === 0
    }
    return true // roll & custom always valid
  })()

  const confirmHint = (() => {
    if (method === 'standard' && !canConfirm) {
      const assigned = Object.values(standardAssignments).filter((v) => v !== null).length
      return `Assign all 6 abilities to confirm (${assigned}/6)`
    }
    if (method === 'pointBuy' && !canConfirm) {
      return `Spend all ${POINT_BUY_BUDGET} points to confirm (${pointsRemaining} remaining)`
    }
    return null
  })()

  const setScore = (ability: string, value: number): void => {
    if (method === 'pointBuy') {
      const clamped = Math.min(15, Math.max(8, value))
      const newScores = { ...abilityScores, [ability]: clamped }
      const newTotal = ABILITY_NAMES.reduce((sum, ab) => {
        return sum + (POINT_BUY_COSTS[Math.max(8, Math.min(15, newScores[ab]))] ?? 0)
      }, 0)
      if (newTotal <= POINT_BUY_BUDGET) {
        useBuilderStore.setState({ abilityScores: newScores })
      }
    } else {
      const clamped = Math.min(20, Math.max(1, value))
      setAbilityScores({ ...abilityScores, [ability]: clamped })
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-900/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-bold text-gray-100">Ability Scores</h2>
        <button onClick={closeCustomModal} className="text-gray-400 hover:text-gray-200 text-xl leading-none px-2">
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Method selector */}
        <div className="flex gap-2 mb-4">
          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                method === m.id
                  ? 'bg-amber-900/30 border-amber-500/50 text-amber-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
              title={m.desc}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Method-specific info */}
        {method === 'pointBuy' && (
          <div className={`text-sm mb-3 ${pointsRemaining < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            Points: {pointsSpent}/{POINT_BUY_BUDGET} ({pointsRemaining} remaining)
          </div>
        )}
        {method === 'roll' && (
          <button
            onClick={rollScores}
            className="mb-3 px-3 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 text-gray-300 transition-colors"
          >
            Re-roll All
          </button>
        )}
        {method === 'standard' && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2">
              Assign each value to an ability. Available: {availableValues.join(', ') || 'All assigned'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {suggestedScores && (
                <button
                  onClick={() => {
                    for (const ab of ABILITY_NAMES) {
                      setStandardAssignment(ab, suggestedScores[ab])
                    }
                  }}
                  className="px-3 py-1 text-xs bg-amber-900/30 border border-amber-500/50 text-amber-300 rounded hover:bg-amber-900/50 transition-colors"
                >
                  Use Suggested for {selectedClassId.charAt(0).toUpperCase() + selectedClassId.slice(1)}
                </button>
              )}
              <button
                onClick={() => setShowRefTable(!showRefTable)}
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded transition-colors"
              >
                {showRefTable ? 'Hide' : 'Show'} Class Reference
              </button>
            </div>
            {showRefTable && (
              <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800 text-gray-400">
                      <th className="px-2 py-1 text-left font-semibold">Class</th>
                      {ABILITY_NAMES.map((ab) => (
                        <th key={ab} className="px-1.5 py-1 text-center font-semibold uppercase">
                          {ab.slice(0, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CLASS_DISPLAY_ORDER.map((cls) => {
                      const scores = STANDARD_ARRAY_BY_CLASS[cls]
                      const isSelected = cls === selectedClassId
                      return (
                        <tr
                          key={cls}
                          className={`border-t border-gray-800 ${isSelected ? 'bg-amber-900/20' : 'hover:bg-gray-800/50'} cursor-pointer transition-colors`}
                          onClick={() => {
                            if (method === 'standard') {
                              for (const ab of ABILITY_NAMES) {
                                setStandardAssignment(ab, scores[ab])
                              }
                            }
                          }}
                        >
                          <td className={`px-2 py-1 font-medium ${isSelected ? 'text-amber-300' : 'text-gray-300'}`}>
                            {cls.charAt(0).toUpperCase() + cls.slice(1)}
                          </td>
                          {ABILITY_NAMES.map((ab) => (
                            <td
                              key={ab}
                              className={`px-1.5 py-1 text-center ${scores[ab] >= 14 ? 'text-green-400' : scores[ab] <= 8 ? 'text-red-400' : 'text-gray-400'}`}
                            >
                              {scores[ab]}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Score grid */}
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          {ABILITY_NAMES.map((ab) => {
            const score = abilityScores[ab]
            const mod = abilityModifier(score)

            return (
              <div key={ab} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-400 uppercase font-semibold mb-2">{ab.slice(0, 3)}</div>

                {method === 'standard' ? (
                  <select
                    value={standardAssignments[ab] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : null
                      setStandardAssignment(ab, val)
                    }}
                    className="w-16 mx-auto bg-gray-900 border border-gray-600 rounded text-center text-lg font-bold text-gray-100 py-1 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">--</option>
                    {STANDARD_ARRAY.map((v, i) => {
                      const availCount = STANDARD_ARRAY.filter((s) => s === v).length
                      const usedCount = usedValues.filter((u) => u === v).length
                      const stillAvail = standardAssignments[ab] === v || usedCount < availCount
                      return (
                        <option key={`${v}-${i}`} value={v} disabled={!stillAvail}>
                          {v}
                        </option>
                      )
                    })}
                  </select>
                ) : method === 'pointBuy' ? (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setScore(ab, score - 1)}
                      disabled={score <= 8}
                      className="w-6 h-6 bg-gray-900 border border-gray-600 rounded text-gray-300 disabled:text-gray-700 disabled:border-gray-800"
                    >
                      -
                    </button>
                    <span className="w-8 text-lg font-bold text-gray-100 text-center">{score}</span>
                    <button
                      onClick={() => setScore(ab, score + 1)}
                      disabled={score >= 15}
                      className="w-6 h-6 bg-gray-900 border border-gray-600 rounded text-gray-300 disabled:text-gray-700 disabled:border-gray-800"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <input
                    type="number"
                    value={score}
                    min={1}
                    max={20}
                    onChange={(e) => setScore(ab, parseInt(e.target.value, 10) || 1)}
                    className="w-16 mx-auto bg-gray-900 border border-gray-600 rounded text-center text-lg font-bold text-gray-100 py-1 focus:outline-none focus:border-amber-500"
                  />
                )}

                <div className="mt-1 text-amber-400 font-bold text-sm">{formatMod(mod)}</div>
                {method === 'pointBuy' && (
                  <div className="text-xs text-gray-600 mt-0.5">{POINT_BUY_COSTS[score] ?? 0} pts</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-gray-900">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">
            {method === 'standard'
              ? 'Standard Array'
              : method === 'pointBuy'
                ? 'Point Buy'
                : method === 'roll'
                  ? 'Rolled'
                  : 'Custom'}
          </span>
          {confirmHint && <span className="text-[10px] text-amber-400 mt-0.5">{confirmHint}</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={closeCustomModal}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmAbilityScores}
            disabled={!canConfirm && !isConfirmed}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              isConfirmed
                ? 'bg-green-700 text-green-200'
                : !canConfirm
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {isConfirmed ? 'Confirmed' : 'Confirm Scores'}
          </button>
        </div>
      </div>
    </div>
  )
}
