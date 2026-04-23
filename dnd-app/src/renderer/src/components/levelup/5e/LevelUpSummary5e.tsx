import type { Character5e } from '../../../types/character-5e'
import { abilityModifier } from '../../../types/character-common'
import type { ClassData } from '../../../types/data'

interface LevelUpSummaryData {
  newMaxHP: number
  asiChanges: string[]
}

export function calculateSummary5e(
  character: Character5e,
  currentLevel: number,
  targetLevel: number,
  hpChoices: Record<number, string>,
  hpRolls: Record<number, number>,
  asiSelections: Record<string, string[]>,
  classLevelChoices: Record<number, string>,
  allClasses: ClassData[]
): LevelUpSummaryData {
  const conMod = abilityModifier(character.abilityScores.constitution)

  // Calculate new CON mod after ASIs
  let conIncrease = 0
  for (const abilities of Object.values(asiSelections)) {
    for (const ab of abilities) {
      if (ab === 'constitution') conIncrease++
    }
  }
  const newConScore = Math.min(20, character.abilityScores.constitution + conIncrease)
  const newConMod = abilityModifier(newConScore)

  let hpGain = 0
  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    const levelClassId = classLevelChoices[lvl] ?? character.buildChoices.classId
    const classInfo = allClasses.find((c) => c.id === levelClassId)
    const hitDie =
      (classInfo ? parseInt(classInfo.coreTraits.hitPointDie.replace(/\D/g, ''), 10) : null) ||
      (character.classes[0]?.hitDie ?? 8)

    let dieResult: number
    if (hpChoices[lvl] === 'roll' && hpRolls[lvl] !== undefined) {
      dieResult = hpRolls[lvl]
    } else {
      dieResult = Math.floor(hitDie / 2) + 1
    }
    hpGain += Math.max(1, dieResult + newConMod)
  }

  const retroactive = (newConMod - conMod) * currentLevel
  const newMaxHP = character.hitPoints.maximum + hpGain + retroactive

  const asiChanges: string[] = []
  const abCounts: Record<string, number> = {}
  for (const abilities of Object.values(asiSelections)) {
    for (const ab of abilities) {
      abCounts[ab] = (abCounts[ab] ?? 0) + 1
    }
  }
  for (const [ab, count] of Object.entries(abCounts)) {
    asiChanges.push(`+${count} ${ab.slice(0, 3).toUpperCase()}`)
  }

  return { newMaxHP, asiChanges }
}

export function LevelUpSummaryBar5e({
  character,
  currentLevel,
  targetLevel,
  summary,
  newSpellCount,
  incompleteChoices
}: {
  character: Character5e
  currentLevel: number
  targetLevel: number
  summary: LevelUpSummaryData
  newSpellCount: number
  incompleteChoices: string[]
}): JSX.Element {
  return (
    <div
      className={`bg-gray-900 border rounded-lg p-4 sticky bottom-0 ${incompleteChoices.length > 0 ? 'border-amber-600/50' : 'border-gray-700'}`}
    >
      <div className="flex items-center gap-6 flex-wrap text-sm">
        <span className="text-gray-400">
          Level <span className="text-amber-400 font-bold">{currentLevel}</span> &rarr;{' '}
          <span className="text-amber-400 font-bold">{targetLevel}</span>
        </span>
        <span className="text-gray-400">
          HP:{' '}
          <span className="text-green-400 font-bold">
            {character.hitPoints.maximum} &rarr; {summary.newMaxHP}
          </span>
        </span>
        {summary.asiChanges.length > 0 && (
          <span className="text-gray-400">
            {summary.asiChanges.map((c, i) => (
              <span key={i} className="text-purple-400">
                {i > 0 ? ', ' : ''}
                {c}
              </span>
            ))}
          </span>
        )}
        {newSpellCount > 0 && (
          <span className="text-gray-400">
            +<span className="text-blue-400 font-bold">{newSpellCount}</span> spell
            {newSpellCount !== 1 ? 's' : ''}
          </span>
        )}
        {incompleteChoices.length > 0 && (
          <span className="text-amber-400 font-semibold ml-auto">
            {incompleteChoices.length} choice{incompleteChoices.length !== 1 ? 's' : ''} remaining
          </span>
        )}
      </div>
    </div>
  )
}
