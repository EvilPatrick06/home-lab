import type { StateCreator } from 'zustand'
import { load5eClasses } from '../../../services/data-provider'
import type { BuilderState, CharacterDetailsSliceState } from '../types'

/** Default values for all character-details state fields. Shared with resetBuilder(). */
export const DEFAULT_CHARACTER_DETAILS = {
  characterName: '' as string,
  iconType: 'letter' as 'letter' | 'preset' | 'custom',
  iconPreset: '',
  iconCustom: '',
  characterGender: '',
  characterDeity: '',
  characterAge: '',
  characterNotes: '',
  characterPersonality: '',
  characterIdeals: '',
  characterBonds: '',
  characterFlaws: '',
  characterBackstory: '',
  characterHeight: '',
  characterWeight: '',
  characterEyes: '',
  characterHair: '',
  characterSkin: '',
  characterAppearance: '',
  characterAlignment: '',
  speciesLanguages: [] as string[],
  speciesExtraLangCount: 0,
  speciesExtraSkillCount: 0,
  versatileFeatId: null as string | null,
  heritageId: null as string | null,
  derivedSpeciesTraits: [] as Array<{
    name: string
    description: string
    spellGranted?: string | { list: string; count: number }
  }>,
  bgLanguageCount: 0,
  classExtraLangCount: 0,
  chosenLanguages: [] as string[],
  speciesSize: 'Medium' as string,
  speciesSpeed: 30,
  speciesTraits: [] as Array<{ name: string; description: string }>,
  speciesProficiencies: [] as string[],
  classEquipment: [] as Array<{ name: string; quantity: number; source: string }>,
  bgEquipment: [] as Array<{ option: string; items: string[]; source: string }>,
  currency: { pp: 0, gp: 0, sp: 0, cp: 0 },
  higherLevelGoldBonus: 0,
  selectedMagicItems: [] as Array<{ slotRarity: string; itemId: string; itemName: string }>,
  pets: [] as Array<{ name: string; type: string }>,
  currentHP: null as number | null,
  tempHP: 0,
  conditions: [] as Array<{ name: string; type: 'condition' | 'buff'; isCustom: boolean }>,
  classSkillOptions: [] as string[],
  classMandatorySkills: [] as string[],
  selectedSkills: [] as string[],
  maxSkills: 2,
  customModal: null as 'ability-scores' | 'skills' | 'asi' | 'expertise' | null,
  builderExpertiseSelections: {} as Record<string, string[]>,
  activeExpertiseSlotId: null as string | null,
  builderFeatSelections: {} as Record<string, { id: string; name: string; description: string }>,
  backgroundAbilityBonuses: {} as Record<string, number>,
  backgroundEquipmentChoice: null as 'equipment' | 'gold' | null,
  classEquipmentChoice: null as string | null,
  selectedSpellIds: [] as string[],
  speciesSpellcastingAbility: null as 'intelligence' | 'wisdom' | 'charisma' | null,
  keenSensesSkill: null as string | null,
  blessedWarriorCantrips: [] as string[],
  druidicWarriorCantrips: [] as string[]
}

export const createCharacterDetailsSlice: StateCreator<BuilderState, [], [], CharacterDetailsSliceState> = (
  set,
  get
) => ({
  ...DEFAULT_CHARACTER_DETAILS,

  setCharacterName: (name) => set({ characterName: name }),
  setSelectedSkills: (skills) => set({ selectedSkills: skills }),

  setIconType: (type) => set({ iconType: type }),
  setIconPreset: (preset) => set({ iconType: 'preset', iconPreset: preset }),
  setIconCustom: (dataUrl) => set({ iconType: 'custom', iconCustom: dataUrl }),

  setChosenLanguages: (languages) => set({ chosenLanguages: languages }),
  setCurrency: (currency) => set({ currency }),
  addPet: (name, type) => set({ pets: [...get().pets, { name, type }] }),
  removePet: (index) => set({ pets: get().pets.filter((_, i) => i !== index) }),
  setCurrentHP: (hp) => set({ currentHP: hp }),
  setTempHP: (hp) => set({ tempHP: hp }),
  addCondition: (name, type, isCustom) => set({ conditions: [...get().conditions, { name, type, isCustom }] }),
  removeCondition: (index) => set({ conditions: get().conditions.filter((_, i) => i !== index) }),
  removeEquipmentItem: (source, index) => {
    if (source === 'class') {
      set({ classEquipment: get().classEquipment.filter((_, i) => i !== index) })
    } else {
      set({ bgEquipment: get().bgEquipment.filter((_, i) => i !== index) })
    }
  },
  addEquipmentItem: (item) => {
    set({ classEquipment: [...get().classEquipment, item] })
  },

  deductCurrency: (key, amount) => {
    const curr = { ...get().currency }
    curr[key] = Math.max(0, curr[key] - amount)
    set({ currency: curr })
  },
  setBackgroundAbilityBonuses: (bonuses) => set({ backgroundAbilityBonuses: bonuses }),
  setBackgroundEquipmentChoice: (choice) => set({ backgroundEquipmentChoice: choice }),
  setClassEquipmentChoice: (choice) => {
    set({ classEquipmentChoice: choice })
    // Update class equipment based on the selected option
    const { buildSlots, gameSystem } = get()
    if (gameSystem !== 'dnd5e') return
    const classSlot = buildSlots.find((s) => s.category === 'class')
    if (!classSlot?.selectedId) return
    load5eClasses().then((classes) => {
      const cls = classes.find((c) => c.id === classSlot.selectedId)
      if (!cls) return
      const equipment = cls.coreTraits.startingEquipment
      if (equipment && equipment.length > 0) {
        const chosen = equipment.find((e: { label: string }) => e.label === choice) ?? equipment[0]
        if (!chosen) return
        const shopItems = get().classEquipment.filter((e) => e.source === 'shop')
        set({
          classEquipment: [
            ...chosen.items.map((name: string) => ({ name, quantity: 1, source: cls.name })),
            ...shopItems
          ]
        })
      }
    })
  },
  setSpeciesSize: (size) => set({ speciesSize: size }),
  setSelectedSpellIds: (ids) => set({ selectedSpellIds: ids }),
  setHigherLevelGoldBonus: (amount) => set({ higherLevelGoldBonus: amount }),
  setSelectedMagicItems: (items) => set({ selectedMagicItems: items }),
  setSpeciesSpellcastingAbility: (ability) => set({ speciesSpellcastingAbility: ability }),
  setKeenSensesSkill: (skill) => set({ keenSensesSkill: skill }),
  setBlessedWarriorCantrips: (ids) => set({ blessedWarriorCantrips: ids }),
  setDruidicWarriorCantrips: (ids) => set({ druidicWarriorCantrips: ids }),
  setVersatileFeat: (featId) => set({ versatileFeatId: featId }),
  setBuilderExpertiseSelections: (slotId, skills) =>
    set({ builderExpertiseSelections: { ...get().builderExpertiseSelections, [slotId]: skills } }),
  setBuilderFeatSelection: (slotId, feat) => {
    const prev = { ...get().builderFeatSelections }
    if (feat) {
      prev[slotId] = feat
    } else {
      delete prev[slotId]
    }
    set({ builderFeatSelections: prev })
  },
  openCustomModal: (modal) => set({ customModal: modal }),
  closeCustomModal: () => set({ customModal: null, activeAsiSlotId: null, activeExpertiseSlotId: null })
})
