import { type HpChoice, useLevelUpStore } from '../../../stores/use-level-up-store'

type _HpChoice = HpChoice

import type { Character5e } from '../../../types/character-5e'
import { abilityModifier } from '../../../types/character-common'

interface HpRollSection5eProps {
  character: Character5e
  level: number
  hitDieOverride?: number
}

export default function HpRollSection5e({ character, level, hitDieOverride }: HpRollSection5eProps): JSX.Element {
  const hpChoices = useLevelUpStore((s) => s.hpChoices)
  const hpRolls = useLevelUpStore((s) => s.hpRolls)
  const setHpChoice = useLevelUpStore((s) => s.setHpChoice)
  const setHpRoll = useLevelUpStore((s) => s.setHpRoll)

  const choice = hpChoices[level] ?? null
  const rolled = hpRolls[level]

  const hitDie = hitDieOverride ?? character.classes[0]?.hitDie ?? 8
  const conMod = abilityModifier(character.abilityScores.constitution)
  const average = Math.floor(hitDie / 2) + 1
  const averageHP = Math.max(1, average + conMod)

  const doRoll = (): void => {
    const result = Math.floor(Math.random() * hitDie) + 1
    setHpRoll(level, result)
    setHpChoice(level, 'roll')
  }

  const rolledHP = rolled !== undefined ? Math.max(1, rolled + conMod) : null
  const isIncomplete = !choice || (choice === 'roll' && rolled === undefined)

  return (
    <div
      className={`flex items-center gap-3 flex-wrap rounded px-2 py-1 -mx-2 ${isIncomplete ? 'ring-1 ring-amber-600/50' : ''}`}
    >
      <span className="text-sm text-gray-400">HP:</span>
      {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      <button
        onClick={() => setHpChoice(level, 'average')}
        className={`px-3 py-1 text-sm rounded transition-colors ${
          choice === 'average'
            ? 'bg-amber-600 text-white'
            : 'border border-gray-600 text-gray-400 hover:text-amber-400 hover:border-amber-600'
        }`}
      >
        Average: {average}
      </button>
      <button
        onClick={doRoll}
        className={`px-3 py-1 text-sm rounded transition-colors ${
          choice === 'roll'
            ? 'bg-amber-600 text-white'
            : 'border border-gray-600 text-gray-400 hover:text-amber-400 hover:border-amber-600'
        }`}
      >
        Roll d{hitDie}
      </button>
      {choice === 'average' && (
        <span className="text-sm text-green-400">
          +{averageHP} HP ({average} + {conMod >= 0 ? '+' : ''}
          {conMod} CON)
        </span>
      )}
      {choice === 'roll' && rolled !== undefined && (
        <span className="text-sm text-green-400">
          +{rolledHP} HP (rolled {rolled} + {conMod >= 0 ? '+' : ''}
          {conMod} CON)
        </span>
      )}
      {choice === 'roll' && rolled === undefined && <span className="text-sm text-gray-500">Click "Roll" to roll</span>}
    </div>
  )
}
