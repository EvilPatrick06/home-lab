import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { getConsumableEffects } from '../../../../data/effect-definitions'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { getEffectiveMagicItems } from '../../../../services/character/effective-character-5e'
import { rollMultiple } from '../../../../services/dice/dice-service'
import { useCharacterStore } from '../../../../stores/use-character-store'
import type { Character } from '../../../../types/character'
import { is5eCharacter } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'

interface ItemModalProps {
  character: Character | null
  onClose: () => void
  onUseItem?: (itemName: string, message: string) => void
}

function rollDice(formula: string): { total: number; rolls: number[]; formula: string } {
  const match = formula.match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/)
  if (!match) return { total: 0, rolls: [], formula }
  const count = match[1] ? parseInt(match[1], 10) : 1
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0
  const rolls = rollMultiple(count, sides)
  const total = rolls.reduce((s, r) => s + r, 0) + modifier
  return { total: Math.max(0, total), rolls, formula }
}

export default function ItemModal({ character, onClose, onUseItem }: ItemModalProps): JSX.Element {
  const { t } = useT()
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [rollResult, setRollResult] = useState<{
    itemName: string
    total: number
    rolls: number[]
    formula: string
    effectType: string
  } | null>(null)
  useEscapeKey(onClose)

  if (!character) return <></>

  const equipment = character.equipment
  const is5e = is5eCharacter(character)
  const magicItems = is5e ? getEffectiveMagicItems(character as Character5e) : []
  // Phase 15a: Player Inventory Panel — surface currency totals and total
  // carried weight as headline summary fields. Previously the modal was
  // a flat item list with no aggregate view; players had to mentally
  // sum coins / lb. across rows or open the full character sheet.
  const treasure = is5e ? (character as Character5e).treasure : undefined
  const totalWeight = equipment.reduce((sum, item) => {
    const w = item.weight ?? 0
    return sum + w * (item.quantity || 1)
  }, 0)
  const strScore = is5e ? ((character as Character5e).abilityScores?.strength ?? 10) : 10
  const carryCapacity = strScore * 15 // 5e standard
  const isEncumbered = totalWeight > carryCapacity

  const handleUseConsumable = (item: { name: string; quantity: number }, index: number): void => {
    const effectSource = getConsumableEffects(item.name)
    if (!effectSource) {
      // No known effects, just broadcast usage
      if (onUseItem) onUseItem(item.name, t('game.itemModal.usesItem', { name: character.name, item: item.name }))
      return
    }

    for (const effect of effectSource.effects) {
      if (effect.type === 'heal' && effect.dice) {
        const result = rollDice(effect.dice)
        trigger3dDice({ formula: effect.dice, rolls: result.rolls, total: result.total, rollerName: character.name })
        setRollResult({
          itemName: item.name,
          total: result.total,
          rolls: result.rolls,
          formula: effect.dice,
          effectType: 'healing'
        })

        // Apply healing to character
        const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
        if (latest && is5eCharacter(latest)) {
          const char5e = latest as Character5e
          const newHP = Math.min(char5e.hitPoints.maximum, char5e.hitPoints.current + result.total)
          const updated = {
            ...char5e,
            hitPoints: { ...char5e.hitPoints, current: newHP },
            equipment: char5e.equipment
              .map((e, i) => (i === index && e.quantity > 1 ? { ...e, quantity: e.quantity - 1 } : e))
              .filter((e, i) => i !== index || e.quantity > 1),
            updatedAt: new Date().toISOString()
          }
          useCharacterStore.getState().saveCharacter(updated)
        }

        if (onUseItem) {
          const rollBreakdown = `${result.rolls.join('+')}${effect.dice.includes('+') ? `+${effect.dice.split('+')[1]}` : ''}`
          onUseItem(
            item.name,
            t('game.itemModal.drinksHeals', {
              name: character.name,
              item: item.name,
              hp: result.total,
              breakdown: rollBreakdown
            })
          )
        }
        return
      }

      if (effect.type === 'temp_hp' && effect.value) {
        const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
        if (latest && is5eCharacter(latest)) {
          const char5e = latest as Character5e
          const newTemp = Math.max(char5e.hitPoints.temporary, effect.value)
          const updated = {
            ...char5e,
            hitPoints: { ...char5e.hitPoints, temporary: newTemp },
            equipment: char5e.equipment
              .map((e, i) => (i === index && e.quantity > 1 ? { ...e, quantity: e.quantity - 1 } : e))
              .filter((e, i) => i !== index || e.quantity > 1),
            updatedAt: new Date().toISOString()
          }
          useCharacterStore.getState().saveCharacter(updated)
        }

        setRollResult({ itemName: item.name, total: effect.value, rolls: [], formula: '', effectType: 'temp_hp' })
        if (onUseItem) {
          onUseItem(
            item.name,
            t('game.itemModal.drinksTempHp', { name: character.name, item: item.name, hp: effect.value })
          )
        }
        return
      }
    }

    // Fallback: just broadcast
    if (onUseItem) onUseItem(item.name, t('game.itemModal.usesItem', { name: character.name, item: item.name }))
  }

  const handleUseItem = (item: { name: string; quantity: number }): void => {
    if (onUseItem) {
      onUseItem(item.name, t('game.itemModal.usesItem', { name: character.name, item: item.name }))
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-lg w-full mx-4 shadow-2xl max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.itemModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        {/* Phase 15a: aggregate inventory summary — currency totals + total
            carried weight + encumbrance flag. Replaces the previous "open the
            full character sheet to see your coins" round-trip. */}
        {treasure && (
          <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] shrink-0">
            <div className="rounded-lg border border-gray-700/50 bg-gray-800/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">
                {t('game.itemModal.currency')}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-gray-300">
                {treasure.pp > 0 && (
                  <span>
                    <span className="text-amber-300">{treasure.pp}</span> pp
                  </span>
                )}
                <span>
                  <span className="text-yellow-400">{treasure.gp}</span> gp
                </span>
                {treasure.ep != null && treasure.ep > 0 && (
                  <span>
                    <span className="text-yellow-200">{treasure.ep}</span> ep
                  </span>
                )}
                <span>
                  <span className="text-gray-300">{treasure.sp}</span> sp
                </span>
                <span>
                  <span className="text-orange-400">{treasure.cp}</span> cp
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-gray-700/50 bg-gray-800/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">
                {t('game.itemModal.carryWeight')}
              </div>
              <div className={`font-mono text-sm ${isEncumbered ? 'text-red-400' : 'text-gray-200'}`}>
                {totalWeight.toFixed(1)} / {carryCapacity} lb
                {isEncumbered && <span className="ml-1 text-xs uppercase">{t('game.itemModal.encumbered')}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Roll result banner */}
        {rollResult && (
          <div
            className={`mb-3 p-3 rounded-lg border ${
              rollResult.effectType === 'healing'
                ? 'border-green-500/50 bg-green-900/20'
                : 'border-blue-500/50 bg-blue-900/20'
            }`}
          >
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">{rollResult.itemName}</div>
              <div
                className={`text-2xl font-bold font-mono ${rollResult.effectType === 'healing' ? 'text-green-400' : 'text-blue-400'}`}
              >
                {rollResult.effectType === 'healing'
                  ? t('game.itemModal.healResult', { total: rollResult.total })
                  : t('game.itemModal.tempHpResult', { total: rollResult.total })}
              </div>
              {rollResult.rolls.length > 0 && (
                <div className="flex gap-1 justify-center mt-1">
                  {rollResult.rolls.map((r, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-mono bg-gray-700 text-gray-300 border border-gray-600"
                    >
                      {r}
                    </span>
                  ))}
                  {rollResult.formula.includes('+') && (
                    <span className="text-xs text-gray-400 self-center">+{rollResult.formula.split('+')[1]}</span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setRollResult(null)}
              className="w-full mt-2 py-1 text-xs text-gray-400 hover:text-gray-300 cursor-pointer"
            >
              {t('game.itemModal.dismiss')}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {/* Magic items with charges */}
          {magicItems.filter((mi) => mi.charges).length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">
                {t('game.itemModal.magicItemsCharges')}
              </div>
              {magicItems
                .filter((mi) => mi.charges)
                .map((mi, i) => (
                  <div
                    key={mi.id || i}
                    className="bg-purple-900/20 border border-purple-700/30 rounded-lg px-3 py-2 mb-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-purple-300">{mi.name}</span>
                      <span className="text-xs font-mono text-purple-400">
                        {mi.charges?.current}/{mi.charges?.max}
                      </span>
                    </div>
                    {mi.description && <div className="text-xs text-gray-500 mt-0.5 truncate">{mi.description}</div>}
                    <button
                      onClick={() => {
                        if (!mi.charges || mi.charges.current <= 0) return
                        if (onUseItem) {
                          onUseItem(
                            mi.name,
                            t('game.itemModal.usesCharge', {
                              name: character.name,
                              item: mi.name,
                              current: mi.charges.current - 1,
                              max: mi.charges.max
                            })
                          )
                        }
                        const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
                        if (!latest || !is5eCharacter(latest)) return
                        const l = latest as Character5e
                        // Phase 15c.5 — charge state lives in state.magicItemCharges, keyed by instanceId.
                        // boundary cast: hydrated entries carry a synthetic __instanceId not on the public MagicItemEntry5e
                        const miInstanceId = (mi as unknown as { __instanceId: string }).__instanceId
                        const updated = {
                          ...l,
                          state: {
                            ...l.state,
                            magicItemCharges: {
                              ...l.state?.magicItemCharges,
                              [miInstanceId]: Math.max(0, (mi.charges?.current ?? 0) - 1)
                            }
                          },
                          updatedAt: new Date().toISOString()
                        }
                        useCharacterStore.getState().saveCharacter(updated)
                      }}
                      disabled={!mi.charges || mi.charges.current <= 0}
                      className="w-full mt-1 py-1 text-xs rounded bg-purple-600/80 text-white hover:bg-purple-500 transition-colors cursor-pointer font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('game.itemModal.useCharge', { current: mi.charges?.current })}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Regular equipment */}
          {equipment.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">{t('game.itemModal.noEquipment')}</p>
          ) : (
            equipment.map((item, i) => {
              const isExpanded = expandedIndex === i
              // boundary cast: EquipmentItem has no index signature; read optional/legacy fields (consumable, …) via Record
              const itemAny = item as unknown as Record<string, unknown>
              const description = (itemAny.description as string) || null
              const weight = (itemAny.weight as number) || null
              const cost = (itemAny.cost as string) || null
              const isConsumable =
                (itemAny.consumable as boolean) || (itemAny.type as string) === 'potion' || /potion/i.test(item.name)
              const hasEffect = !!getConsumableEffects(item.name)

              return (
                <div
                  key={`${item.name}-${i}`}
                  className="bg-gray-800/50 border border-gray-700/30 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedIndex(isExpanded ? null : i)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                      <span className="text-xs font-medium text-gray-200">{item.name}</span>
                      {item.quantity > 1 && <span className="text-xs text-gray-500">x{item.quantity}</span>}
                      {hasEffect && (
                        <span className="text-[9px] text-cyan-500 bg-cyan-900/30 border border-cyan-700/30 rounded px-1 py-0.5">
                          FX
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {'isEquipped' in item && (item as { isEquipped?: boolean }).isEquipped && (
                        <span className="text-[9px] text-green-400 bg-green-900/30 border border-green-700/30 rounded px-1.5 py-0.5">
                          {t('game.itemModal.equipped')}
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-2 space-y-1.5 border-t border-gray-700/30">
                      {description && <p className="text-[11px] text-gray-400 pt-1.5">{description}</p>}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {weight != null && <span>{t('game.itemModal.weight', { weight })}</span>}
                        {cost && <span>{t('game.itemModal.cost', { cost })}</span>}
                      </div>
                      {hasEffect ? (
                        <button
                          onClick={() => handleUseConsumable(item, i)}
                          className="w-full py-1.5 text-xs rounded bg-green-600/80 text-white hover:bg-green-500 transition-colors cursor-pointer font-semibold"
                        >
                          {t('game.itemModal.useAutoApply', { name: item.name })}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUseItem(item)}
                          className="w-full py-1 text-xs rounded bg-amber-600/80 text-white hover:bg-amber-500 transition-colors cursor-pointer font-semibold"
                        >
                          {isConsumable ? t('game.itemModal.useConsumable') : t('game.itemModal.useItem')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
