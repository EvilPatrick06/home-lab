import { describe, expect, it } from 'vitest'
import type { SidebarEntryStatBlock } from '../types/game-state'
import type { MonsterStatBlock } from '../types/monster'
import type { DisplayStatBlock } from './stat-block-converter'
import { monsterToDisplay, monsterToSidebar, sidebarToDisplay } from './stat-block-converter'

function makeMonster(overrides?: Partial<MonsterStatBlock>): MonsterStatBlock {
  return {
    id: 'goblin',
    name: 'Goblin',
    size: 'Small',
    type: 'Humanoid',
    alignment: 'Neutral Evil',
    ac: 15,
    acType: 'Leather Armor',
    hp: 7,
    hitDice: '2d6',
    speed: { walk: 30 },
    abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    senses: { passivePerception: 9 },
    languages: ['Common', 'Goblin'],
    cr: '1/4',
    xp: 50,
    proficiencyBonus: 2,
    actions: [{ name: 'Scimitar', description: 'Melee Weapon Attack: +4 to hit, 5 ft. reach.' }],
    tokenSize: { x: 1, y: 1 },
    ...overrides
  }
}

describe('monsterToDisplay', () => {
  it('converts basic monster fields correctly', () => {
    const monster = makeMonster()
    const display = monsterToDisplay(monster)

    expect(display.name).toBe('Goblin')
    expect(display.size).toBe('Small')
    expect(display.type).toBe('Humanoid')
    expect(display.alignment).toBe('Neutral Evil')
    expect(display.ac).toBe(15)
    expect(display.acSource).toBe('Leather Armor')
    expect(display.hp).toBe(7)
    expect(display.hpFormula).toBe('2d6')
    expect(display.cr).toBe('1/4')
    expect(display.xp).toBe(50)
    expect(display.proficiencyBonus).toBe(2)
  })

  it('formats speed with walk only', () => {
    const monster = makeMonster({ speed: { walk: 30 } })
    const display = monsterToDisplay(monster)
    expect(display.speed).toBe('30 ft.')
  })

  it('formats speed with multiple movement types', () => {
    const monster = makeMonster({ speed: { walk: 30, fly: 60, swim: 40, hover: true } })
    const display = monsterToDisplay(monster)
    expect(display.speed).toContain('30 ft.')
    expect(display.speed).toContain('fly 60 ft. (hover)')
    expect(display.speed).toContain('swim 40 ft.')
  })

  it('formats speed with climb and burrow', () => {
    const monster = makeMonster({ speed: { walk: 20, climb: 20, burrow: 10 } })
    const display = monsterToDisplay(monster)
    expect(display.speed).toContain('climb 20 ft.')
    expect(display.speed).toContain('burrow 10 ft.')
  })

  it('includes subtype in type field', () => {
    const monster = makeMonster({ type: 'Humanoid', subtype: 'Goblinoid' })
    const display = monsterToDisplay(monster)
    expect(display.type).toBe('Humanoid (Goblinoid)')
  })

  it('does not include subtype when absent', () => {
    const monster = makeMonster({ subtype: undefined })
    const display = monsterToDisplay(monster)
    expect(display.type).toBe('Humanoid')
  })

  it('formats saving throws', () => {
    const monster = makeMonster({ savingThrows: { dex: 4, wis: 1 } })
    const display = monsterToDisplay(monster)
    expect(display.savingThrows).toContain('Dex +4')
    expect(display.savingThrows).toContain('Wis +1')
  })

  it('returns undefined savingThrows when monster has none', () => {
    const monster = makeMonster({ savingThrows: undefined })
    const display = monsterToDisplay(monster)
    expect(display.savingThrows).toBeUndefined()
  })

  it('formats skills', () => {
    const monster = makeMonster({ skills: { Stealth: 6, Perception: 3 } })
    const display = monsterToDisplay(monster)
    expect(display.skills).toContain('Stealth +6')
    expect(display.skills).toContain('Perception +3')
  })

  it('handles negative skill modifiers', () => {
    const monster = makeMonster({ skills: { Athletics: -1 } })
    const display = monsterToDisplay(monster)
    expect(display.skills).toContain('Athletics -1')
  })

  it('formats senses including darkvision and passive perception', () => {
    const monster = makeMonster({
      senses: { darkvision: 60, passivePerception: 12 }
    })
    const display = monsterToDisplay(monster)
    expect(display.senses).toContain('Darkvision 60 ft.')
    expect(display.senses).toContain('Passive Perception 12')
  })

  it('formats senses with all sense types', () => {
    const monster = makeMonster({
      senses: { blindsight: 30, darkvision: 120, tremorsense: 60, truesight: 60, passivePerception: 15 }
    })
    const display = monsterToDisplay(monster)
    expect(display.senses).toContain('Blindsight 30 ft.')
    expect(display.senses).toContain('Darkvision 120 ft.')
    expect(display.senses).toContain('Tremorsense 60 ft.')
    expect(display.senses).toContain('Truesight 60 ft.')
  })

  it('formats languages', () => {
    const monster = makeMonster({ languages: ['Common', 'Draconic'] })
    const display = monsterToDisplay(monster)
    expect(display.languages).toBe('Common, Draconic')
  })

  it('returns undefined languages when empty array', () => {
    const monster = makeMonster({ languages: [] })
    const display = monsterToDisplay(monster)
    expect(display.languages).toBeUndefined()
  })

  it('formats damage resistances', () => {
    const monster = makeMonster({ resistances: ['fire', 'cold'] })
    const display = monsterToDisplay(monster)
    expect(display.damageResistances).toBe('fire, cold')
  })

  it('formats damage immunities', () => {
    const monster = makeMonster({ damageImmunities: ['poison'] })
    const display = monsterToDisplay(monster)
    expect(display.damageImmunities).toBe('poison')
  })

  it('formats condition immunities', () => {
    const monster = makeMonster({ conditionImmunities: ['poisoned', 'frightened'] })
    const display = monsterToDisplay(monster)
    expect(display.conditionImmunities).toBe('poisoned, frightened')
  })

  it('converts traits', () => {
    const monster = makeMonster({
      traits: [{ name: 'Nimble Escape', description: 'The goblin can take Disengage or Hide.' }]
    })
    const display = monsterToDisplay(monster)
    expect(display.traits).toHaveLength(1)
    expect(display.traits![0].name).toBe('Nimble Escape')
  })

  it('converts actions', () => {
    const monster = makeMonster()
    const display = monsterToDisplay(monster)
    expect(display.actions).toHaveLength(1)
    expect(display.actions![0].name).toBe('Scimitar')
  })

  it('converts legendary actions', () => {
    const monster = makeMonster({
      legendaryActions: {
        uses: 3,
        actions: [{ name: 'Detect', description: 'Make a Wisdom check.' }]
      }
    })
    const display = monsterToDisplay(monster)
    expect(display.legendaryActions).toHaveLength(1)
    expect(display.legendaryActions![0].name).toBe('Detect')
  })

  it('converts spellcasting', () => {
    const monster = makeMonster({
      spellcasting: {
        ability: 'Intelligence',
        saveDC: 15,
        attackBonus: 7,
        notes: 'The archmage is a 18th-level spellcaster.'
      }
    })
    const display = monsterToDisplay(monster)
    expect(display.spellcasting).toBeDefined()
    expect(display.spellcasting!.ability).toBe('Intelligence')
    expect(display.spellcasting!.dc).toBe(15)
    expect(display.spellcasting!.attackBonus).toBe(7)
    expect(display.spellcasting!.description).toBe('The archmage is a 18th-level spellcaster.')
  })

  it('has undefined spellcasting when monster has none', () => {
    const monster = makeMonster({ spellcasting: undefined })
    const display = monsterToDisplay(monster)
    expect(display.spellcasting).toBeUndefined()
  })

  it('copies ability scores', () => {
    const monster = makeMonster({
      abilityScores: { str: 20, dex: 14, con: 18, int: 6, wis: 12, cha: 8 }
    })
    const display = monsterToDisplay(monster)
    expect(display.abilities).toEqual({ str: 20, dex: 14, con: 18, int: 6, wis: 12, cha: 8 })
  })
})

describe('sidebarToDisplay', () => {
  it('uses default values when sidebar fields are missing', () => {
    const sidebar: SidebarEntryStatBlock = {}
    const display = sidebarToDisplay(sidebar)
    expect(display.name).toBe('Creature')
    expect(display.size).toBe('Medium')
    expect(display.type).toBe('Unknown')
    expect(display.alignment).toBe('Unaligned')
    expect(display.ac).toBe(10)
    expect(display.hp).toBe(1)
  })

  it('uses provided name when given', () => {
    const sidebar: SidebarEntryStatBlock = {}
    const display = sidebarToDisplay(sidebar, 'Custom Name')
    expect(display.name).toBe('Custom Name')
  })

  it('uses default ability scores when not provided', () => {
    const sidebar: SidebarEntryStatBlock = {}
    const display = sidebarToDisplay(sidebar)
    expect(display.abilities).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })
  })

  it('formats sidebar speeds correctly', () => {
    const sidebar: SidebarEntryStatBlock = {
      speeds: { walk: 40, fly: 80 }
    }
    const display = sidebarToDisplay(sidebar)
    expect(display.speed).toContain('40 ft.')
    expect(display.speed).toContain('fly 80 ft.')
  })

  it('returns "0 ft." when speeds are all undefined', () => {
    const sidebar: SidebarEntryStatBlock = { speeds: {} }
    const display = sidebarToDisplay(sidebar)
    expect(display.speed).toBe('0 ft.')
  })

  it('returns "30 ft." when speeds is undefined', () => {
    const sidebar: SidebarEntryStatBlock = {}
    const display = sidebarToDisplay(sidebar)
    expect(display.speed).toBe('30 ft.')
  })

  it('formats sidebar skills', () => {
    const sidebar: SidebarEntryStatBlock = {
      skills: [
        { name: 'Stealth', modifier: 6, proficiency: 'proficient' },
        { name: 'Perception', modifier: -1, proficiency: 'proficient' }
      ]
    }
    const display = sidebarToDisplay(sidebar)
    expect(display.skills).toContain('Stealth +6')
    expect(display.skills).toContain('Perception -1')
  })

  it('formats sidebar saving throws from ability scores', () => {
    const sidebar: SidebarEntryStatBlock = {
      abilityScores: { str: 16, dex: 12, con: 14, int: 10, wis: 8, cha: 10 },
      savingThrows: ['Strength', 'Constitution']
    }
    const display = sidebarToDisplay(sidebar)
    expect(display.savingThrows).toBeDefined()
    // sidebarToDisplay passes (mod + profBonus) into formatModifier(score)
    // which recalculates Math.floor((score-10)/2). So:
    // Str: mod=3, formatModifier(3+2=5) → Math.floor((5-10)/2) = -3
    // Con: mod=2, formatModifier(2+2=4) → Math.floor((4-10)/2) = -3
    expect(display.savingThrows).toContain('Str -3')
    expect(display.savingThrows).toContain('Con -3')
  })

  it('converts spellcasting when present', () => {
    const sidebar: SidebarEntryStatBlock = {
      spellcasting: { ability: 'Wisdom', dc: 14, attackBonus: 6 }
    }
    const display = sidebarToDisplay(sidebar)
    expect(display.spellcasting).toEqual({
      ability: 'Wisdom',
      dc: 14,
      attackBonus: 6
    })
  })

  it('handles senses and passive perception', () => {
    const sidebar: SidebarEntryStatBlock = {
      senses: ['darkvision 60 ft.'],
      passivePerception: 14
    }
    const display = sidebarToDisplay(sidebar)
    expect(display.senses).toContain('darkvision 60 ft.')
    expect(display.senses).toContain('Passive Perception 14')
  })

  it('returns undefined senses when none provided', () => {
    const sidebar: SidebarEntryStatBlock = {}
    const display = sidebarToDisplay(sidebar)
    expect(display.senses).toBeUndefined()
  })
})

describe('DisplayStatBlock — type contract', () => {
  it('monsterToDisplay returns an object satisfying the DisplayStatBlock shape', () => {
    const monster = makeMonster()
    const display: DisplayStatBlock = monsterToDisplay(monster)
    expect(typeof display.name).toBe('string')
    expect(typeof display.size).toBe('string')
    expect(typeof display.type).toBe('string')
    expect(typeof display.alignment).toBe('string')
    expect(typeof display.ac).toBe('number')
    expect(typeof display.hp).toBe('number')
    expect(typeof display.speed).toBe('string')
    expect(typeof display.abilities.str).toBe('number')
    expect(typeof display.abilities.dex).toBe('number')
    expect(typeof display.abilities.con).toBe('number')
    expect(typeof display.abilities.int).toBe('number')
    expect(typeof display.abilities.wis).toBe('number')
    expect(typeof display.abilities.cha).toBe('number')
  })

  it('optional spellcasting field has correct sub-shape', () => {
    const monster = makeMonster({
      spellcasting: { ability: 'Intelligence', saveDC: 14, attackBonus: 6 }
    })
    const display: DisplayStatBlock = monsterToDisplay(monster)
    expect(display.spellcasting).toBeDefined()
    expect(typeof display.spellcasting!.ability).toBe('string')
    expect(typeof display.spellcasting!.dc).toBe('number')
    expect(typeof display.spellcasting!.attackBonus).toBe('number')
  })
})

describe('monsterToSidebar', () => {
  it('converts monster basic fields to sidebar format', () => {
    const monster = makeMonster()
    const sidebar = monsterToSidebar(monster)

    expect(sidebar.size).toBe('Small')
    expect(sidebar.creatureType).toBe('Humanoid')
    expect(sidebar.alignment).toBe('Neutral Evil')
    expect(sidebar.cr).toBe('1/4')
    expect(sidebar.xp).toBe(50)
    expect(sidebar.ac).toBe(15)
    expect(sidebar.acSource).toBe('Leather Armor')
    expect(sidebar.hpMax).toBe(7)
    expect(sidebar.hpCurrent).toBe(7) // Current HP starts at max
    expect(sidebar.linkedMonsterId).toBe('goblin')
  })

  it('includes subtype in creatureType', () => {
    const monster = makeMonster({ type: 'Humanoid', subtype: 'Goblinoid' })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.creatureType).toBe('Humanoid (Goblinoid)')
  })

  it('converts speeds', () => {
    const monster = makeMonster({ speed: { walk: 30, fly: 60, swim: 30, climb: 20, burrow: 10 } })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.speeds).toEqual({ walk: 30, fly: 60, swim: 30, climb: 20, burrow: 10 })
  })

  it('converts saving throws from Record to string[]', () => {
    const monster = makeMonster({ savingThrows: { str: 5, con: 3 } })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.savingThrows).toContain('Strength')
    expect(sidebar.savingThrows).toContain('Constitution')
  })

  it('returns undefined savingThrows when monster has none', () => {
    const monster = makeMonster({ savingThrows: undefined })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.savingThrows).toBeUndefined()
  })

  it('converts skills from Record to array format', () => {
    const monster = makeMonster({ skills: { Stealth: 6, Perception: 3 } })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.skills).toHaveLength(2)
    const stealth = sidebar.skills!.find((s) => s.name === 'Stealth')
    expect(stealth).toBeDefined()
    expect(stealth!.modifier).toBe(6)
    expect(stealth!.proficiency).toBe('proficient')
  })

  it('converts senses', () => {
    const monster = makeMonster({
      senses: { darkvision: 60, blindsight: 30, passivePerception: 12 }
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.senses).toContain('darkvision 60 ft.')
    expect(sidebar.senses).toContain('blindsight 30 ft.')
    expect(sidebar.passivePerception).toBe(12)
  })

  it('converts spellcasting with at-will and per-day spells', () => {
    const monster = makeMonster({
      spellcasting: {
        ability: 'Charisma',
        saveDC: 16,
        attackBonus: 8,
        atWill: ['detect magic', 'mage hand'],
        perDay: { '3': ['fireball', 'counterspell'], '1': ['dominate person'] }
      }
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.spellcasting).toBeDefined()
    expect(sidebar.spellcasting!.ability).toBe('Charisma')
    expect(sidebar.spellcasting!.dc).toBe(16)
    expect(sidebar.spellcasting!.attackBonus).toBe(8)
    expect(sidebar.spellcasting!.spells).toContain('detect magic')
    expect(sidebar.spellcasting!.spells).toContain('fireball')
    expect(sidebar.spellcasting!.spells).toContain('dominate person')
  })

  it('converts spellcasting with spell slots', () => {
    const monster = makeMonster({
      spellcasting: {
        ability: 'Intelligence',
        saveDC: 15,
        attackBonus: 7,
        slots: {
          '1st': { slots: 4, spells: ['magic missile', 'shield'] },
          '2nd': { slots: 3, spells: ['misty step'] }
        }
      }
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.spellcasting!.spells).toContain('magic missile')
    expect(sidebar.spellcasting!.spells).toContain('shield')
    expect(sidebar.spellcasting!.spells).toContain('misty step')
  })

  it('converts actions to simplified format', () => {
    const monster = makeMonster({
      actions: [
        { name: 'Bite', description: 'Melee Attack: +5', attackType: 'melee', toHit: 5 },
        { name: 'Claw', description: 'Melee Attack: +5', attackType: 'melee', toHit: 5 }
      ]
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.actions).toHaveLength(2)
    expect(sidebar.actions![0]).toEqual({ name: 'Bite', description: 'Melee Attack: +5' })
  })

  it('converts bonus actions', () => {
    const monster = makeMonster({
      bonusActions: [{ name: 'Nimble Escape', description: 'Disengage or Hide as bonus action.' }]
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.bonusActions).toHaveLength(1)
    expect(sidebar.bonusActions![0].name).toBe('Nimble Escape')
  })

  it('converts legendary actions', () => {
    const monster = makeMonster({
      legendaryActions: {
        uses: 3,
        actions: [{ name: 'Detect', description: 'Make a Perception check.' }]
      }
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.legendaryActions).toHaveLength(1)
    expect(sidebar.legendaryActions![0].name).toBe('Detect')
  })

  it('converts resistances and immunities directly', () => {
    const monster = makeMonster({
      resistances: ['fire', 'cold'],
      damageImmunities: ['poison'],
      vulnerabilities: ['radiant'],
      conditionImmunities: ['poisoned']
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.resistances).toEqual(['fire', 'cold'])
    expect(sidebar.immunities).toEqual(['poison'])
    expect(sidebar.vulnerabilities).toEqual(['radiant'])
    expect(sidebar.conditionImmunities).toEqual(['poisoned'])
  })

  it('copies ability scores', () => {
    const monster = makeMonster({
      abilityScores: { str: 20, dex: 14, con: 18, int: 6, wis: 12, cha: 8 }
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.abilityScores).toEqual({ str: 20, dex: 14, con: 18, int: 6, wis: 12, cha: 8 })
    // Ensure it is a copy, not a reference
    expect(sidebar.abilityScores).not.toBe(monster.abilityScores)
  })

  it('converts lair actions', () => {
    const monster = makeMonster({
      lairActions: {
        initiativeCount: 20,
        actions: [{ name: 'Lair Collapse', description: 'The ceiling collapses.' }]
      }
    })
    const sidebar = monsterToSidebar(monster)
    expect(sidebar.lairActions).toHaveLength(1)
    expect(sidebar.lairActions![0].name).toBe('Lair Collapse')
  })
})
