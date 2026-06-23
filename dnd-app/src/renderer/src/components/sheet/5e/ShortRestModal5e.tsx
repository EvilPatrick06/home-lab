import { useState } from 'react'
import { useT } from '../../../i18n'
import {
  applyShortRest,
  getShortRestPreview,
  rollShortRestDice,
  type ShortRestDiceRoll
} from '../../../services/character/rest-service-5e'
import { useNetworkStore } from '../../../stores/network-store'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
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
  const { t } = useT()
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
    // Phase 29e — structural transport gate: only the network host can
    // broadcast `dm:character-update`. Phase 30 will revisit role-as-string.
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
    <Modal open={open} onClose={handleClose} title={t('sheet.shortRestModal.title')}>
      <div className="space-y-4">
        <div className="bg-surface-2/50 border border-border rounded-lg p-3 text-sm text-muted space-y-1">
          <div className="text-xs font-semibold text-gray-300 mb-1">{t('sheet.shortRestModal.takingShortRest')}</div>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>{t('sheet.shortRestModal.spendDice', { hitDie, conMod: `${conMod >= 0 ? '+' : ''}${conMod}` })}</li>
            <li>{t('sheet.shortRestModal.noSpellSlots')}</li>
            <li>{t('sheet.shortRestModal.noHitDice')}</li>
            {preview.wildShapeRegain && <li>{t('sheet.shortRestModal.wildShape')}</li>}
            {preview.rangerTireless && <li>{t('sheet.shortRestModal.tireless')}</li>}
            {preview.arcaneRecoveryEligible && (
              <li>{t('sheet.shortRestModal.arcaneRecovery', { count: preview.arcaneRecoverySlotsToRecover })}</li>
            )}
            {preview.warlockPactSlots && <li>{t('sheet.shortRestModal.pactSlots')}</li>}
            {preview.restorableClassResources.length > 0 && (
              <li>
                {t('sheet.shortRestModal.restore', {
                  resources: preview.restorableClassResources.map((r) => r.name).join(', ')
                })}
              </li>
            )}
          </ul>
        </div>

        <div className="text-sm text-muted">
          {t('sheet.shortRestModal.hitPointDice')}{' '}
          {isMulticlass ? (
            <span className="text-accent font-semibold">
              {remaining}/{character.hitDice.reduce((s, h) => s + h.maximum, 0)} (
              {character.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')})
            </span>
          ) : (
            <span className="text-accent font-semibold">
              {remaining}d{hitDie}
            </span>
          )}{' '}
          {t('sheet.shortRestModal.remainingOf', {
            remaining,
            max: character.hitDice.reduce((s, h) => s + h.maximum, 0)
          })}
        </div>

        {remaining === 0 ? (
          <div className="text-sm text-red-400">{t('sheet.shortRestModal.noDiceRemaining')}</div>
        ) : !rolled ? (
          <>
            {isMulticlass && dieSizes.length > 1 && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">{t('sheet.shortRestModal.dieType')}</label>
                <div className="flex gap-1">
                  {dieSizes.map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDieSize(d)}
                      className={`px-3 py-1 text-sm rounded transition-colors ${
                        selectedDieSize === d
                          ? 'bg-amber-600 text-white'
                          : 'border border-gray-600 text-muted hover:text-accent hover:border-amber-600'
                      }`}
                    >
                      d{d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">{t('sheet.shortRestModal.diceToSpend')}</label>
              <input
                name="dice-count"
                type="number"
                min={0}
                max={maxSpend}
                value={diceCount}
                onChange={(e) => setDiceCount(Math.max(0, Math.min(maxSpend, parseInt(e.target.value, 10) || 0)))}
                className="w-16 bg-surface-2 border border-gray-600 rounded px-2 py-1 text-center text-sm text-fg focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-gray-500">{t('sheet.shortRestModal.maxN', { max: maxSpend })}</span>
            </div>

            {/* Arcane Recovery slot picker */}
            {preview.arcaneRecoveryEligible && (
              <div className="border-t border-border pt-2">
                <div className="text-xs text-purple-400 font-semibold mb-1">
                  {t('sheet.shortRestModal.arcaneRecoveryHeader', { count: preview.arcaneRecoverySlotsToRecover })}
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

            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
              >
                {t('common.actions.cancel')}
              </button>
              <button
                onClick={roll}
                disabled={diceCount === 0}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
              >
                {t('sheet.shortRestModal.rollDice', { count: diceCount, die: isMulticlass ? selectedDieSize : hitDie })}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {rolls.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-gray-500">{t('sheet.shortRestModal.dieN', { n: i + 1 })}</span>
                  <span className="inline-flex items-center justify-center w-7 h-7 bg-amber-900/50 border border-amber-600/50 rounded text-amber-300 font-bold text-sm">
                    {r.rawRoll}
                  </span>
                  <span className="text-gray-500">{t('sheet.shortRestModal.conBonus', { conMod })}</span>
                  <span className="text-gray-600">=</span>
                  <span className="text-green-400 font-semibold">
                    {t('sheet.shortRestModal.healingHp', { healing: r.healing })}
                  </span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 text-sm font-semibold text-green-400">
                {t('sheet.shortRestModal.totalHealing', { total: totalHealing })}
              </div>
              <div className="text-xs text-gray-500">
                {t('sheet.shortRestModal.hpChange', {
                  current: character.hitPoints.current,
                  next: Math.min(character.hitPoints.maximum, character.hitPoints.current + totalHealing),
                  max: character.hitPoints.maximum
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={apply}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition-colors"
              >
                {t('sheet.shortRestModal.applyHealing')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
