import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { getConsumableEffects } from '../../../../data/effect-definitions'
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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [rollResult, setRollResult] = useState<{
    itemName: string
    total: number
    rolls: number[]
    formula: string
    effectType: string
  } | null>(null)

  if (!character) return <></>

  const equipment = character.equipment
  const is5e = is5eCharacter(character)
  const magicItems = is5e ? ((character as Character5e).magicItems ?? []) : []

  const handleUseConsumable = (item: { name: string; quantity: number }, index: number): void => {
    const effectSource = getConsumableEffects(item.name)
    if (!effectSource) {
      // No known effects, just broadcast usage
      if (onUseItem) onUseItem(item.name, `${character.name} uses ${item.name}`)
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
          onUseItem(
            item.name,
            `${character.name} drinks ${item.name} and heals ${result.total} HP! [${result.rolls.join('+')}${effect.dice.includes('+') ? `+${effect.dice.split('+')[1]}` : ''}]`
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
          onUseItem(item.name, `${character.name} drinks ${item.name} and gains ${effect.value} temporary HP!`)
        }
        return
      }
    }

    // Fallback: just broadcast
    if (onUseItem) onUseItem(item.name, `${character.name} uses ${item.name}`)
  }

  const handleUseItem = (item: { name: string; quantity: number }): void => {
    if (onUseItem) {
      onUseItem(item.name, `${character.name} uses ${item.name}`)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-lg w-full mx-4 shadow-2xl max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">Equipment & Items</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

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
                {rollResult.effectType === 'healing' ? `+${rollResult.total} HP` : `${rollResult.total} Temp HP`}
              </div>
              {rollResult.rolls.length > 0 && (
                <div className="flex gap-1 justify-center mt-1">
                  {rollResult.rolls.map((r, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono bg-gray-700 text-gray-300 border border-gray-600"
                    >
                      {r}
                    </span>
                  ))}
                  {rollResult.formula.includes('+') && (
                    <span className="text-[10px] text-gray-400 self-center">+{rollResult.formula.split('+')[1]}</span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setRollResult(null)}
              className="w-full mt-2 py-1 text-[10px] text-gray-400 hover:text-gray-300 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {/* Magic items with charges */}
          {magicItems.filter((mi) => mi.charges).length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-purple-400 uppercase tracking-wide mb-1">Magic Items (Charges)</div>
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
                    {mi.description && (
                      <div className="text-[10px] text-gray-500 mt-0.5 truncate">{mi.description}</div>
                    )}
                    <button
                      onClick={() => {
                        if (!mi.charges || mi.charges.current <= 0) return
                        if (onUseItem) {
                          onUseItem(
                            mi.name,
                            `${character.name} uses ${mi.name} (${mi.charges.current - 1}/${mi.charges.max} charges remaining)`
                          )
                        }
                        const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
                        if (!latest || !is5eCharacter(latest)) return
                        const l = latest as Character5e
                        const updated = {
                          ...l,
                          magicItems: (l.magicItems ?? []).map((m) =>
                            m.id === mi.id && m.charges
                              ? { ...m, charges: { ...m.charges, current: Math.max(0, m.charges.current - 1) } }
                              : m
                          ),
                          updatedAt: new Date().toISOString()
                        }
                        useCharacterStore.getState().saveCharacter(updated)
                      }}
                      disabled={!mi.charges || mi.charges.current <= 0}
                      className="w-full mt-1 py-1 text-[10px] rounded bg-purple-600/80 text-white hover:bg-purple-500 transition-colors cursor-pointer font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Use Charge ({mi.charges?.current} remaining)
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Regular equipment */}
          {equipment.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No equipment</p>
          ) : (
            equipment.map((item, i) => {
              const isExpanded = expandedIndex === i
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
                      {item.quantity > 1 && <span className="text-[10px] text-gray-500">x{item.quantity}</span>}
                      {hasEffect && (
                        <span className="text-[9px] text-cyan-500 bg-cyan-900/30 border border-cyan-700/30 rounded px-1 py-0.5">
                          FX
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {'isEquipped' in item && (item as { isEquipped?: boolean }).isEquipped && (
                        <span className="text-[9px] text-green-400 bg-green-900/30 border border-green-700/30 rounded px-1.5 py-0.5">
                          Equipped
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-2 space-y-1.5 border-t border-gray-700/30">
                      {description && <p className="text-[11px] text-gray-400 pt-1.5">{description}</p>}
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        {weight != null && <span>Weight: {weight} lb</span>}
                        {cost && <span>Cost: {cost}</span>}
                      </div>
                      {hasEffect ? (
                        <button
                          onClick={() => handleUseConsumable(item, i)}
                          className="w-full py-1.5 text-[10px] rounded bg-green-600/80 text-white hover:bg-green-500 transition-colors cursor-pointer font-semibold"
                        >
                          Use {item.name} (Auto-Apply Effect)
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUseItem(item)}
                          className="w-full py-1 text-[10px] rounded bg-amber-600/80 text-white hover:bg-amber-500 transition-colors cursor-pointer font-semibold"
                        >
                          {isConsumable ? 'Use Item (Consumable)' : 'Use Item'}
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
