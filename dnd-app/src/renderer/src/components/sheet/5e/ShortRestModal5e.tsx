import { useState } from 'react'
import {
  applyShortRest,
  getShortRestPreview,
  rollShortRestDice,
  type ShortRestDiceRoll
} from '../../../services/character/rest-service-5e'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import { abilityModifier } from '../../../types/character-common'
import Modal from '../../ui/Modal'

interface ShortRestModal5eProps {
  character: Character5e
  open: boolean
  onClose: () => void
}

export default function ShortRestModal5e({ character, open, onClose }: ShortRestModal5eProps): JSX.Element | null {
  const preview = getShortRestPreview(character)
  const isMulticlass = character.hitDice.length > 1
  const hitDie = character.hitDice[0]?.dieType ?? 8
  const conMod = abilityModifier(character.abilityScores.constitution)
  const remaining = character.hitDice.reduce((s, h) => s + h.current, 0)
  const maxSpend = remaining

  const [diceCount, setDiceCount] = useState(Math.min(1, maxSpend))
  const [selectedDieSize, setSelectedDieSize] = useState(hitDie)
  const [rolled, setRolled] = useState(false)
  const [rolls, setRolls] = useState<ShortRestDiceRoll[]>([])
  const [arcaneRecoverySlots, setArcaneRecoverySlots] = useState<number[]>([])

  // Available die sizes from all classes
  const dieSizes = [...new Set(character.hitDice.map((h) => h.dieType))].sort((a, b) => b - a)

  const roll = (): void => {
    const dieToUse = isMulticlass ? selectedDieSize : hitDie
    const diceRolls = rollShortRestDice(diceCount, dieToUse, conMod)
    setRolls(diceRolls)
    setRolled(true)
  }

  const totalHealing = rolls.reduce((sum, r) => sum + r.healing, 0)

  const apply = (): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    if (!is5eCharacter(latest)) return

    const result = applyShortRest(latest, rolls, arcaneRecoverySlots)
    useCharacterStore.getState().saveCharacter(result.character)

    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && result.character.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: result.character.id,
        characterData: result.character,
        targetPeerId: result.character.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(result.character.id, result.character)
    }

    setRolled(false)
    setRolls([])
    setArcaneRecoverySlots([])
    setDiceCount(Math.min(1, maxSpend))
    onClose()
  }

  const handleClose = (): void => {
    if (rolled) return
    setRolled(false)
    setRolls([])
    setArcaneRecoverySlots([])
    setDiceCount(Math.min(1, maxSpend))
    onClose()
  }

  const handleToggleArcaneSlot = (level: number): void => {
    setArcaneRecoverySlots((prev) => {
      if (prev.includes(level)) return prev.filter((l) => l !== level)
      return [...prev, level]
    })
  }

  const arcaneTotal = arcaneRecoverySlots.reduce((s, l) => s + l, 0)

  return (
    <Modal open={open} onClose={handleClose} title="Short Rest">
      <div className="space-y-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-400 space-y-1">
          <div className="text-xs font-semibold text-gray-300 mb-1">Taking a short rest will:</div>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>
              Spend Hit Point Dice to heal (1d{hitDie} + {conMod >= 0 ? '+' : ''}
              {conMod} CON per die)
            </li>
            <li>Does NOT restore spell slots</li>
            <li>Does NOT restore Hit Point Dice</li>
            {preview.wildShapeRegain && <li>Regain 1 Wild Shape use</li>}
            {preview.rangerTireless && <li>Reduce Exhaustion by 1 (Tireless)</li>}
            {preview.arcaneRecoveryEligible && (
              <li>Arcane Recovery: recover up to {preview.arcaneRecoverySlotsToRecover} spell slot levels</li>
            )}
            {preview.warlockPactSlots && <li>Restore Pact Magic slots</li>}
            {preview.restorableClassResources.length > 0 && (
              <li>Restore: {preview.restorableClassResources.map((r) => r.name).join(', ')}</li>
            )}
          </ul>
        </div>

        <div className="text-sm text-gray-400">
          Hit Point Dice:{' '}
          {isMulticlass ? (
            <span className="text-amber-400 font-semibold">
              {remaining}/{character.hitDice.reduce((s, h) => s + h.maximum, 0)} (
              {character.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')})
            </span>
          ) : (
            <span className="text-amber-400 font-semibold">
              {remaining}d{hitDie}
            </span>
          )}{' '}
          ({remaining} of {character.hitDice.reduce((s, h) => s + h.maximum, 0)} remaining)
        </div>

        {remaining === 0 ? (
          <div className="text-sm text-red-400">No Hit Point Dice remaining. Take a long rest to recover.</div>
        ) : !rolled ? (
          <>
            {isMulticlass && dieSizes.length > 1 && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Die type:</label>
                <div className="flex gap-1">
                  {dieSizes.map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDieSize(d)}
                      className={`px-3 py-1 text-sm rounded transition-colors ${
                        selectedDieSize === d
                          ? 'bg-amber-600 text-white'
                          : 'border border-gray-600 text-gray-400 hover:text-amber-400 hover:border-amber-600'
                      }`}
                    >
                      d{d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">Dice to spend:</label>
              <input
                type="number"
                min={0}
                max={maxSpend}
                value={diceCount}
                onChange={(e) => setDiceCount(Math.max(0, Math.min(maxSpend, parseInt(e.target.value, 10) || 0)))}
                className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-gray-500">(max {maxSpend})</span>
            </div>

            {/* Arcane Recovery slot picker */}
            {preview.arcaneRecoveryEligible && (
              <div className="border-t border-gray-700 pt-2">
                <div className="text-xs text-purple-400 font-semibold mb-1">
                  Arcane Recovery (up to {preview.arcaneRecoverySlotsToRecover} slot levels)
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(character.spellSlotLevels ?? {})
                    .filter(
                      ([level, slots]) =>
                        Number(level) <= preview.arcaneRecoveryMaxSlotLevel && slots.current < slots.max
                    )
                    .map(([level, slots]) => {
                      const lvl = Number(level)
                      const isSelected = arcaneRecoverySlots.includes(lvl)
                      const canAdd = !isSelected && arcaneTotal + lvl <= preview.arcaneRecoverySlotsToRecover
                      return (
                        <button
                          key={level}
                          onClick={() => handleToggleArcaneSlot(lvl)}
                          disabled={!isSelected && !canAdd}
                          className={`px-2 py-0.5 text-xs rounded transition-colors ${
                            isSelected
                              ? 'bg-purple-600 text-white'
                              : canAdd
                                ? 'bg-gray-700 text-gray-300 hover:bg-purple-600/30 cursor-pointer'
                                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                          }`}
                        >
                          L{level} ({slots.current}/{slots.max})
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={roll}
                disabled={diceCount === 0}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
              >
                Roll {diceCount}d{isMulticlass ? selectedDieSize : hitDie}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {rolls.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-gray-500">Die {i + 1}:</span>
                  <span className="inline-flex items-center justify-center w-7 h-7 bg-amber-900/50 border border-amber-600/50 rounded text-amber-300 font-bold text-sm">
                    {r.rawRoll}
                  </span>
                  <span className="text-gray-500">+ {conMod} (CON)</span>
                  <span className="text-gray-600">=</span>
                  <span className="text-green-400 font-semibold">+{r.healing} HP</span>
                </div>
              ))}
              <div className="border-t border-gray-700 pt-2 mt-2 text-sm font-semibold text-green-400">
                Total healing: +{totalHealing} HP
              </div>
              <div className="text-xs text-gray-500">
                HP: {character.hitPoints.current} &rarr;{' '}
                {Math.min(character.hitPoints.maximum, character.hitPoints.current + totalHealing)} /{' '}
                {character.hitPoints.maximum}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={apply}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition-colors"
              >
                Apply Healing
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
