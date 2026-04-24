import type { BuildSlot } from '../../types/character-common'
import type {
  ClassArmorTraining,
  ClassFeature,
  ClassProficiencies,
  ClassSkillProficiencies,
  ClassWeaponProficiency,
  FeatureGrantedSpell,
  FeatureSavingThrow,
  FeatureUsesPerRest
} from '../../types/data/character-data-types'

// Re-export class/feature data types for consumers that access them through build-tree
export type {
  ClassProficiencies,
  ClassArmorTraining,
  ClassWeaponProficiency,
  ClassSkillProficiencies,
  FeatureUsesPerRest,
  FeatureSavingThrow,
  FeatureGrantedSpell,
  ClassFeature
}

// 2024 PHB: All classes get subclass at level 3
const SUBCLASS_LEVEL = 3

// 2024 PHB: Fighting Style class levels
// Fighter: level 1, Paladin: level 2, Ranger: level 2
function getFightingStyleLevel(classId?: string): number | null {
  if (classId === 'fighter') return 1
  if (classId === 'paladin') return 2
  if (classId === 'ranger') return 2
  return null
}

// 2024 PHB: Primal Order is Druid-only at level 1
function getPrimalOrderLevel(classId?: string): number | null {
  if (classId === 'druid') return 1
  return null
}

// 2024 PHB: Divine Order is Cleric-only at level 1
function getDivineOrderLevel(classId?: string): number | null {
  if (classId === 'cleric') return 1
  return null
}

// 2024 PHB: Expertise grants per class
// Each entry: classLevel at which expertise is gained, count of skills, optional restricted list
export interface ExpertiseGrant {
  classLevel: number
  count: number
  restrictedSkills?: string[]
  includeThievesTools?: boolean
}

export function getExpertiseGrants(classId?: string): ExpertiseGrant[] {
  if (classId === 'rogue') {
    return [
      { classLevel: 1, count: 2, includeThievesTools: true },
      { classLevel: 6, count: 2, includeThievesTools: true }
    ]
  }
  if (classId === 'bard') {
    return [
      { classLevel: 2, count: 2 },
      { classLevel: 9, count: 2 }
    ]
  }
  if (classId === 'ranger') {
    return [
      { classLevel: 2, count: 1 },
      { classLevel: 9, count: 2 }
    ]
  }
  if (classId === 'wizard') {
    return [
      {
        classLevel: 2,
        count: 1,
        restrictedSkills: ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Religion']
      }
    ]
  }
  return []
}

// 2024 PHB: Base ASI at levels 4, 8, 12, 16 (all classes)
// Fighter gets extra ASI at 6 and 14
// Rogue gets extra ASI at 10
// Level 19: Epic Boon feat (all classes)
function getAsiLevels(classId?: string): number[] {
  const base = [4, 8, 12, 16]
  if (classId === 'fighter') {
    return [...base, 6, 14].sort((a, b) => a - b)
  }
  if (classId === 'rogue') {
    return [...base, 10].sort((a, b) => a - b)
  }
  return base
}

export function generate5eBuildSlots(targetLevel: number, classId?: string): BuildSlot[] {
  const slots: BuildSlot[] = [
    {
      id: 'class',
      label: 'Class',
      category: 'class',
      level: 0,
      selectedId: null,
      selectedName: null,
      required: true
    },
    {
      id: 'background',
      label: 'Background',
      category: 'background',
      level: 0,
      selectedId: null,
      selectedName: null,
      required: true
    },
    {
      id: 'ancestry',
      label: 'Species',
      category: 'ancestry',
      level: 0,
      selectedId: null,
      selectedName: null,
      required: true
    },
    {
      id: 'ability-scores',
      label: 'Ability Scores',
      category: 'ability-scores',
      level: 0,
      selectedId: null,
      selectedName: null,
      required: true
    },
    {
      id: 'skill-choices',
      label: 'Skill Proficiencies',
      category: 'skill-choice',
      level: 0,
      selectedId: null,
      selectedName: null,
      required: true
    }
  ]

  const asiLevels = getAsiLevels(classId)
  const fightingStyleLevel = getFightingStyleLevel(classId)
  const primalOrderLevel = getPrimalOrderLevel(classId)
  const divineOrderLevel = getDivineOrderLevel(classId)
  const expertiseGrants = getExpertiseGrants(classId)

  // Add level-based slots
  for (let lvl = 1; lvl <= targetLevel; lvl++) {
    // Primal Order at level 1 for Druid
    if (primalOrderLevel !== null && lvl === primalOrderLevel) {
      slots.push({
        id: `level${lvl}-primal-order`,
        label: 'Primal Order',
        category: 'primal-order',
        level: lvl,
        selectedId: null,
        selectedName: null,
        required: true
      })
    }

    // Divine Order at level 1 for Cleric
    if (divineOrderLevel !== null && lvl === divineOrderLevel) {
      slots.push({
        id: `level${lvl}-divine-order`,
        label: 'Divine Order',
        category: 'divine-order',
        level: lvl,
        selectedId: null,
        selectedName: null,
        required: true
      })
    }

    // Fighting Style at class-specific level
    if (fightingStyleLevel !== null && lvl === fightingStyleLevel) {
      slots.push({
        id: `level${lvl}-fighting-style`,
        label: 'Fighting Style',
        category: 'fighting-style',
        level: lvl,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // ASI at class-specific levels
    if (asiLevels.includes(lvl)) {
      slots.push({
        id: `level${lvl}-asi`,
        label: 'Ability Score Improvement',
        category: 'ability-boost',
        level: lvl,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // Epic Boon at level 19 (all classes)
    if (lvl === 19) {
      slots.push({
        id: 'level19-epic-boon',
        label: 'Epic Boon',
        category: 'epic-boon',
        level: 19,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // Subclass at level 3 (2024 PHB: all classes)
    if (lvl === SUBCLASS_LEVEL) {
      slots.push({
        id: `level${lvl}-subclass`,
        label: 'Subclass',
        category: 'class-feat',
        level: lvl,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // Expertise at class-specific levels
    for (const grant of expertiseGrants) {
      if (lvl === grant.classLevel) {
        slots.push({
          id: `level${lvl}-expertise`,
          label: grant.restrictedSkills ? 'Scholar' : 'Expertise',
          category: 'expertise',
          level: lvl,
          selectedId: null,
          selectedName: null,
          required: false
        })
      }
    }
  }

  return slots
}

/**
 * Generates level-up slots: the delta between currentLevel and targetLevel.
 * Returns only the new slots that appear between currentLevel+1..targetLevel.
 *
 * For multiclass, pass classLevelChoices (charLevel → classId) and
 * existingClassLevels (classId → current class level) to generate
 * correct ASI/subclass slots per class level.
 */
export function generate5eLevelUpSlots(
  currentLevel: number,
  targetLevel: number,
  classId?: string,
  classLevelChoices?: Record<number, string>,
  existingClassLevels?: Record<string, number>
): BuildSlot[] {
  // If no multiclass info, use existing single-class logic
  if (!classLevelChoices || Object.keys(classLevelChoices).length === 0) {
    const fullSlots = generate5eBuildSlots(targetLevel, classId)
    const currentSlots = generate5eBuildSlots(currentLevel, classId)
    const currentSlotIds = new Set(currentSlots.map((s) => s.id))
    return fullSlots.filter((s) => s.level > 0 && !currentSlotIds.has(s.id))
  }

  // Multiclass: generate slots based on per-level class choices
  const slots: BuildSlot[] = []
  const classLvls: Record<string, number> = { ...existingClassLevels }

  for (let charLvl = currentLevel + 1; charLvl <= targetLevel; charLvl++) {
    const levelClassId = classLevelChoices[charLvl] ?? classId ?? ''
    classLvls[levelClassId] = (classLvls[levelClassId] ?? 0) + 1
    const classLevel = classLvls[levelClassId]

    // Primal Order at class level 1 for Druid (multiclass into druid)
    const poLevel = getPrimalOrderLevel(levelClassId)
    if (poLevel !== null && classLevel === poLevel) {
      slots.push({
        id: `level${charLvl}-primal-order-${levelClassId}`,
        label: 'Primal Order',
        category: 'primal-order',
        level: charLvl,
        selectedId: null,
        selectedName: null,
        required: true
      })
    }

    // Divine Order at class level 1 for Cleric (multiclass into cleric)
    const doLevel = getDivineOrderLevel(levelClassId)
    if (doLevel !== null && classLevel === doLevel) {
      slots.push({
        id: `level${charLvl}-divine-order-${levelClassId}`,
        label: 'Divine Order',
        category: 'divine-order',
        level: charLvl,
        selectedId: null,
        selectedName: null,
        required: true
      })
    }

    // Fighting Style at class-specific level (for multiclass into fighter/paladin/ranger)
    const fsLevel = getFightingStyleLevel(levelClassId)
    if (fsLevel !== null && classLevel === fsLevel) {
      slots.push({
        id: `level${charLvl}-fighting-style-${levelClassId}`,
        label: 'Fighting Style',
        category: 'fighting-style',
        level: charLvl,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // ASI at class-specific levels
    const asiLevels = getAsiLevels(levelClassId)
    if (asiLevels.includes(classLevel)) {
      slots.push({
        id: `level${charLvl}-asi`,
        label: 'Ability Score Improvement',
        category: 'ability-boost',
        level: charLvl,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // Epic Boon at character level 19
    if (charLvl === 19) {
      slots.push({
        id: 'level19-epic-boon',
        label: 'Epic Boon',
        category: 'epic-boon',
        level: 19,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // Subclass at class level 3
    if (classLevel === SUBCLASS_LEVEL) {
      slots.push({
        id: `level${charLvl}-subclass-${levelClassId}`,
        label: 'Subclass',
        category: 'class-feat',
        level: charLvl,
        selectedId: null,
        selectedName: null,
        required: false
      })
    }

    // Expertise at class-specific levels
    const expertiseGrants = getExpertiseGrants(levelClassId)
    for (const grant of expertiseGrants) {
      if (classLevel === grant.classLevel) {
        slots.push({
          id: `level${charLvl}-expertise-${levelClassId}`,
          label: grant.restrictedSkills ? 'Scholar' : 'Expertise',
          category: 'expertise',
          level: charLvl,
          selectedId: null,
          selectedName: null,
          required: false
        })
      }
    }
  }

  return slots
}
