import { useCallback, useMemo } from 'react'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'

/**
 * Phase 15f — In-game spell preparation.
 *
 * Lightweight modal version of the full sheet-side spell-prep UI so a
 * player on a prepared-caster class (Cleric / Druid / Paladin / Wizard)
 * can swap preparations mid-session without leaving the game view. The
 * panel is gated by an out-of-combat / long-rest check: prepared spells
 * can only change when the player isn't in initiative. If the gate
 * fails the modal still renders but the toggles are disabled with a
 * "wait until after combat / on long rest" hint.
 *
 * Source of truth for spell data is `character.knownSpells`; the
 * mutation flips IDs in `character.preparedSpellIds` via the character
 * store's saveCharacter so it persists + broadcasts.
 */

interface SpellPrepModalProps {
  character: Character
  onClose: () => void
}

const PREPARED_CASTER_CLASSES = new Set(['cleric', 'druid', 'paladin', 'wizard'])

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

function primaryClassId(char: Character5e): string {
  return (char.classes?.[0]?.name ?? '').toLowerCase()
}

function maxPreparedFor(char: Character5e): number {
  const className = primaryClassId(char)
  const level = char.level ?? 1
  if (className === 'wizard') {
    return modifier(char.abilityScores?.intelligence ?? 10) + level
  }
  if (className === 'cleric' || className === 'druid') {
    return modifier(char.abilityScores?.wisdom ?? 10) + level
  }
  if (className === 'paladin') {
    return Math.max(1, modifier(char.abilityScores?.charisma ?? 10) + Math.floor(level / 2))
  }
  return level
}

export default function SpellPrepModal({ character, onClose }: SpellPrepModalProps): JSX.Element {
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const initiative = useGameStore((s) => s.initiative)
  const inCombat = !!initiative

  const char5e = is5eCharacter(character) ? (character as Character5e) : null
  const isPreparedCaster = !!char5e && PREPARED_CASTER_CLASSES.has(primaryClassId(char5e))

  const preparedSet = useMemo(() => new Set(char5e?.preparedSpellIds ?? []), [char5e?.preparedSpellIds])
  const maxPrepared = char5e ? maxPreparedFor(char5e) : 0
  const leveled = useMemo(() => (char5e?.knownSpells ?? []).filter((s) => s.level > 0), [char5e?.knownSpells])

  const preparedCount = leveled.filter((s) => preparedSet.has(s.id)).length

  const handleToggle = useCallback(
    (spellId: string) => {
      if (!char5e || inCombat) return
      const current = char5e.preparedSpellIds ?? []
      const already = current.includes(spellId)
      if (!already && preparedCount >= maxPrepared) return // at cap
      const next = already ? current.filter((id) => id !== spellId) : [...current, spellId]
      const updated: Character5e = { ...char5e, preparedSpellIds: next, updatedAt: new Date().toISOString() }
      void saveCharacter(updated as Character)
    },
    [char5e, inCombat, preparedCount, maxPrepared, saveCharacter]
  )

  if (!char5e || !isPreparedCaster) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-md w-full mx-4">
          <p className="text-sm text-gray-300">
            Spell preparation is only available for Cleric, Druid, Paladin, and Wizard characters.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center pb-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-lg w-full mx-4 shadow-2xl max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Prepare Spells</h3>
            <p className="text-[10px] text-gray-500">
              {preparedCount} / {maxPrepared} prepared
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {inCombat && (
          <p className="text-[11px] text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded px-2 py-1 mb-2">
            Locked during combat. Spell preparation requires a long rest (or being out of initiative).
          </p>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {leveled.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No leveled spells learned yet.</p>
          ) : (
            leveled.map((spell) => {
              const isPrepared = preparedSet.has(spell.id)
              const atCap = !isPrepared && preparedCount >= maxPrepared
              const disabled = inCombat || atCap
              return (
                <button
                  key={spell.id}
                  type="button"
                  onClick={() => handleToggle(spell.id)}
                  disabled={disabled}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                    isPrepared
                      ? 'bg-amber-900/40 border border-amber-600/40 text-amber-100'
                      : 'bg-gray-800/40 border border-gray-700/30 text-gray-300 hover:bg-gray-800'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  aria-pressed={isPrepared}
                >
                  <div className="text-left">
                    <div className="font-medium">{spell.name}</div>
                    <div className="text-[9px] text-gray-500">Level {spell.level}</div>
                  </div>
                  <span className="text-[10px]">{isPrepared ? '✓ Prepared' : 'Not prepared'}</span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
