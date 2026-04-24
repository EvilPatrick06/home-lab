import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { rollSingle } from '../../../../services/dice/dice-service'
import type { Character } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../../types/character-common'

interface StudyActionModalProps {
  character: Character
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

const STUDY_APPROACHES = [
  {
    skill: 'Arcana',
    ability: 'intelligence' as const,
    desc: 'Recall lore about spells, magic items, eldritch symbols, magical traditions, planes of existence, and inhabitants of those planes'
  },
  {
    skill: 'History',
    ability: 'intelligence' as const,
    desc: 'Recall lore about historical events, legendary people, ancient kingdoms, past disputes, recent wars, and lost civilizations'
  },
  {
    skill: 'Investigation',
    ability: 'intelligence' as const,
    desc: 'Search for clues, make deductions based on those clues, and piece together information'
  },
  {
    skill: 'Nature',
    ability: 'intelligence' as const,
    desc: 'Recall lore about terrain, plants, animals, weather, and natural cycles'
  },
  {
    skill: 'Religion',
    ability: 'intelligence' as const,
    desc: 'Recall lore about deities, rites, prayers, religious hierarchies, holy symbols, and the practices of secret cults'
  }
]

type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

export default function StudyActionModal({ character, onClose, onBroadcastResult }: StudyActionModalProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [result, setResult] = useState<{ roll: number; modifier: number; total: number } | null>(null)

  const char5e = character as Character5e
  const profBonus = Math.ceil(char5e.level / 4) + 1

  const getSkillModifier = (skillName: string, ability: AbilityKey): number => {
    const abilityScore = char5e.abilityScores?.[ability] ?? 10
    const mod = abilityModifier(abilityScore)

    const skillEntry = char5e.skills?.find((s) => s.name.toLowerCase() === skillName.toLowerCase())

    if (skillEntry?.expertise) return mod + profBonus * 2
    if (skillEntry?.proficient) return mod + profBonus
    return mod
  }

  const handleRoll = () => {
    if (selectedIndex === null) return
    const approach = STUDY_APPROACHES[selectedIndex]
    const mod = getSkillModifier(approach.skill, approach.ability)
    const roll = rollSingle(20)
    const total = roll + mod
    trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: char5e.name })
    setResult({ roll, modifier: mod, total })
  }

  const handleDone = () => {
    if (result && selectedIndex !== null) {
      const approach = STUDY_APPROACHES[selectedIndex]
      const natLabel = result.roll === 20 ? ' (Natural 20!)' : result.roll === 1 ? ' (Natural 1!)' : ''
      onBroadcastResult(
        `${char5e.name} uses the Study action with ${approach.skill}: rolled ${result.total} (d20: ${result.roll} ${formatMod(result.modifier)})${natLabel}`
      )
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-amber-400">Study</h2>
            <p className="text-xs text-gray-500 mt-0.5">Intelligence-based investigation</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Approaches List */}
          {STUDY_APPROACHES.map((approach, idx) => {
            const mod = getSkillModifier(approach.skill, approach.ability)
            const isSelected = selectedIndex === idx

            return (
              <button
                key={approach.skill}
                onClick={() => {
                  setSelectedIndex(idx)
                  setResult(null)
                }}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  isSelected ? 'border-amber-500 bg-amber-900/20' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                    {approach.skill}
                  </span>
                  <span className="text-sm font-mono text-gray-400">{formatMod(mod)}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{approach.desc}</p>
              </button>
            )
          })}

          {/* Roll Button */}
          {selectedIndex !== null && !result && (
            <button
              onClick={handleRoll}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-sm mt-2"
            >
              Roll {STUDY_APPROACHES[selectedIndex].skill} Check
            </button>
          )}

          {/* Result Display */}
          {result && (
            <div className="space-y-3 mt-2">
              <div className="text-center py-4 bg-gray-800 rounded-lg border border-gray-700">
                <div
                  className={`text-4xl font-bold mb-1 ${
                    result.roll === 20 ? 'text-green-400' : result.roll === 1 ? 'text-red-400' : 'text-white'
                  }`}
                >
                  {result.total}
                </div>
                <div className="text-sm text-gray-400">
                  <span
                    className={`font-mono ${
                      result.roll === 20 ? 'text-green-400' : result.roll === 1 ? 'text-red-400' : ''
                    }`}
                  >
                    d20: {result.roll}
                  </span>
                  <span className="mx-1">+</span>
                  <span>mod: {formatMod(result.modifier)}</span>
                </div>
                {result.roll === 20 && <div className="text-green-400 text-xs font-semibold mt-1">Natural 20!</div>}
                {result.roll === 1 && <div className="text-red-400 text-xs font-semibold mt-1">Natural 1!</div>}
              </div>

              <button
                onClick={handleDone}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
