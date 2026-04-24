import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { rollSingle } from '../../../../services/dice/dice-service'
import type { Character } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../../types/character-common'

interface InfluenceModalProps {
  character: Character
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

const INFLUENCE_APPROACHES = [
  { skill: 'Deception', ability: 'charisma' as const, desc: 'Deceive a creature that understands you' },
  { skill: 'Intimidation', ability: 'charisma' as const, desc: 'Intimidate a creature' },
  { skill: 'Performance', ability: 'charisma' as const, desc: 'Amuse a creature' },
  { skill: 'Persuasion', ability: 'charisma' as const, desc: 'Persuade a creature that understands you' },
  { skill: 'Animal Handling', ability: 'wisdom' as const, desc: 'Coax a Beast or Monstrosity' }
]

export default function InfluenceModal({ character, onClose, onBroadcastResult }: InfluenceModalProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [result, setResult] = useState<{ roll: number; total: number; modifier: number } | null>(null)

  const char5e = character as Character5e
  const profBonus = Math.ceil(character.level / 4) + 1

  const approach = INFLUENCE_APPROACHES[selectedIndex]

  const getSkillMod = (): number => {
    const abilMod = abilityModifier(character.abilityScores[approach.ability])
    const skill = char5e.skills?.find((s) => s.name === approach.skill)
    const prof = skill?.expertise ? profBonus * 2 : skill?.proficient ? profBonus : 0
    return abilMod + prof
  }

  const modifier = getSkillMod()

  const handleRoll = (): void => {
    const roll = rollSingle(20)
    const total = roll + modifier
    trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: character.name })
    setResult({ roll, total, modifier })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">Influence Action</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Approach selection */}
        <div className="space-y-1.5 mb-4">
          {INFLUENCE_APPROACHES.map((appr, i) => {
            const abilMod = abilityModifier(character.abilityScores[appr.ability])
            const skill = char5e.skills?.find((s) => s.name === appr.skill)
            const prof = skill?.expertise ? profBonus * 2 : skill?.proficient ? profBonus : 0
            const mod = abilMod + prof
            return (
              <button
                key={appr.skill}
                onClick={() => {
                  setSelectedIndex(i)
                  setResult(null)
                }}
                className={`w-full text-left px-3 py-2 border rounded-lg cursor-pointer ${
                  selectedIndex === i
                    ? 'bg-amber-900/30 border-amber-500'
                    : 'bg-gray-800 hover:bg-gray-700 border-gray-700'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-200">{appr.skill}</span>
                  <span className="text-xs text-amber-400 font-mono">{formatMod(mod)}</span>
                </div>
                <div className="text-xs text-gray-400">{appr.desc}</div>
              </button>
            )
          })}
        </div>

        <div className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2 mb-4">
          <div className="font-semibold text-gray-400 mb-1">NPC Willingness (DM determines):</div>
          <div className="text-[10px]">
            <span className="text-green-400">Willing</span> — auto-success &nbsp;|&nbsp;
            <span className="text-yellow-400">Hesitant</span> — check DC 15 or INT score &nbsp;|&nbsp;
            <span className="text-red-400">Unwilling</span> — auto-fail
          </div>
        </div>

        {!result ? (
          <button
            onClick={handleRoll}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            Roll {approach.skill} (d20 {formatMod(modifier)})
          </button>
        ) : (
          <div className="space-y-3">
            <div
              className={`text-center p-4 rounded-lg border ${
                result.roll === 20
                  ? 'border-green-500 bg-green-900/20'
                  : result.roll === 1
                    ? 'border-red-500 bg-red-900/20'
                    : 'border-gray-700 bg-gray-800'
              }`}
            >
              <div className="text-3xl font-bold font-mono mb-1">
                <span
                  className={
                    result.roll === 20 ? 'text-green-400' : result.roll === 1 ? 'text-red-400' : 'text-amber-400'
                  }
                >
                  {result.total}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                d20: {result.roll} {formatMod(result.modifier)}
              </div>
              {result.roll === 20 && <div className="text-sm text-green-400 font-bold mt-1">Natural 20!</div>}
              {result.roll === 1 && <div className="text-sm text-red-400 font-bold mt-1">Natural 1!</div>}
            </div>
            <button
              onClick={() => {
                onBroadcastResult(
                  `${character.name} uses Influence (${approach.skill}): rolled ${result.total} (${result.roll}${formatMod(result.modifier)})`
                )
                onClose()
              }}
              className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
            >
              Done
            </button>
          </div>
        )}

        <div className="text-[10px] text-gray-600 mt-2">
          Failed attempts: wait 24 hours to retry same approach on same NPC.
        </div>
      </div>
    </div>
  )
}
