import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { createCharacterDetailsSlice, DEFAULT_CHARACTER_DETAILS } from './character-details-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

// Mock the async data provider so setClassEquipmentChoice tests are deterministic
vi.mock('../../../services/data-provider', () => ({
  load5eClasses: vi.fn().mockResolvedValue([
    {
      id: 'fighter',
      name: 'Fighter',
      coreTraits: {
        startingEquipment: [
          { label: 'Option A', items: ['Longsword', 'Shield'] },
          { label: 'Option B', items: ['Greataxe'] }
        ]
      }
    }
  ])
}))

function makeStore(extraState: Record<string, unknown> = {}) {
  return create<any>()((set, get, api) => ({
    // Minimal BuilderState fields required by the slice
    gameSystem: 'dnd5e',
    buildSlots: [],
    ...DEFAULT_CHARACTER_DETAILS,
    ...extraState,
    ...createCharacterDetailsSlice(set, get, api)
  }))
}

describe('character-details-slice', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  describe('DEFAULT_CHARACTER_DETAILS', () => {
    it('has correct default primitive values', () => {
      expect(DEFAULT_CHARACTER_DETAILS.characterName).toBe('')
      expect(DEFAULT_CHARACTER_DETAILS.iconType).toBe('letter')
      expect(DEFAULT_CHARACTER_DETAILS.speciesSize).toBe('Medium')
      expect(DEFAULT_CHARACTER_DETAILS.speciesSpeed).toBe(30)
      expect(DEFAULT_CHARACTER_DETAILS.maxSkills).toBe(2)
      expect(DEFAULT_CHARACTER_DETAILS.maxCantrips).toBe(0)
      expect(DEFAULT_CHARACTER_DETAILS.maxPreparedSpells).toBe(0)
      expect(DEFAULT_CHARACTER_DETAILS.currentHP).toBeNull()
      expect(DEFAULT_CHARACTER_DETAILS.tempHP).toBe(0)
      expect(DEFAULT_CHARACTER_DETAILS.versatileFeatId).toBeNull()
      expect(DEFAULT_CHARACTER_DETAILS.heritageId).toBeNull()
      expect(DEFAULT_CHARACTER_DETAILS.backgroundEquipmentChoice).toBeNull()
      expect(DEFAULT_CHARACTER_DETAILS.classEquipmentChoice).toBeNull()
      expect(DEFAULT_CHARACTER_DETAILS.speciesSpellcastingAbility).toBeNull()
      expect(DEFAULT_CHARACTER_DETAILS.keenSensesSkill).toBeNull()
    })

    it('has correct default array values', () => {
      expect(DEFAULT_CHARACTER_DETAILS.selectedSkills).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.chosenLanguages).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.conditions).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.pets).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.classEquipment).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.bgEquipment).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.selectedSpellIds).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.speciesTraits).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.blessedWarriorCantrips).toEqual([])
      expect(DEFAULT_CHARACTER_DETAILS.druidicWarriorCantrips).toEqual([])
    })

    it('has correct default currency', () => {
      expect(DEFAULT_CHARACTER_DETAILS.currency).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 })
    })

    it('has correct default object values', () => {
      expect(DEFAULT_CHARACTER_DETAILS.spellLevelMap).toEqual({})
      expect(DEFAULT_CHARACTER_DETAILS.builderExpertiseSelections).toEqual({})
      expect(DEFAULT_CHARACTER_DETAILS.builderFeatSelections).toEqual({})
      expect(DEFAULT_CHARACTER_DETAILS.backgroundAbilityBonuses).toEqual({})
    })
  })

  describe('setCharacterName', () => {
    it('sets the character name', () => {
      store.getState().setCharacterName('Aragorn')
      expect(store.getState().characterName).toBe('Aragorn')
    })

    it('allows empty string', () => {
      store.getState().setCharacterName('Aragorn')
      store.getState().setCharacterName('')
      expect(store.getState().characterName).toBe('')
    })
  })

  describe('setSelectedSkills', () => {
    it('sets skills when under maxSkills limit', () => {
      store.setState({ maxSkills: 3 })
      store.getState().setSelectedSkills(['Acrobatics', 'History'])
      expect(store.getState().selectedSkills).toEqual(['Acrobatics', 'History'])
    })

    it('rejects skills exceeding maxSkills', () => {
      store.setState({ maxSkills: 2 })
      store.getState().setSelectedSkills(['A', 'B', 'C'])
      expect(store.getState().selectedSkills).toEqual([])
    })

    it('allows any count when maxSkills is 0', () => {
      store.setState({ maxSkills: 0 })
      store.getState().setSelectedSkills(['A', 'B', 'C', 'D'])
      expect(store.getState().selectedSkills).toEqual(['A', 'B', 'C', 'D'])
    })

    it('allows exactly maxSkills count', () => {
      store.setState({ maxSkills: 2 })
      store.getState().setSelectedSkills(['A', 'B'])
      expect(store.getState().selectedSkills).toEqual(['A', 'B'])
    })
  })

  describe('icon setters', () => {
    it('setIconType updates iconType', () => {
      store.getState().setIconType('preset')
      expect(store.getState().iconType).toBe('preset')
    })

    it('setIconPreset sets type to preset and stores preset', () => {
      store.getState().setIconPreset('dragon')
      expect(store.getState().iconType).toBe('preset')
      expect(store.getState().iconPreset).toBe('dragon')
    })

    it('setIconCustom sets type to custom and stores dataUrl', () => {
      store.getState().setIconCustom('data:image/png;base64,abc')
      expect(store.getState().iconType).toBe('custom')
      expect(store.getState().iconCustom).toBe('data:image/png;base64,abc')
    })
  })

  describe('setChosenLanguages', () => {
    it('sets chosen languages', () => {
      store.getState().setChosenLanguages(['Common', 'Elvish'])
      expect(store.getState().chosenLanguages).toEqual(['Common', 'Elvish'])
    })
  })

  describe('setCurrency', () => {
    it('replaces the currency object', () => {
      store.getState().setCurrency({ pp: 1, gp: 10, sp: 5, cp: 2 })
      expect(store.getState().currency).toEqual({ pp: 1, gp: 10, sp: 5, cp: 2 })
    })
  })

  describe('deductCurrency', () => {
    it('deducts from the specified key', () => {
      store.setState({ currency: { pp: 0, gp: 20, sp: 0, cp: 0 } })
      store.getState().deductCurrency('gp', 5)
      expect(store.getState().currency.gp).toBe(15)
    })

    it('does not go below 0', () => {
      store.setState({ currency: { pp: 0, gp: 3, sp: 0, cp: 0 } })
      store.getState().deductCurrency('gp', 10)
      expect(store.getState().currency.gp).toBe(0)
    })

    it('does not affect other currency keys', () => {
      store.setState({ currency: { pp: 5, gp: 10, sp: 3, cp: 7 } })
      store.getState().deductCurrency('gp', 2)
      const c = store.getState().currency
      expect(c.pp).toBe(5)
      expect(c.sp).toBe(3)
      expect(c.cp).toBe(7)
    })
  })

  describe('pets', () => {
    it('addPet appends a pet', () => {
      store.getState().addPet('Fido', 'dog')
      expect(store.getState().pets).toEqual([{ name: 'Fido', type: 'dog' }])
    })

    it('removePet removes by index', () => {
      store.getState().addPet('Fido', 'dog')
      store.getState().addPet('Whiskers', 'cat')
      store.getState().removePet(0)
      expect(store.getState().pets).toEqual([{ name: 'Whiskers', type: 'cat' }])
    })

    it('removePet at invalid index does not throw', () => {
      store.getState().addPet('Fido', 'dog')
      expect(() => store.getState().removePet(99)).not.toThrow()
    })
  })

  describe('HP', () => {
    it('setCurrentHP sets hp', () => {
      store.getState().setCurrentHP(42)
      expect(store.getState().currentHP).toBe(42)
    })

    it('setCurrentHP allows null', () => {
      store.getState().setCurrentHP(42)
      store.getState().setCurrentHP(null)
      expect(store.getState().currentHP).toBeNull()
    })

    it('setTempHP sets temp hp', () => {
      store.getState().setTempHP(10)
      expect(store.getState().tempHP).toBe(10)
    })
  })

  describe('conditions', () => {
    it('addCondition appends a condition', () => {
      store.getState().addCondition('Poisoned', 'condition', false)
      expect(store.getState().conditions).toEqual([{ name: 'Poisoned', type: 'condition', isCustom: false }])
    })

    it('addCondition allows buff type', () => {
      store.getState().addCondition('Blessed', 'buff', true)
      expect(store.getState().conditions[0]).toEqual({ name: 'Blessed', type: 'buff', isCustom: true })
    })

    it('removeCondition removes by index', () => {
      store.getState().addCondition('Poisoned', 'condition', false)
      store.getState().addCondition('Blinded', 'condition', false)
      store.getState().removeCondition(0)
      expect(store.getState().conditions).toHaveLength(1)
      expect(store.getState().conditions[0].name).toBe('Blinded')
    })
  })

  describe('equipment', () => {
    it('addEquipmentItem adds to classEquipment for class target', () => {
      store.getState().addEquipmentItem({ name: 'Longsword', quantity: 1, source: 'Fighter' }, 'class')
      expect(store.getState().classEquipment).toHaveLength(1)
      expect(store.getState().classEquipment[0].name).toBe('Longsword')
    })

    it('addEquipmentItem adds to bgEquipment for background target', () => {
      store.getState().addEquipmentItem({ name: 'Thieves Tools', quantity: 1, source: 'Rogue' }, 'background')
      expect(store.getState().bgEquipment).toHaveLength(1)
      expect(store.getState().bgEquipment[0].option).toBe('Thieves Tools')
    })

    it('removeEquipmentItem removes from class by index', () => {
      store.getState().addEquipmentItem({ name: 'Sword', quantity: 1, source: 'Fighter' }, 'class')
      store.getState().addEquipmentItem({ name: 'Shield', quantity: 1, source: 'Fighter' }, 'class')
      store.getState().removeEquipmentItem('class', 0)
      expect(store.getState().classEquipment).toHaveLength(1)
      expect(store.getState().classEquipment[0].name).toBe('Shield')
    })

    it('removeEquipmentItem removes from bg by index', () => {
      store.getState().addEquipmentItem({ name: 'Tools', quantity: 1, source: 'Bg' }, 'background')
      store.getState().addEquipmentItem({ name: 'Pouch', quantity: 1, source: 'Bg' }, 'background')
      store.getState().removeEquipmentItem('background', 0)
      expect(store.getState().bgEquipment).toHaveLength(1)
    })
  })

  describe('setBackgroundEquipmentChoice', () => {
    it('sets the background equipment choice', () => {
      store.getState().setBackgroundEquipmentChoice('equipment')
      expect(store.getState().backgroundEquipmentChoice).toBe('equipment')
    })

    it('can set to gold', () => {
      store.getState().setBackgroundEquipmentChoice('gold')
      expect(store.getState().backgroundEquipmentChoice).toBe('gold')
    })

    it('can set to null', () => {
      store.getState().setBackgroundEquipmentChoice('equipment')
      store.getState().setBackgroundEquipmentChoice(null)
      expect(store.getState().backgroundEquipmentChoice).toBeNull()
    })
  })

  describe('setBackgroundAbilityBonuses', () => {
    it('sets ability bonuses', () => {
      store.getState().setBackgroundAbilityBonuses({ strength: 2, dexterity: 1 })
      expect(store.getState().backgroundAbilityBonuses).toEqual({ strength: 2, dexterity: 1 })
    })
  })

  describe('setSpeciesSize', () => {
    it('updates speciesSize', () => {
      store.getState().setSpeciesSize('Small')
      expect(store.getState().speciesSize).toBe('Small')
    })
  })

  describe('setSelectedSpellIds', () => {
    it('sets spell ids when no limits apply', () => {
      store.setState({ maxCantrips: 0, maxPreparedSpells: 0, spellLevelMap: {} })
      store.getState().setSelectedSpellIds(['spell-1', 'spell-2'])
      expect(store.getState().selectedSpellIds).toEqual(['spell-1', 'spell-2'])
    })

    it('enforces cantrip limit', () => {
      store.setState({
        maxCantrips: 2,
        maxPreparedSpells: 5,
        spellLevelMap: { 'cantrip-1': 0, 'cantrip-2': 0, 'cantrip-3': 0 }
      })
      store.getState().setSelectedSpellIds(['cantrip-1', 'cantrip-2', 'cantrip-3'])
      expect(store.getState().selectedSpellIds).toEqual([]) // rejected
    })

    it('enforces prepared spell limit', () => {
      store.setState({
        maxCantrips: 2,
        maxPreparedSpells: 1,
        spellLevelMap: { 'spell-a': 1, 'spell-b': 2 }
      })
      store.getState().setSelectedSpellIds(['spell-a', 'spell-b'])
      expect(store.getState().selectedSpellIds).toEqual([]) // rejected
    })

    it('allows valid selection within limits', () => {
      store.setState({
        maxCantrips: 2,
        maxPreparedSpells: 3,
        spellLevelMap: { c1: 0, c2: 0, s1: 1, s2: 2 }
      })
      store.getState().setSelectedSpellIds(['c1', 'c2', 's1', 's2'])
      expect(store.getState().selectedSpellIds).toEqual(['c1', 'c2', 's1', 's2'])
    })
  })

  describe('setSpellLimits', () => {
    it('sets maxCantrips and maxPreparedSpells', () => {
      store.getState().setSpellLimits(4, 8)
      expect(store.getState().maxCantrips).toBe(4)
      expect(store.getState().maxPreparedSpells).toBe(8)
    })
  })

  describe('setSpellLevelMap', () => {
    it('sets the spell level map', () => {
      store.getState().setSpellLevelMap({ fireball: 3, 'mage-hand': 0 })
      expect(store.getState().spellLevelMap).toEqual({ fireball: 3, 'mage-hand': 0 })
    })
  })

  describe('setHigherLevelGoldBonus', () => {
    it('sets the gold bonus amount', () => {
      store.getState().setHigherLevelGoldBonus(75)
      expect(store.getState().higherLevelGoldBonus).toBe(75)
    })
  })

  describe('setSelectedMagicItems', () => {
    it('sets magic items array', () => {
      const items = [{ slotRarity: 'uncommon', itemId: 'cloak-elvenkind', itemName: 'Cloak of Elvenkind' }]
      store.getState().setSelectedMagicItems(items)
      expect(store.getState().selectedMagicItems).toEqual(items)
    })
  })

  describe('species ability setters', () => {
    it('setSpeciesSpellcastingAbility sets the ability', () => {
      store.getState().setSpeciesSpellcastingAbility('charisma')
      expect(store.getState().speciesSpellcastingAbility).toBe('charisma')
    })

    it('setKeenSensesSkill sets the skill', () => {
      store.getState().setKeenSensesSkill('Perception')
      expect(store.getState().keenSensesSkill).toBe('Perception')
    })
  })

  describe('cantrip setters', () => {
    it('setBlessedWarriorCantrips sets ids', () => {
      store.getState().setBlessedWarriorCantrips(['sacred-flame', 'thaumaturgy'])
      expect(store.getState().blessedWarriorCantrips).toEqual(['sacred-flame', 'thaumaturgy'])
    })

    it('setDruidicWarriorCantrips sets ids', () => {
      store.getState().setDruidicWarriorCantrips(['shillelagh', 'produce-flame'])
      expect(store.getState().druidicWarriorCantrips).toEqual(['shillelagh', 'produce-flame'])
    })
  })

  describe('setVersatileFeat', () => {
    it('sets versatile feat id', () => {
      store.getState().setVersatileFeat('alert')
      expect(store.getState().versatileFeatId).toBe('alert')
    })

    it('can set to null', () => {
      store.getState().setVersatileFeat('alert')
      store.getState().setVersatileFeat(null)
      expect(store.getState().versatileFeatId).toBeNull()
    })
  })

  describe('setBuilderExpertiseSelections', () => {
    it('adds a new slot entry', () => {
      store.getState().setBuilderExpertiseSelections('slot-1', ['Stealth', 'Arcana'])
      expect(store.getState().builderExpertiseSelections['slot-1']).toEqual(['Stealth', 'Arcana'])
    })

    it('merges with existing entries', () => {
      store.getState().setBuilderExpertiseSelections('slot-1', ['Stealth'])
      store.getState().setBuilderExpertiseSelections('slot-2', ['Arcana'])
      expect(store.getState().builderExpertiseSelections['slot-1']).toEqual(['Stealth'])
      expect(store.getState().builderExpertiseSelections['slot-2']).toEqual(['Arcana'])
    })

    it('overwrites existing slot', () => {
      store.getState().setBuilderExpertiseSelections('slot-1', ['Stealth'])
      store.getState().setBuilderExpertiseSelections('slot-1', ['Arcana'])
      expect(store.getState().builderExpertiseSelections['slot-1']).toEqual(['Arcana'])
    })
  })

  describe('setBuilderFeatSelection', () => {
    const feat = { id: 'alert', name: 'Alert', description: '+5 initiative' }

    it('sets a feat for a slot', () => {
      store.getState().setBuilderFeatSelection('slot-1', feat)
      expect(store.getState().builderFeatSelections['slot-1']).toEqual(feat)
    })

    it('removes a feat when null passed', () => {
      store.getState().setBuilderFeatSelection('slot-1', feat)
      store.getState().setBuilderFeatSelection('slot-1', null)
      expect(store.getState().builderFeatSelections['slot-1']).toBeUndefined()
    })

    it('does not affect other slots on removal', () => {
      store.getState().setBuilderFeatSelection('slot-1', feat)
      store.getState().setBuilderFeatSelection('slot-2', { id: 'tough', name: 'Tough', description: '+2 HP/level' })
      store.getState().setBuilderFeatSelection('slot-1', null)
      expect(store.getState().builderFeatSelections['slot-2']).toBeDefined()
    })
  })

  describe('setClassEquipmentChoice', () => {
    it('sets the classEquipmentChoice immediately', () => {
      store.setState({
        buildSlots: [{ category: 'class', selectedId: 'fighter' }],
        gameSystem: 'dnd5e'
      })
      store.getState().setClassEquipmentChoice('Option A')
      expect(store.getState().classEquipmentChoice).toBe('Option A')
    })

    it('does nothing async when gameSystem is not dnd5e', () => {
      store.setState({ gameSystem: 'pf2e', buildSlots: [] })
      store.getState().setClassEquipmentChoice('Option A')
      expect(store.getState().classEquipmentChoice).toBe('Option A')
    })

    it('updates classEquipment based on chosen option', async () => {
      store.setState({
        buildSlots: [{ category: 'class', selectedId: 'fighter' }],
        gameSystem: 'dnd5e',
        classEquipment: []
      })
      store.getState().setClassEquipmentChoice('Option A')
      // Wait for async load5eClasses to resolve
      await new Promise((r) => setTimeout(r, 0))
      const equipment = store.getState().classEquipment
      expect(equipment.map((e: any) => e.name)).toContain('Longsword')
      expect(equipment.map((e: any) => e.name)).toContain('Shield')
    })

    it('preserves shop items when updating class equipment', async () => {
      store.setState({
        buildSlots: [{ category: 'class', selectedId: 'fighter' }],
        gameSystem: 'dnd5e',
        classEquipment: [{ name: 'Healing Potion', quantity: 1, source: 'shop' }]
      })
      store.getState().setClassEquipmentChoice('Option A')
      await new Promise((r) => setTimeout(r, 0))
      const equipment = store.getState().classEquipment
      const shopItem = equipment.find((e: any) => e.source === 'shop')
      expect(shopItem).toBeDefined()
      expect(shopItem.name).toBe('Healing Potion')
    })
  })
})
