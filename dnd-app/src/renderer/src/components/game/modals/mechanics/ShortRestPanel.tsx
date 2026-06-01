import { useCallback, useState } from 'react'
import { useT } from '../../../../i18n'
import { getEffectiveClasses } from '../../../../services/character/effective-character-5e'
import {
  getShortRestPreview,
  rollShortRestDice,
  type ShortRestDiceRoll,
  type ShortRestPreview as SRPreview
} from '../../../../services/character/rest-service-5e'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier } from '../../../../types/character-common'

interface PCShortRestState {
  selected: boolean
  preview: SRPreview
  diceCount: number
  selectedDieSize: number
  rolls: ShortRestDiceRoll[]
  rolled: boolean
  arcaneRecoverySlots: number[]
}

interface ShortRestPanelProps {
  pcs: Character5e[]
  onStatesChange: (states: Record<string, PCShortRestState>) => void
  states: Record<string, PCShortRestState>
}

export type { PCShortRestState }

export function initShortRestStates(pcs: Character5e[]): Record<string, PCShortRestState> {
  const states: Record<string, PCShortRestState> = {}
  for (const pc of pcs) {
    const preview = getShortRestPreview(pc)
    const dieSizes = [...new Set(getEffectiveClasses(pc).map((c) => c.hitDie))].sort((a, b) => b - a)
    states[pc.id] = {
      selected: true,
      preview,
      diceCount: Math.min(
        1,
        pc.hitDice.reduce((s, h) => s + h.current, 0)
      ),
      selectedDieSize: dieSizes[0] ?? 8,
      rolls: [],
      rolled: false,
      arcaneRecoverySlots: []
    }
  }
  return states
}

export default function ShortRestPanel({ pcs, states, onStatesChange }: ShortRestPanelProps): JSX.Element {
  const { t } = useT()
  const [, setRenderKey] = useState(0)

  const updateState = useCallback(
    (id: string, update: Partial<PCShortRestState>) => {
      const newStates = { ...states, [id]: { ...states[id], ...update } }
      onStatesChange(newStates)
    },
    [states, onStatesChange]
  )

  const handleRollDice = useCallback(
    (pcId: string) => {
      const state = states[pcId]
      if (!state) return
      const pc = pcs.find((c) => c.id === pcId)
      if (!pc) return
      const conMod = abilityModifier(pc.abilityScores.constitution)
      const rolls = rollShortRestDice(state.diceCount, state.selectedDieSize, conMod)
      const newStates = { ...states, [pcId]: { ...states[pcId], rolls, rolled: true } }
      onStatesChange(newStates)
      setRenderKey((k) => k + 1)
    },
    [states, pcs, onStatesChange]
  )

  const handleToggleArcaneSlot = useCallback(
    (pcId: string, level: number) => {
      const state = states[pcId]
      if (!state) return
      const existing = state.arcaneRecoverySlots
      const updated = existing.includes(level) ? existing.filter((l) => l !== level) : [...existing, level]
      const newStates = { ...states, [pcId]: { ...state, arcaneRecoverySlots: updated } }
      onStatesChange(newStates)
    },
    [states, onStatesChange]
  )

  return (
    <>
      {pcs.map((pc) => {
        const state = states[pc.id]
        if (!state) return null
        const conMod = abilityModifier(pc.abilityScores.constitution)
        const classes = getEffectiveClasses(pc)
        const dieSizes = [...new Set(classes.map((c) => c.hitDie))].sort((a, b) => b - a)
        const isMulticlass = classes.length > 1
        const totalHealing = state.rolls.reduce((sum, r) => sum + r.healing, 0)

        return (
          <div
            key={pc.id}
            className={`border rounded-lg p-3 transition-colors ${
              state.selected ? 'border-amber-600/50 bg-surface-2/50' : 'border-border/30 bg-surface-2/20 opacity-50'
            }`}
          >
            {/* Header row */}
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                checked={state.selected}
                onChange={() => updateState(pc.id, { selected: !state.selected })}
                className="accent-amber-500"
              />
              <span className="text-sm font-semibold text-gray-200">{pc.name}</span>
              <span className="text-xs text-gray-500">
                {t('game.shortRestPanel.levelPrefix', { level: pc.level })} {classes.map((c) => c.name).join('/')}
              </span>
              <span className="ml-auto text-xs text-muted">
                {t('game.shortRestPanel.hp', { current: pc.hitPoints.current, max: pc.hitPoints.maximum })}
              </span>
            </div>

            {state.selected && (
              <div className="space-y-2 pl-6">
                {/* HD info */}
                <div className="text-xs text-muted">
                  {t('game.shortRestPanel.hitDice')}{' '}
                  <span className="text-accent font-semibold">
                    {pc.hitDice.reduce((s, h) => s + h.current, 0)}/{pc.hitDice.reduce((s, h) => s + h.maximum, 0)}
                  </span>
                  {isMulticlass && (
                    <span className="text-gray-500 ml-1">
                      ({pc.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')})
                    </span>
                  )}
                </div>

                {pc.hitDice.reduce((s, h) => s + h.current, 0) === 0 ? (
                  <div className="text-xs text-red-400">{t('game.shortRestPanel.noHitDice')}</div>
                ) : !state.rolled ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Die size selector for multiclass */}
                    {isMulticlass && dieSizes.length > 1 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">{t('game.shortRestPanel.die')}</span>
                        {dieSizes.map((d) => (
                          <button
                            key={d}
                            onClick={() => updateState(pc.id, { selectedDieSize: d })}
                            className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
                              state.selectedDieSize === d
                                ? 'bg-amber-600 text-white'
                                : 'bg-gray-700 text-muted hover:bg-gray-600'
                            }`}
                          >
                            d{d}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Dice count */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">{t('game.shortRestPanel.spend')}</span>
                      <input
                        type="number"
                        min={0}
                        max={pc.hitDice.reduce((s, h) => s + h.current, 0)}
                        value={state.diceCount}
                        onChange={(e) =>
                          updateState(pc.id, {
                            diceCount: Math.max(
                              0,
                              Math.min(
                                pc.hitDice.reduce((s, h) => s + h.current, 0),
                                parseInt(e.target.value, 10) || 0
                              )
                            )
                          })
                        }
                        className="w-12 bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-center text-xs text-fg focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-xs text-gray-500">
                        d{isMulticlass ? state.selectedDieSize : (classes[0]?.hitDie ?? 8)}
                      </span>
                      <span className="text-xs text-gray-500">{t('game.shortRestPanel.conMod', { mod: conMod })}</span>
                    </div>
                    <button
                      onClick={() => handleRollDice(pc.id)}
                      disabled={state.diceCount === 0}
                      className="px-3 py-1 text-xs font-semibold rounded bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white cursor-pointer transition-colors"
                    >
                      {t('game.shortRestPanel.roll')}
                    </button>
                  </div>
                ) : (
                  /* Roll results */
                  <div className="space-y-1">
                    {state.rolls.map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-gray-300">
                        <span className="text-gray-500">{t('game.shortRestPanel.dieN', { n: i + 1 })}</span>
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-900/50 border border-amber-600/50 rounded text-amber-300 font-bold text-xs">
                          {r.rawRoll}
                        </span>
                        <span className="text-gray-500">+ {r.conMod}</span>
                        <span className="text-gray-600">=</span>
                        <span className="text-green-400 font-semibold">
                          {t('game.shortRestPanel.healingHp', { healing: r.healing })}
                        </span>
                      </div>
                    ))}
                    {state.rolls.length > 0 && (
                      <div className="text-xs font-semibold text-green-400 pt-1 border-t border-border/50">
                        {t('game.shortRestPanel.totalHp', { total: totalHealing })}
                        <span className="text-gray-500 font-normal ml-2">
                          ({pc.hitPoints.current} →{' '}
                          {Math.min(pc.hitPoints.maximum, pc.hitPoints.current + totalHealing)})
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Arcane Recovery (Wizard) */}
                {state.preview.arcaneRecoveryEligible && (
                  <div className="border-t border-border/30 pt-2 mt-2">
                    <div className="text-xs text-purple-400 font-semibold mb-1">
                      {t('game.shortRestPanel.arcaneRecovery', {
                        slots: state.preview.arcaneRecoverySlotsToRecover
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(pc.spellSlotLevels ?? {})
                        .filter(
                          ([level, slots]) =>
                            Number(level) <= state.preview.arcaneRecoveryMaxSlotLevel && slots.current < slots.max
                        )
                        .map(([level, slots]) => {
                          const lvl = Number(level)
                          const isSelected = state.arcaneRecoverySlots.includes(lvl)
                          const currentTotal = state.arcaneRecoverySlots.reduce((s, l) => s + l, 0)
                          const canAdd = !isSelected && currentTotal + lvl <= state.preview.arcaneRecoverySlotsToRecover
                          return (
                            <button
                              key={level}
                              onClick={() => handleToggleArcaneSlot(pc.id, lvl)}
                              disabled={!isSelected && !canAdd}
                              className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-purple-600 text-white'
                                  : canAdd
                                    ? 'bg-gray-700 text-gray-300 hover:bg-purple-600/30'
                                    : 'bg-surface-2 text-gray-600 cursor-not-allowed'
                              }`}
                            >
                              L{level} ({slots.current}/{slots.max})
                            </button>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Restored resources summary */}
                {(state.preview.restorableClassResources.length > 0 ||
                  state.preview.restorableSpeciesResources.length > 0 ||
                  state.preview.warlockPactSlots ||
                  state.preview.wildShapeRegain) && (
                  <div className="text-xs text-gray-500 mt-1">
                    {t('game.shortRestPanel.willAlsoRestore')}{' '}
                    {[
                      ...state.preview.restorableClassResources.map((r) => r.name),
                      ...state.preview.restorableSpeciesResources.map((r) => r.name),
                      state.preview.warlockPactSlots ? t('game.shortRestPanel.pactMagicSlots') : '',
                      state.preview.wildShapeRegain ? t('game.shortRestPanel.wildShapeRegain') : '',
                      state.preview.rangerTireless ? t('game.shortRestPanel.exhaustionMinus1') : ''
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
