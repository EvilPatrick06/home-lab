import { useEffect, useMemo, useState } from 'react'
import { meetsPrerequisites } from '../../../services/character/multiclass-advisor'
import { load5eClasses } from '../../../services/data-provider'
import { useLevelUpStore } from '../../../stores/use-level-up-store'
import type { Character5e } from '../../../types/character-5e'
import type { ClassData } from '../../../types/data'
import LevelSection5e from './LevelSection5e'
import { ClassLevelSelector, InvocationSection5e, MetamagicSection5e } from './LevelUpConfirm5e'
import { calculateSummary5e, LevelUpSummaryBar5e } from './LevelUpSummary5e'
import SpellSelectionSection5e from './SpellSelectionSection5e'

interface LevelUpWizard5eProps {
  character: Character5e
  incompleteChoices: string[]
}

export default function LevelUpWizard5e({ character, incompleteChoices }: LevelUpWizard5eProps): JSX.Element {
  const currentLevel = useLevelUpStore((s) => s.currentLevel)
  const targetLevel = useLevelUpStore((s) => s.targetLevel)
  const setTargetLevel = useLevelUpStore((s) => s.setTargetLevel)
  const levelUpSlots = useLevelUpStore((s) => s.levelUpSlots)
  const hpChoices = useLevelUpStore((s) => s.hpChoices)
  const hpRolls = useLevelUpStore((s) => s.hpRolls)
  const asiSelections = useLevelUpStore((s) => s.asiSelections)
  const newSpellIds = useLevelUpStore((s) => s.newSpellIds)
  const classLevelChoices = useLevelUpStore((s) => s.classLevelChoices)
  const setClassLevelChoice = useLevelUpStore((s) => s.setClassLevelChoice)

  const [allClasses, setAllClasses] = useState<ClassData[]>([])

  useEffect(() => {
    load5eClasses()
      .then(setAllClasses)
      .catch(() => setAllClasses([]))
  }, [])

  // Check if the character meets the primary ability prerequisites for their current class
  // (relevant for multiclass validation per 2024 PHB rules)
  const primaryClassPrereqMet = useMemo(() => {
    const primaryClass = allClasses.find((c) => (c.id ?? c.name.toLowerCase()) === character.buildChoices.classId)
    if (!primaryClass) return true
    return meetsPrerequisites(character, primaryClass.coreTraits.primaryAbility.join(' or '))
  }, [character, allClasses])

  // Group slots by level (memoized — only rebuilds when slots or level range changes)
  const slotsByLevel = useMemo(() => {
    const map = new Map<number, typeof levelUpSlots>()
    for (const slot of levelUpSlots) {
      const group = map.get(slot.level) ?? []
      group.push(slot)
      map.set(slot.level, group)
    }
    // Ensure every new level has an entry even without slots
    for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
      if (!map.has(lvl)) map.set(lvl, [])
    }
    return map
  }, [levelUpSlots, currentLevel, targetLevel])

  // Calculate summary
  const summary = calculateSummary5e(
    character,
    currentLevel,
    targetLevel,
    hpChoices,
    hpRolls,
    asiSelections,
    classLevelChoices,
    allClasses
  )

  return (
    <div className="space-y-6">
      {/* Target level selector */}
      <div className="flex items-center gap-4 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <label className="text-sm font-semibold text-gray-300">Target Level:</label>
        <select
          value={targetLevel}
          onChange={(e) => setTargetLevel(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
        >
          {Array.from({ length: 20 - currentLevel }, (_, i) => currentLevel + 1 + i).map((lvl) => (
            <option key={lvl} value={lvl}>
              Level {lvl} {lvl === currentLevel + 1 ? '(+1)' : `(+${lvl - currentLevel})`}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          Level {currentLevel} &rarr; {targetLevel}
        </span>
      </div>

      {/* Multiclass prerequisite warning */}
      {!primaryClassPrereqMet && allClasses.length > 1 && (
        <div className="px-4 py-2 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-xs text-yellow-400">
          Your ability scores do not meet the multiclass prerequisites for your primary class. Multiclassing out may be
          restricted by your DM.
        </div>
      )}

      {/* Per-level sections */}
      {Array.from(slotsByLevel.entries())
        .sort(([a], [b]) => a - b)
        .map(([level, slots]) => {
          const selectedClassId = classLevelChoices[level] ?? character.buildChoices.classId
          const classInfo = allClasses.find((c) => c.id === selectedClassId)

          return (
            <div key={level}>
              {/* Class selector for multiclass */}
              {allClasses.length > 1 && (
                <ClassLevelSelector
                  character={character}
                  level={level}
                  allClasses={allClasses}
                  selectedClassId={selectedClassId}
                  onSelect={(classId) => setClassLevelChoice(level, classId)}
                />
              )}
              <LevelSection5e
                character={character}
                level={level}
                slots={slots}
                classIdForLevel={selectedClassId}
                hitDieForLevel={
                  classInfo ? parseInt(classInfo.coreTraits.hitPointDie.replace(/\D/g, ''), 10) || 8 : undefined
                }
              />
            </div>
          )
        })}

      {/* Spell selection */}
      <SpellSelectionSection5e character={character} targetLevel={targetLevel} />

      {/* Invocation selection (Warlock) */}
      <InvocationSection5e character={character} targetLevel={targetLevel} classLevelChoices={classLevelChoices} />

      {/* Metamagic selection (Sorcerer) */}
      <MetamagicSection5e character={character} targetLevel={targetLevel} classLevelChoices={classLevelChoices} />

      {/* Summary bar */}
      <LevelUpSummaryBar5e
        character={character}
        currentLevel={currentLevel}
        targetLevel={targetLevel}
        summary={summary}
        newSpellCount={newSpellIds.length}
        incompleteChoices={incompleteChoices}
      />
    </div>
  )
}
