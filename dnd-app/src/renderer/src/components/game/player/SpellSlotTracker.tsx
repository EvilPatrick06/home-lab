import { useState } from 'react'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { Character5e } from '../../../types/character-5e'

interface SpellSlotTrackerProps {
  spellSlots?: Record<number, { total: number; used: number }>
  onSlotChange?: (level: number, used: number) => void
  /** Entity ID of the character for action economy tracking */
  characterId?: string
}

// Default 5e spell slots if none provided
const DEFAULT_5E_SLOTS: Record<number, { total: number; used: number }> = {
  1: { total: 4, used: 0 },
  2: { total: 3, used: 0 },
  3: { total: 3, used: 0 },
  4: { total: 3, used: 0 },
  5: { total: 2, used: 0 },
  6: { total: 1, used: 0 },
  7: { total: 1, used: 0 },
  8: { total: 1, used: 0 },
  9: { total: 1, used: 0 }
}

export default function SpellSlotTracker({
  spellSlots: externalSlots,
  onSlotChange,
  characterId
}: SpellSlotTrackerProps): JSX.Element {
  const [localSlots, setLocalSlots] = useState(externalSlots ?? DEFAULT_5E_SLOTS)
  const [lastCastMessage, setLastCastMessage] = useState<string | null>(null)

  const slots = externalSlots ?? localSlots
  const initiative = useGameStore((s) => s.initiative)
  const turnStates = useGameStore((s) => s.turnStates)

  // 5e spell slot display
  const handleSlotClick = (level: number): void => {
    const current = slots[level]
    if (!current) return

    const newUsed = current.used < current.total ? current.used + 1 : 0
    const isExpending = newUsed > current.used // spending a slot (not resetting)

    if (onSlotChange) {
      onSlotChange(level, newUsed)
    } else {
      setLocalSlots({
        ...slots,
        [level]: { ...current, used: newUsed }
      })
    }

    // PHB 2024: Spending a spell slot during combat consumes the action
    // (most spells are 1 action; bonus action spells are tracked separately)
    if (isExpending && initiative && characterId) {
      const ts = turnStates[characterId]
      if (ts && !ts.actionUsed) {
        useGameStore.getState().useAction(characterId)
        setLastCastMessage(`Level ${level} slot used — Action consumed`)
        // Auto-clear message after 3s
        setTimeout(() => setLastCastMessage(null), 3000)
      } else if (ts && ts.actionUsed && !ts.bonusActionUsed) {
        // If action already used, this might be a bonus action spell
        useGameStore.getState().useBonusAction(characterId)
        setLastCastMessage(`Level ${level} slot used — Bonus Action consumed`)
        setTimeout(() => setLastCastMessage(null), 3000)
      }
    }

    // Sync with character store if we have a characterId
    if (isExpending && characterId) {
      try {
        const charStore = useCharacterStore.getState()
        const char = charStore.characters.find((c) => c.id === characterId) as Character5e | undefined
        if (char?.spellSlotLevels?.[level]) {
          const slotData = char.spellSlotLevels[level]
          if (slotData.current > 0) {
            charStore.saveCharacter({
              ...char,
              spellSlotLevels: {
                ...char.spellSlotLevels,
                [level]: { ...slotData, current: slotData.current - 1 }
              }
            })
          }
        }
      } catch {
        // Character store sync is best-effort
      }
    }
  }

  // Only show levels with slots
  const activeLevels = Object.entries(slots)
    .filter(([, v]) => v.total > 0)
    .map(([k]) => parseInt(k, 10))

  if (activeLevels.length === 0) {
    return <div className="text-xs text-gray-500 text-center py-2">No spell slots</div>
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] text-gray-500 uppercase tracking-wider">Spell Slots</h4>
      {lastCastMessage && (
        <div className="text-[9px] text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded px-1.5 py-0.5">
          {lastCastMessage}
        </div>
      )}
      <div className="space-y-1">
        {activeLevels.map((level) => {
          const slot = slots[level]
          const remaining = slot.total - slot.used
          return (
            <div key={level} className="flex items-center gap-2 text-xs">
              <span className="w-8 text-gray-500 text-right text-[10px]">Lv {level}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: slot.total }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleSlotClick(level)}
                    className={`w-4 h-4 rounded-full border transition-colors cursor-pointer
                      ${
                        i < remaining
                          ? 'bg-amber-600 border-amber-500 hover:bg-amber-500'
                          : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                      }`}
                    title={`Level ${level} slot ${i + 1}`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-gray-500">
                {remaining}/{slot.total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
