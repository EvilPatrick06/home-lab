import type { Character } from '../../types/character'
import type { AbilityName, AbilityScoreSet, BuildSlot } from '../../types/character-common'

// 2024 PHB multiclass prerequisites (minimum ability scores)
export const MULTICLASS_PREREQUISITES: Record<
  string,
  { abilities: Partial<Record<AbilityName, number>>; mode: 'all' | 'any' }
> = {
  barbarian: { abilities: { strength: 13 }, mode: 'all' },
  bard: { abilities: { charisma: 13 }, mode: 'all' },
  cleric: { abilities: { wisdom: 13 }, mode: 'all' },
  druid: { abilities: { wisdom: 13 }, mode: 'all' },
  fighter: { abilities: { strength: 13, dexterity: 13 }, mode: 'any' },
  monk: { abilities: { dexterity: 13, wisdom: 13 }, mode: 'all' },
  paladin: { abilities: { strength: 13, charisma: 13 }, mode: 'all' },
  ranger: { abilities: { dexterity: 13, wisdom: 13 }, mode: 'all' },
  rogue: { abilities: { dexterity: 13 }, mode: 'all' },
  sorcerer: { abilities: { charisma: 13 }, mode: 'all' },
  warlock: { abilities: { charisma: 13 }, mode: 'all' },
  wizard: { abilities: { intelligence: 13 }, mode: 'all' }
}

export function checkMulticlassPrerequisites(classId: string, scores: AbilityScoreSet): string | null {
  const prereq = MULTICLASS_PREREQUISITES[classId]
  if (!prereq) return null
  const entries = Object.entries(prereq.abilities) as [AbilityName, number][]
  if (prereq.mode === 'all') {
    const failed = entries.filter(([ability, min]) => scores[ability] < min)
    if (failed.length > 0) {
      return `${classId}: requires ${failed.map(([a, m]) => `${a.charAt(0).toUpperCase() + a.slice(1)} ${m}+`).join(', ')} (have ${failed.map(([a]) => scores[a]).join(', ')})`
    }
  } else {
    // 'any' mode: at least one must meet the threshold
    const anyMet = entries.some(([ability, min]) => scores[ability] >= min)
    if (!anyMet) {
      return `${classId}: requires ${entries.map(([a, m]) => `${a.charAt(0).toUpperCase() + a.slice(1)} ${m}+`).join(' or ')} (have ${entries.map(([a]) => `${scores[a]}`).join(', ')})`
    }
  }
  return null
}

export type HpChoice = 'average' | 'roll'

export interface LevelUpState {
  character: Character | null
  currentLevel: number
  targetLevel: number
  levelUpSlots: BuildSlot[]
  hpChoices: Record<number, HpChoice> // per level
  hpRolls: Record<number, number> // actual rolled values per level
  asiSelections: Record<string, AbilityName[]> // slotId -> [ability1, ability2]
  generalFeatSelections: Record<
    string,
    { id: string; name: string; description: string; choices?: Record<string, string | string[]> }
  > // slotId -> feat
  fightingStyleSelection: { id: string; name: string; description: string } | null
  primalOrderSelection: 'magician' | 'warden' | null
  divineOrderSelection: 'protector' | 'thaumaturge' | null
  elementalFurySelection: 'potent-spellcasting' | 'primal-strike' | null
  newSpellIds: string[]
  epicBoonSelection: { id: string; name: string; description: string } | null
  invocationSelections: string[] // invocation IDs known after level-up
  metamagicSelections: string[] // metamagic IDs known after level-up
  blessedWarriorCantrips: string[] // Blessed Warrior cantrip IDs
  druidicWarriorCantrips: string[] // Druidic Warrior cantrip IDs
  expertiseSelections: Record<string, string[]> // slotId -> chosen skill names
  classLevelChoices: Record<number, string> // charLevel -> classId for multiclass
  spellsRequired: number // set by SpellSelectionSection5e
  loading: boolean

  initLevelUp: (character: Character) => void
  setTargetLevel: (level: number) => void
  setHpChoice: (level: number, choice: HpChoice) => void
  setHpRoll: (level: number, value: number) => void
  setAsiSelection: (slotId: string, abilities: AbilityName[]) => void
  setSlotSelection: (slotId: string, selectedId: string | null, selectedName: string | null) => void
  setNewSpellIds: (ids: string[]) => void
  toggleNewSpell: (id: string) => void
  setEpicBoonSelection: (sel: { id: string; name: string; description: string } | null) => void
  setGeneralFeatSelection: (
    slotId: string,
    feat: { id: string; name: string; description: string; choices?: Record<string, string | string[]> } | null
  ) => void
  setFightingStyleSelection: (sel: { id: string; name: string; description: string } | null) => void
  setBlessedWarriorCantrips: (ids: string[]) => void
  setDruidicWarriorCantrips: (ids: string[]) => void
  setPrimalOrderSelection: (sel: 'magician' | 'warden' | null) => void
  setDivineOrderSelection: (sel: 'protector' | 'thaumaturge' | null) => void
  setElementalFurySelection: (sel: 'potent-spellcasting' | 'primal-strike' | null) => void
  setInvocationSelections: (ids: string[]) => void
  setMetamagicSelections: (ids: string[]) => void
  setExpertiseSelections: (slotId: string, skills: string[]) => void
  setClassLevelChoice: (level: number, classId: string) => void
  setSpellsRequired: (count: number) => void
  getIncompleteChoices: () => string[]
  applyLevelUp: () => Promise<Character>
  reset: () => void
}

export const initialState = {
  character: null,
  currentLevel: 0,
  targetLevel: 0,
  levelUpSlots: [],
  hpChoices: {} as Record<number, HpChoice>,
  hpRolls: {} as Record<number, number>,
  asiSelections: {} as Record<string, AbilityName[]>,
  generalFeatSelections: {} as Record<
    string,
    { id: string; name: string; description: string; choices?: Record<string, string | string[]> }
  >,
  fightingStyleSelection: null as { id: string; name: string; description: string } | null,
  primalOrderSelection: null as 'magician' | 'warden' | null,
  divineOrderSelection: null as 'protector' | 'thaumaturge' | null,
  elementalFurySelection: null as 'potent-spellcasting' | 'primal-strike' | null,
  newSpellIds: [] as string[],
  invocationSelections: [] as string[],
  metamagicSelections: [] as string[],
  epicBoonSelection: null as { id: string; name: string; description: string } | null,
  blessedWarriorCantrips: [] as string[],
  druidicWarriorCantrips: [] as string[],
  expertiseSelections: {} as Record<string, string[]>,
  classLevelChoices: {} as Record<number, string>,
  spellsRequired: 0,
  loading: false
}
