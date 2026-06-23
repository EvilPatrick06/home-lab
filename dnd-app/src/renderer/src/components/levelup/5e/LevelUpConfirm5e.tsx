import { useEffect, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { i18n, useT } from '../../../i18n'
import { getEffectiveClasses } from '../../../services/character/effective-character-5e'
import { load5eInvocations, load5eMetamagic } from '../../../services/data-provider'
import { MULTICLASS_SKILL_GRANTS } from '../../../stores/level-up/apply-level-up'
import { useLevelUpStore } from '../../../stores/use-level-up-store'
import type { Character5e } from '../../../types/character-5e'
import type { ClassData, InvocationData, MetamagicData } from '../../../types/data'
import { logger } from '../../../utils/logger'

export function meetsPrerequisites(
  character: Character5e,
  prereqs: string | Record<string, number> | { or: Array<Record<string, number>> } | undefined
): boolean {
  if (!prereqs) return true
  // ClassData stores prerequisites as a descriptive string (e.g. "Strength 13")
  if (typeof prereqs === 'string') {
    // Parse "Ability Score" patterns like "Strength 13" or "Strength 13 or Dexterity 13"
    const parts = prereqs.split(/\s+or\s+/i)
    if (parts.length > 1) {
      return parts.some((part) => meetsPrerequisites(character, part.trim()))
    }
    const match = prereqs.match(/^(\w+)\s+(\d+)$/i)
    if (match) {
      const ability = match[1].toLowerCase()
      const minScore = Number(match[2])
      const score = character.abilityScores[ability as keyof typeof character.abilityScores]
      return score !== undefined && score >= minScore
    }
    return true
  }
  if ('or' in prereqs && Array.isArray(prereqs.or)) {
    return prereqs.or.some((req: Record<string, number>) => meetsPrerequisites(character, req))
  }
  for (const [ability, minScore] of Object.entries(prereqs)) {
    if (ability === 'or') continue
    const score = character.abilityScores[ability as keyof typeof character.abilityScores]
    if (score === undefined || score < (minScore as number)) return false
  }
  return true
}

export function ClassLevelSelector({
  character,
  level: _level,
  allClasses,
  selectedClassId,
  onSelect
}: {
  character: Character5e
  level: number
  allClasses: ClassData[]
  selectedClassId: string
  onSelect: (classId: string) => void
}): JSX.Element {
  const { t } = useT()
  // Current class is always available
  const currentClassIds = new Set(getEffectiveClasses(character).map((c) => c.name.toLowerCase()))
  currentClassIds.add(character.buildChoices.classId)

  // Check prerequisites for new classes
  const eligibleClasses = allClasses.filter((cls) => {
    const cid = cls.id ?? cls.name.toLowerCase()
    if (currentClassIds.has(cid)) return true
    return meetsPrerequisites(character, cls.coreTraits.primaryAbility.join(' or '))
  })

  const isMulticlass = selectedClassId !== character.buildChoices.classId

  return (
    <div
      className={`flex items-center gap-2 mb-1 px-1 py-1 rounded ${isMulticlass ? 'bg-purple-900/20 border border-purple-700/30' : ''}`}
    >
      <span className="text-xs text-gray-500">{t('levelup.classLevelSelector.class')}</span>
      <select
        name="class-level-selector"
        value={selectedClassId}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-surface-2 border border-gray-600 rounded px-2 py-0.5 text-sm text-fg focus:outline-none focus:border-amber-500"
      >
        {eligibleClasses.map((cls) => (
          <option key={cls.id ?? cls.name.toLowerCase()} value={cls.id ?? cls.name.toLowerCase()}>
            {cls.name} ({cls.coreTraits.hitPointDie})
            {!currentClassIds.has(cls.id ?? cls.name.toLowerCase()) ? t('levelup.classLevelSelector.newSuffix') : ''}
          </option>
        ))}
      </select>
      {isMulticlass && <span className="text-xs text-purple-400">{t('levelup.classLevelSelector.multiclass')}</span>}
    </div>
  )
}

// Warlock invocation count by Warlock class level (2024 PHB)
const INVOCATION_COUNT: Record<number, number> = {
  1: 1,
  2: 3,
  3: 3,
  4: 3,
  5: 5,
  6: 5,
  7: 6,
  8: 6,
  9: 7,
  10: 7,
  11: 7,
  12: 8,
  13: 8,
  14: 8,
  15: 9,
  16: 9,
  17: 9,
  18: 10,
  19: 10,
  20: 10
}

function getWarlockClassLevel(
  character: Character5e,
  targetLevel: number,
  classLevelChoices: Record<number, string>
): number {
  const existingWarlockLevel =
    getEffectiveClasses(character).find((c) => c.name.toLowerCase() === 'warlock')?.level ?? 0
  let newWarlockLevels = 0
  for (let lvl = character.level + 1; lvl <= targetLevel; lvl++) {
    if ((classLevelChoices[lvl] ?? character.buildChoices.classId) === 'warlock') {
      newWarlockLevels++
    }
  }
  return existingWarlockLevel + newWarlockLevels
}

export function InvocationSection5e({
  character,
  targetLevel,
  classLevelChoices
}: {
  character: Character5e
  targetLevel: number
  classLevelChoices: Record<number, string>
}): JSX.Element | null {
  const { t } = useT()
  const invocationSelections = useLevelUpStore((s) => s.invocationSelections)
  const setInvocationSelections = useLevelUpStore((s) => s.setInvocationSelections)
  const [allInvocations, setAllInvocations] = useState<InvocationData[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    load5eInvocations()
      .then(setAllInvocations)
      .catch((err) => {
        logger.error('Failed to load invocations', err)
        addToast(i18n.t('levelup.invocationSection.loadFailed'), 'error')
        setAllInvocations([])
      })
  }, [])

  const warlockLevel = getWarlockClassLevel(character, targetLevel, classLevelChoices)
  if (warlockLevel === 0) return null

  const maxInvocations = INVOCATION_COUNT[warlockLevel] ?? 0
  if (maxInvocations === 0) return null

  // Count how many times each invocation is selected (for repeatable)
  const selectionCounts = new Map<string, number>()
  for (const id of invocationSelections) {
    selectionCounts.set(id, (selectionCounts.get(id) ?? 0) + 1)
  }

  const atMax = invocationSelections.length >= maxInvocations

  // Filter by level requirement and prerequisites
  const eligible = allInvocations.filter((inv) => {
    if (inv.levelRequirement > warlockLevel) return false
    if (inv.prerequisites?.invocation && !invocationSelections.includes(inv.prerequisites.invocation)) return false
    if (search && !inv.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const addInvocation = (id: string): void => {
    if (!atMax) setInvocationSelections([...invocationSelections, id])
  }

  const removeOneInvocation = (id: string): void => {
    // Remove dependents that require this invocation (if removing last instance)
    const count = selectionCounts.get(id) ?? 0
    let result = [...invocationSelections]
    if (count <= 1) {
      const dependents = new Set(
        allInvocations.filter((inv) => inv.prerequisites?.invocation === id).map((inv) => inv.id)
      )
      result = result.filter((s) => !dependents.has(s))
    }
    // Remove one instance (last occurrence)
    const lastIdx = result.lastIndexOf(id)
    if (lastIdx !== -1) result.splice(lastIdx, 1)
    setInvocationSelections(result)
  }

  const handleClick = (inv: InvocationData): void => {
    const count = selectionCounts.get(inv.id) ?? 0
    if (count === 0) {
      addInvocation(inv.id)
    } else if (inv.repeatable) {
      // Repeatable and already selected: add another if room
      if (!atMax) addInvocation(inv.id)
    } else {
      // Non-repeatable: toggle off
      removeOneInvocation(inv.id)
    }
  }

  const getPrereqLabel = (inv: InvocationData): string | null => {
    if (!inv.prerequisites) return null
    if (inv.prerequisites.cantrip) return inv.prerequisites.cantrip
    if (inv.prerequisites.invocation) return inv.prerequisites.invocation
    if (inv.prerequisites.requiresDamageCantrip) return t('levelup.invocationSection.damageCantrip')
    if (inv.prerequisites.requiresAttackRollCantrip) return t('levelup.invocationSection.attackRollCantrip')
    return null
  }

  const isIncomplete = invocationSelections.length < maxInvocations

  return (
    <div className={`bg-surface/50 border rounded-lg p-4 ${isIncomplete ? 'border-amber-600/50' : 'border-gray-800'}`}>
      <h3 className="text-lg font-bold text-purple-400 mb-1 flex items-center gap-2">
        {t('levelup.invocationSection.heading')}
        {isIncomplete && (
          <span className="text-xs text-accent-strong font-semibold uppercase">
            {t('levelup.invocationSection.required')}
          </span>
        )}
      </h3>
      <p className={`text-xs mb-3 ${isIncomplete ? 'text-accent' : 'text-gray-500'}`}>
        {t('levelup.invocationSection.known', {
          level: warlockLevel,
          selected: invocationSelections.length,
          max: maxInvocations
        })}
      </p>
      <input
        aria-label={t('levelup.invocationSection.searchPlaceholder')}
        type="text"
        name="invocation-search"
        placeholder={t('levelup.invocationSection.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-1 text-sm bg-surface-2 border border-border rounded text-gray-200 placeholder-gray-500 mb-3"
      />
      <div className="max-h-64 overflow-y-auto space-y-1">
        {eligible.map((inv) => {
          const count = selectionCounts.get(inv.id) ?? 0
          const selected = count > 0
          const disabled = !selected && atMax

          return (
            <button
              key={inv.id}
              onClick={() => !disabled && handleClick(inv)}
              disabled={disabled}
              className={`w-full text-left p-2 rounded border transition-colors ${
                selected
                  ? 'bg-purple-900/30 border-purple-600 text-purple-300'
                  : disabled
                    ? 'border-border/50 text-gray-600 cursor-not-allowed'
                    : 'border-border hover:border-purple-600 text-gray-300 hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold">
                  {inv.name}
                  {inv.isPactBoon && (
                    <span className="text-xs text-accent ml-1">{t('levelup.invocationSection.pactBoon')}</span>
                  )}
                  {inv.repeatable && (
                    <span className="text-xs text-cyan-400 ml-1">{t('levelup.invocationSection.repeatable')}</span>
                  )}
                  {count > 1 && (
                    <span className="text-xs text-purple-300 ml-1">
                      {t('levelup.invocationSection.count', { n: count })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  {selected && inv.repeatable && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeOneInvocation(inv.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          removeOneInvocation(inv.id)
                        }
                      }}
                      className="text-xs text-muted hover:text-red-400 px-1 cursor-pointer"
                      title={t('levelup.invocationSection.removeOne')}
                    >
                      &minus;
                    </span>
                  )}
                  {inv.levelRequirement > 0 && (
                    <span className="text-xs text-gray-500">
                      {t('levelup.invocationSection.levelRequirement', { level: inv.levelRequirement })}
                    </span>
                  )}
                </div>
              </div>
              {inv.prerequisites && (
                <p className="text-xs text-yellow-500 mt-0.5">
                  {t('levelup.invocationSection.requires', { label: getPrereqLabel(inv) })}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{inv.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Sorcerer metamagic count by Sorcerer class level (2024 PHB): 2 at Lv2, 4 at Lv10, 6 at Lv17
function getMetamagicCount(sorcererLevel: number): number {
  if (sorcererLevel >= 17) return 6
  if (sorcererLevel >= 10) return 4
  if (sorcererLevel >= 2) return 2
  return 0
}

function getSorcererClassLevel(
  character: Character5e,
  targetLevel: number,
  classLevelChoices: Record<number, string>
): number {
  const existingSorcererLevel =
    getEffectiveClasses(character).find((c) => c.name.toLowerCase() === 'sorcerer')?.level ?? 0
  let newSorcererLevels = 0
  for (let lvl = character.level + 1; lvl <= targetLevel; lvl++) {
    if ((classLevelChoices[lvl] ?? character.buildChoices.classId) === 'sorcerer') {
      newSorcererLevels++
    }
  }
  return existingSorcererLevel + newSorcererLevels
}

export function MetamagicSection5e({
  character,
  targetLevel,
  classLevelChoices
}: {
  character: Character5e
  targetLevel: number
  classLevelChoices: Record<number, string>
}): JSX.Element | null {
  const { t } = useT()
  const metamagicSelections = useLevelUpStore((s) => s.metamagicSelections)
  const setMetamagicSelections = useLevelUpStore((s) => s.setMetamagicSelections)
  const [allMetamagic, setAllMetamagic] = useState<MetamagicData[]>([])

  useEffect(() => {
    load5eMetamagic()
      .then(setAllMetamagic)
      .catch((err) => {
        logger.error('Failed to load metamagic', err)
        addToast(i18n.t('levelup.metamagicSection.loadFailed'), 'error')
        setAllMetamagic([])
      })
  }, [])

  const sorcererLevel = getSorcererClassLevel(character, targetLevel, classLevelChoices)
  if (sorcererLevel < 2) return null

  const maxOptions = getMetamagicCount(sorcererLevel)

  const toggleMetamagic = (id: string): void => {
    if (metamagicSelections.includes(id)) {
      setMetamagicSelections(metamagicSelections.filter((s) => s !== id))
    } else if (metamagicSelections.length < maxOptions) {
      setMetamagicSelections([...metamagicSelections, id])
    }
  }

  const isIncomplete = metamagicSelections.length < maxOptions

  return (
    <div className={`bg-surface/50 border rounded-lg p-4 ${isIncomplete ? 'border-amber-600/50' : 'border-gray-800'}`}>
      <h3 className="text-lg font-bold text-red-400 mb-1 flex items-center gap-2">
        {t('levelup.metamagicSection.heading')}
        {isIncomplete && (
          <span className="text-xs text-accent-strong font-semibold uppercase">
            {t('levelup.metamagicSection.required')}
          </span>
        )}
      </h3>
      <p className={`text-xs mb-3 ${isIncomplete ? 'text-accent' : 'text-gray-500'}`}>
        {t('levelup.metamagicSection.known', {
          level: sorcererLevel,
          selected: metamagicSelections.length,
          max: maxOptions
        })}
      </p>
      <div className="space-y-1">
        {allMetamagic.map((mm) => {
          const selected = metamagicSelections.includes(mm.id)
          const atMax = !selected && metamagicSelections.length >= maxOptions

          return (
            <button
              key={mm.id}
              onClick={() => !atMax && toggleMetamagic(mm.id)}
              disabled={atMax}
              className={`w-full text-left p-2 rounded border transition-colors ${
                selected
                  ? 'bg-red-900/30 border-red-600 text-red-300'
                  : atMax
                    ? 'border-border/50 text-gray-600 cursor-not-allowed'
                    : 'border-border hover:border-red-600 text-gray-300 hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{mm.name}</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {t('levelup.metamagicSection.sorceryPointCost', { cost: mm.sorceryPointCost })}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mm.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Phase 24e — multiclass skill proficiencies. When a level is assigned to a new
 * class that grants a skill on entry (Bard/Ranger/Rogue, 2024 PHB), render a
 * constrained skill picker. Picks are stored in `multiclassSkillSelections`.
 */
export function MulticlassSkillSection5e({
  character,
  targetLevel,
  classLevelChoices
}: {
  character: Character5e
  targetLevel: number
  classLevelChoices: Record<number, string>
}): JSX.Element | null {
  const { t } = useT()
  const multiclassSkillSelections = useLevelUpStore((s) => s.multiclassSkillSelections)
  const setMulticlassSkillSelection = useLevelUpStore((s) => s.setMulticlassSkillSelection)

  const existingClassIds = new Set(getEffectiveClasses(character).map((c) => c.name.toLowerCase()))
  const allSkillNames = character.skills.map((s) => s.name)

  // Newly entered classes (not already in the character) that grant skills.
  const newGrantClasses = new Set<string>()
  for (let lvl = character.level + 1; lvl <= targetLevel; lvl++) {
    const cid = classLevelChoices[lvl]
    if (!cid || cid === character.buildChoices.classId) continue
    if (existingClassIds.has(cid)) continue
    if (MULTICLASS_SKILL_GRANTS[cid]) newGrantClasses.add(cid)
  }

  if (newGrantClasses.size === 0) return null

  return (
    <div className="bg-surface/50 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-3">
        {t('levelup.multiclassSkillSection.heading')}
      </h3>
      {Array.from(newGrantClasses).map((cid) => {
        const grant = MULTICLASS_SKILL_GRANTS[cid]
        const options = grant.options[0] === '__any__' ? allSkillNames : grant.options
        const chosen = multiclassSkillSelections[cid] ?? []
        const atMax = chosen.length >= grant.count
        const incomplete = chosen.length < grant.count
        return (
          <div key={cid} className="mb-2">
            <div className={`text-xs mb-1 ${incomplete ? 'text-accent' : 'text-gray-500'}`}>
              {t('levelup.multiclassSkillSection.chooseSkills', {
                className: cid.charAt(0).toUpperCase() + cid.slice(1),
                count: grant.count,
                chosen: chosen.length
              })}
              {incomplete && <span className="ml-2 font-semibold">{t('levelup.multiclassSkillSection.required')}</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {options.map((skill) => {
                const selected = chosen.includes(skill)
                return (
                  <button
                    key={skill}
                    onClick={() => {
                      if (selected) {
                        setMulticlassSkillSelection(
                          cid,
                          chosen.filter((s) => s !== skill)
                        )
                      } else if (!atMax) {
                        setMulticlassSkillSelection(cid, [...chosen, skill])
                      }
                    }}
                    disabled={!selected && atMax}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      selected
                        ? 'bg-amber-600 border-amber-500 text-white'
                        : atMax
                          ? 'border-border/50 text-gray-600 cursor-not-allowed'
                          : 'border-border text-gray-300 hover:border-amber-600 cursor-pointer'
                    }`}
                  >
                    {skill}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
