import { useCharacterStore } from '../../../stores/use-character-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import SpellSlotGrid5e from './SpellSlotGrid5e'

interface SpellSlotTracker5eProps {
  character: Character5e
  readonly?: boolean
  spellSlotLevels: Record<string, { current: number; max: number }>
  pactMagicSlotLevels: Record<string, { current: number; max: number }>
  isPureWarlock: boolean
}

export default function SpellSlotTracker5e({
  character,
  readonly,
  spellSlotLevels,
  pactMagicSlotLevels,
  isPureWarlock
}: SpellSlotTracker5eProps): JSX.Element | null {
  const hasSpellSlots = Object.keys(spellSlotLevels).length > 0
  const hasPactSlots = Object.keys(pactMagicSlotLevels).length > 0

  if (!hasSpellSlots && !hasPactSlots) return null

  function getLatestCharacter(): Character {
    return useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
  }

  function handleSlotClick(level: number, _circleIndex: number, isFilled: boolean): void {
    if (readonly) return
    const latest = getLatestCharacter()
    const currentSlots = latest.spellSlotLevels?.[level]
    if (!currentSlots) return

    let newCurrent: number
    if (isFilled) {
      newCurrent = Math.max(0, currentSlots.current - 1)
    } else {
      newCurrent = Math.min(currentSlots.max, currentSlots.current + 1)
    }

    const updatedSlots = {
      ...latest.spellSlotLevels,
      [level]: { ...currentSlots, current: newCurrent }
    }
    const updated = { ...latest, spellSlotLevels: updatedSlots, updatedAt: new Date().toISOString() } as Character
    useCharacterStore.getState().saveCharacter(updated)
  }

  function handlePactSlotClick(level: number, _circleIndex: number, isFilled: boolean): void {
    if (readonly) return
    const latest = getLatestCharacter() as Character5e
    const currentSlots = latest.pactMagicSlotLevels?.[level]
    if (!currentSlots) return

    let newCurrent: number
    if (isFilled) {
      newCurrent = Math.max(0, currentSlots.current - 1)
    } else {
      newCurrent = Math.min(currentSlots.max, currentSlots.current + 1)
    }

    const updatedPactSlots = {
      ...latest.pactMagicSlotLevels,
      [level]: { ...currentSlots, current: newCurrent }
    }
    const updated = {
      ...latest,
      pactMagicSlotLevels: updatedPactSlots,
      updatedAt: new Date().toISOString()
    } as Character
    useCharacterStore.getState().saveCharacter(updated)
  }

  function handleLongRest(): void {
    if (readonly) return
    const latest = getLatestCharacter() as Character5e
    const currentSlots = latest.spellSlotLevels ?? {}

    const restoredSlots: Record<number, { current: number; max: number }> = {}
    for (const [level, slots] of Object.entries(currentSlots)) {
      restoredSlots[Number(level)] = { current: slots.max, max: slots.max }
    }

    const currentPactSlots = latest.pactMagicSlotLevels ?? {}
    const restoredPactSlots: Record<number, { current: number; max: number }> = {}
    for (const [level, slots] of Object.entries(currentPactSlots)) {
      restoredPactSlots[Number(level)] = { current: slots.max, max: slots.max }
    }

    const restoredSpells = (latest.knownSpells ?? []).map((s) => {
      if (!s.innateUses) return s
      return { ...s, innateUses: { max: s.innateUses.max, remaining: s.innateUses.max } }
    })

    const updated = {
      ...latest,
      spellSlotLevels: restoredSlots,
      knownSpells: restoredSpells,
      ...(Object.keys(restoredPactSlots).length > 0 ? { pactMagicSlotLevels: restoredPactSlots } : {}),
      updatedAt: new Date().toISOString()
    } as Character
    useCharacterStore.getState().saveCharacter(updated)
  }

  return (
    <>
      {/* Restore Slots button */}
      {!readonly && hasSpellSlots && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={handleLongRest}
            className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-gray-900 font-semibold transition-colors"
          >
            Restore Slots
          </button>
        </div>
      )}

      {/* Spell slots */}
      {hasSpellSlots && (
        <SpellSlotGrid5e
          label={isPureWarlock ? 'Pact Magic Slots' : 'Spell Slots'}
          slotLevels={spellSlotLevels}
          onSlotClick={handleSlotClick}
          readonly={!!readonly}
          isPact={isPureWarlock}
        />
      )}

      {/* Pact Magic Slots (multiclass warlock + other caster) */}
      {hasPactSlots && (
        <SpellSlotGrid5e
          label="Pact Magic Slots"
          slotLevels={pactMagicSlotLevels}
          onSlotClick={handlePactSlotClick}
          readonly={!!readonly}
          isPact
        />
      )}
    </>
  )
}
