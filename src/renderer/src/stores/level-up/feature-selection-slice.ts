import { getExpertiseGrants } from '../../services/character/build-tree-5e'
import { is5eCharacter } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import type { AbilityName } from '../../types/character-common'
import { checkMulticlassPrerequisites, type LevelUpState } from './types'

type SetState = (partial: Partial<LevelUpState> | ((state: LevelUpState) => Partial<LevelUpState>)) => void
type GetState = () => LevelUpState

export function createFeatureSelectionSlice(set: SetState, get: GetState) {
  return {
    setAsiSelection: (slotId: string, abilities: AbilityName[]) => {
      set((s) => ({ asiSelections: { ...s.asiSelections, [slotId]: abilities } }))
    },

    setSlotSelection: (slotId: string, selectedId: string | null, selectedName: string | null) => {
      set((s) => ({
        levelUpSlots: s.levelUpSlots.map((slot) => (slot.id === slotId ? { ...slot, selectedId, selectedName } : slot))
      }))
    },

    setEpicBoonSelection: (sel: { id: string; name: string; description: string } | null) =>
      set({ epicBoonSelection: sel }),

    setGeneralFeatSelection: (
      slotId: string,
      feat: {
        id: string
        name: string
        description: string
        choices?: Record<string, string | string[]>
      } | null
    ) => {
      if (feat) {
        set((s) => ({
          generalFeatSelections: { ...s.generalFeatSelections, [slotId]: feat },
          // Clear ASI for this slot when choosing a feat instead
          asiSelections: (() => {
            const { [slotId]: _, ...rest } = s.asiSelections
            return rest
          })()
        }))
      } else {
        set((s) => {
          const { [slotId]: _, ...rest } = s.generalFeatSelections
          return { generalFeatSelections: rest }
        })
      }
    },

    setFightingStyleSelection: (sel: { id: string; name: string; description: string } | null) =>
      set({ fightingStyleSelection: sel }),
    setPrimalOrderSelection: (sel: 'magician' | 'warden' | null) => set({ primalOrderSelection: sel }),
    setDivineOrderSelection: (sel: 'protector' | 'thaumaturge' | null) => set({ divineOrderSelection: sel }),
    setElementalFurySelection: (sel: 'potent-spellcasting' | 'primal-strike' | null) =>
      set({ elementalFurySelection: sel }),
    setExpertiseSelections: (slotId: string, skills: string[]) => {
      set((s) => ({ expertiseSelections: { ...s.expertiseSelections, [slotId]: skills } }))
    },

    getIncompleteChoices: (): string[] => {
      const {
        character,
        currentLevel,
        targetLevel,
        hpChoices,
        hpRolls,
        levelUpSlots,
        asiSelections,
        generalFeatSelections,
        epicBoonSelection,
        fightingStyleSelection,
        blessedWarriorCantrips,
        druidicWarriorCantrips,
        primalOrderSelection,
        divineOrderSelection,
        elementalFurySelection,
        expertiseSelections,
        invocationSelections,
        metamagicSelections,
        newSpellIds,
        spellsRequired,
        classLevelChoices
      } = get()
      if (!character || !is5eCharacter(character)) return []

      const incomplete: string[] = []

      // HP per level
      for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
        const choice = hpChoices[lvl]
        if (!choice) {
          incomplete.push(`Level ${lvl}: HP method`)
        } else if (choice === 'roll' && hpRolls[lvl] === undefined) {
          incomplete.push(`Level ${lvl}: Roll HP`)
        }
      }

      // Multiclass prerequisites (2024 PHB)
      const primaryClassId = character.buildChoices.classId
      const multiclassClasses = new Set<string>()
      for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
        const chosenClass = classLevelChoices[lvl]
        if (chosenClass && chosenClass !== primaryClassId) {
          multiclassClasses.add(chosenClass)
        }
      }
      if (multiclassClasses.size > 0) {
        // Must meet prereqs for current class AND each new class
        const currentClassCheck = checkMulticlassPrerequisites(primaryClassId, character.abilityScores)
        if (currentClassCheck) {
          incomplete.push(`Multiclass blocked — current class ${currentClassCheck}`)
        }
        for (const newClass of multiclassClasses) {
          const newClassCheck = checkMulticlassPrerequisites(newClass, character.abilityScores)
          if (newClassCheck) {
            incomplete.push(`Multiclass blocked — new class ${newClassCheck}`)
          }
        }
      }

      // ASI / General Feat at ASI levels
      const asiSlots = levelUpSlots.filter((s) => s.category === 'ability-boost')
      for (const slot of asiSlots) {
        const asi = asiSelections[slot.id]
        const feat = generalFeatSelections[slot.id]
        const hasAsi = asi && asi.length > 0
        if (!hasAsi && !feat) {
          incomplete.push(`Level ${slot.level}: Ability Score Improvement or Feat`)
        }
      }

      // Epic Boon
      if (levelUpSlots.some((s) => s.category === 'epic-boon') && !epicBoonSelection) {
        incomplete.push('Epic Boon')
      }

      // Fighting Style
      if (levelUpSlots.some((s) => s.category === 'fighting-style') && !fightingStyleSelection) {
        incomplete.push('Fighting Style')
      }

      // Blessed Warrior cantrips
      if (fightingStyleSelection?.id === 'fighting-style-blessed-warrior' && blessedWarriorCantrips.length < 2) {
        incomplete.push(`Blessed Warrior cantrips (${blessedWarriorCantrips.length}/2)`)
      }

      // Druidic Warrior cantrips
      if (fightingStyleSelection?.id === 'druidic-warrior' && druidicWarriorCantrips.length < 2) {
        incomplete.push(`Druidic Warrior cantrips (${druidicWarriorCantrips.length}/2)`)
      }

      // Primal Order
      if (levelUpSlots.some((s) => s.category === 'primal-order') && !primalOrderSelection) {
        incomplete.push('Primal Order')
      }

      // Divine Order
      if (levelUpSlots.some((s) => s.category === 'divine-order') && !divineOrderSelection) {
        incomplete.push('Divine Order')
      }

      // Elemental Fury (Druid level 7)
      const hasFurySlot = (() => {
        for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
          const effectiveClassId = classLevelChoices[lvl] ?? character.buildChoices.classId
          if (effectiveClassId !== 'druid') continue
          const existingDruidLevel = character.classes.find((c) => c.name.toLowerCase() === 'druid')?.level ?? 0
          const levelsGained = (() => {
            let count = 0
            for (let l = currentLevel + 1; l <= lvl; l++) {
              if ((classLevelChoices[l] ?? character.buildChoices.classId) === 'druid') count++
            }
            return count
          })()
          if (existingDruidLevel + levelsGained === 7) return true
        }
        return false
      })()
      if (hasFurySlot && !elementalFurySelection) {
        incomplete.push('Elemental Fury')
      }

      // Expertise
      const expertiseSlots = levelUpSlots.filter((s) => s.category === 'expertise')
      for (const slot of expertiseSlots) {
        const effectiveClassId = (() => {
          for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
            if (slot.id.includes(`level${lvl}`)) {
              return classLevelChoices[lvl] ?? character.buildChoices.classId
            }
          }
          return character.buildChoices.classId
        })()
        const grants = getExpertiseGrants(effectiveClassId)
        const grant = grants[0]
        if (grant) {
          const selected = expertiseSelections[slot.id] ?? []
          if (selected.length < grant.count) {
            incomplete.push(`Level ${slot.level}: Expertise (${selected.length}/${grant.count})`)
          }
        }
      }

      // Subclass (slots with category 'class-feat' and label 'Subclass')
      const subclassSlots = levelUpSlots.filter((s) => s.category === 'class-feat' && s.label === 'Subclass')
      for (const slot of subclassSlots) {
        if (!slot.selectedId) {
          incomplete.push(`Level ${slot.level}: Subclass`)
        }
      }

      // Spells (only when spellsRequired > 0)
      if (spellsRequired > 0 && newSpellIds.length < spellsRequired) {
        incomplete.push(`Spells (${newSpellIds.length}/${spellsRequired})`)
      }

      // Invocations (Warlock)
      const warlockLevel = (() => {
        const existing = character.classes.find((c) => c.name.toLowerCase() === 'warlock')?.level ?? 0
        let gained = 0
        for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
          if ((classLevelChoices[lvl] ?? character.buildChoices.classId) === 'warlock') gained++
        }
        return existing + gained
      })()
      if (warlockLevel > 0) {
        const INVOC_COUNT: Record<number, number> = {
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
        const maxInvocations = INVOC_COUNT[warlockLevel] ?? 0
        if (maxInvocations > 0 && invocationSelections.length < maxInvocations) {
          incomplete.push(`Invocations (${invocationSelections.length}/${maxInvocations})`)
        }
      }

      // Metamagic (Sorcerer)
      const sorcererLevel = (() => {
        const existing = (character as Character5e).classes.find((c) => c.name.toLowerCase() === 'sorcerer')?.level ?? 0
        let gained = 0
        for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
          if ((classLevelChoices[lvl] ?? character.buildChoices.classId) === 'sorcerer') gained++
        }
        return existing + gained
      })()
      if (sorcererLevel >= 2) {
        const maxMeta = sorcererLevel >= 17 ? 6 : sorcererLevel >= 10 ? 4 : 2
        if (metamagicSelections.length < maxMeta) {
          incomplete.push(`Metamagic (${metamagicSelections.length}/${maxMeta})`)
        }
      }

      return incomplete
    }
  }
}
