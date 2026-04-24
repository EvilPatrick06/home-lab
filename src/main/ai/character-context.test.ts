import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage/character-storage', () => ({
  loadCharacter: vi.fn()
}))

import { loadCharacter } from '../storage/character-storage'
import { formatCharacterAbbreviated, formatCharacterForContext, loadCharacterById } from './character-context'

const mockLoadCharacter = vi.mocked(loadCharacter)

beforeEach(() => {
  vi.clearAllMocks()
})

function makeCharacter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Thorin',
    level: 5,
    species: 'Dwarf',
    subspecies: 'Mountain Dwarf',
    classes: [{ name: 'Fighter', subclass: 'Champion', level: 5 }],
    hitPoints: { current: 40, maximum: 50, temporary: 0 },
    armorClass: 18,
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 13,
      charisma: 8
    },
    speed: 25,
    speeds: { fly: 0, swim: 0, climb: 0, burrow: 0 },
    initiative: 1,
    proficiencies: {
      savingThrows: ['Strength', 'Constitution'],
      weapons: ['Simple', 'Martial'],
      armor: ['Light', 'Medium', 'Heavy', 'Shields'],
      tools: [],
      languages: ['Common', 'Dwarvish']
    },
    skills: [
      { name: 'Athletics', proficient: true, expertise: false },
      { name: 'Perception', proficient: true, expertise: true },
      { name: 'Stealth', proficient: false }
    ],
    spellcasting: null,
    classResources: [{ name: 'Second Wind', current: 1, max: 1 }],
    hitDice: [{ current: 5, maximum: 5, dieType: 10 }],
    armor: [{ name: 'Chain Mail', acBonus: 16, equipped: true }],
    weapons: [{ name: 'Battleaxe', damage: '1d8+3', damageType: 'slashing', attackBonus: 6 }],
    treasure: { pp: 0, gp: 50, ep: 0, sp: 10, cp: 5 },
    features: [
      { name: 'Darkvision', source: 'Dwarf', description: 'You can see in dim light within 60 feet of you.' },
      { name: 'Action Surge', source: 'Fighter', description: 'Extra action on your turn' }
    ],
    feats: [{ id: 'gwm', name: 'Great Weapon Master', description: 'Power attack' }],
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    heroicInspiration: false,
    resistances: ['poison'],
    immunities: [],
    vulnerabilities: [],
    ...overrides
  }
}

describe('loadCharacterById', () => {
  it('returns character data on success', async () => {
    const char = { id: 'c1', name: 'Thorin' }
    mockLoadCharacter.mockResolvedValue({ success: true, data: char })
    const result = await loadCharacterById('c1')
    expect(result).toEqual(char)
  })

  it('returns null when character not found', async () => {
    mockLoadCharacter.mockResolvedValue({ success: false })
    const result = await loadCharacterById('missing')
    expect(result).toBeNull()
  })

  it('returns null when data is undefined', async () => {
    mockLoadCharacter.mockResolvedValue({ success: true, data: undefined })
    const result = await loadCharacterById('empty')
    expect(result).toBeNull()
  })
})

describe('formatCharacterForContext', () => {
  it('formats character header line', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('**Thorin** — Level 5 Dwarf (Mountain Dwarf) Fighter (Champion) 5 (5e 2024)')
  })

  it('formats HP and AC', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('HP: 40/50')
    expect(result).toContain('AC: 18')
  })

  it('formats temporary HP when present', () => {
    const result = formatCharacterForContext(makeCharacter({ hitPoints: { current: 40, maximum: 50, temporary: 10 } }))
    expect(result).toContain('+10 temp')
  })

  it('formats ability scores with modifiers', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('STR 16 (+3)')
    expect(result).toContain('DEX 12 (+1)')
    expect(result).toContain('CON 14 (+2)')
    expect(result).toContain('INT 10 (+0)')
    expect(result).toContain('WIS 13 (+1)')
    expect(result).toContain('CHA 8 (-1)')
  })

  it('formats speed including special movement', () => {
    const result = formatCharacterForContext(makeCharacter({ speeds: { fly: 30, swim: 0, climb: 20, burrow: 0 } }))
    expect(result).toContain('25 ft')
    expect(result).toContain('fly 30 ft')
    expect(result).toContain('climb 20 ft')
    expect(result).not.toContain('swim')
    expect(result).not.toContain('burrow')
  })

  it('formats saving throw proficiencies', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Saving Throw Proficiencies: Strength, Constitution')
  })

  it('formats skill proficiencies with expertise', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Skill Proficiencies:')
    expect(result).toContain('Athletics')
    expect(result).toContain('Perception (expertise)')
    expect(result).not.toContain('Stealth')
  })

  it('formats weapon and armor proficiencies', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Weapon Proficiencies: Simple, Martial')
    expect(result).toContain('Armor Proficiencies: Light, Medium, Heavy, Shields')
  })

  it('formats languages', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Languages: Common, Dwarvish')
  })

  it('formats spellcasting when present', () => {
    const result = formatCharacterForContext(
      makeCharacter({
        spellcasting: { spellSaveDC: 15, spellAttackBonus: 7, ability: 'Intelligence' },
        spellSlotLevels: { 1: { current: 3, max: 4 }, 2: { current: 2, max: 3 } },
        preparedSpellIds: ['magic-missile'],
        knownSpells: [
          { id: 'magic-missile', name: 'Magic Missile' },
          { id: 'shield', name: 'Shield' }
        ]
      })
    )
    expect(result).toContain('Spellcasting: Save DC 15 | Attack +7 | Ability: Intelligence')
    expect(result).toContain('Spell Slots: 1: 3/4 | 2: 2/3')
    expect(result).toContain('Prepared Spells: Magic Missile')
  })

  it('formats known spells when no prepared spells', () => {
    const result = formatCharacterForContext(
      makeCharacter({
        spellcasting: { spellSaveDC: 13, spellAttackBonus: 5, ability: 'Charisma' },
        spellSlotLevels: {},
        preparedSpellIds: [],
        knownSpells: [{ id: 'eldritch-blast', name: 'Eldritch Blast' }]
      })
    )
    expect(result).toContain('Known Spells: Eldritch Blast')
  })

  it('formats class resources', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Class Resources: Second Wind: 1/1')
  })

  it('formats hit dice', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Hit Dice Remaining: 5/5 (5/5d10)')
  })

  it('formats equipped armor', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Equipped Armor: Chain Mail (AC +16)')
  })

  it('formats weapons', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Weapons: Battleaxe (1d8+3 slashing, +6 to hit)')
  })

  it('formats currency (skips zero values)', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Currency: 50 gp, 10 sp, 5 cp')
    expect(result).not.toContain(' pp')
    expect(result).not.toContain(' ep')
  })

  it('formats species traits separately from other features', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Species Traits:')
    expect(result).toContain('Darkvision')
    expect(result).toContain('Features: Action Surge')
  })

  it('formats feats', () => {
    const result = formatCharacterForContext(makeCharacter())
    expect(result).toContain('Feats: Great Weapon Master')
  })

  it('formats conditions when present', () => {
    const result = formatCharacterForContext(
      makeCharacter({ conditions: [{ name: 'Poisoned' }, { name: 'Exhaustion', value: 2 }] })
    )
    expect(result).toContain('Active Conditions: Poisoned, Exhaustion 2')
  })

  it('formats death saves when HP is 0', () => {
    const result = formatCharacterForContext(
      makeCharacter({
        hitPoints: { current: 0, maximum: 50, temporary: 0 },
        deathSaves: { successes: 2, failures: 1 }
      })
    )
    expect(result).toContain('Death Saves: 2 successes / 1 failures')
  })

  it('formats heroic inspiration', () => {
    const result = formatCharacterForContext(makeCharacter({ heroicInspiration: true }))
    expect(result).toContain('Heroic Inspiration: Yes')
  })

  it('formats resistances and immunities', () => {
    const result = formatCharacterForContext(
      makeCharacter({
        resistances: ['poison'],
        immunities: ['fire'],
        vulnerabilities: ['cold']
      })
    )
    expect(result).toContain('Resistances: poison')
    expect(result).toContain('Immunities: fire')
    expect(result).toContain('Vulnerabilities: cold')
  })

  it('formats multiclass characters', () => {
    const result = formatCharacterForContext(
      makeCharacter({
        classes: [
          { name: 'Fighter', subclass: 'Champion', level: 3 },
          { name: 'Rogue', subclass: 'Thief', level: 2 }
        ]
      })
    )
    expect(result).toContain('Fighter (Champion) 3 / Rogue (Thief) 2')
  })
})

describe('formatCharacterAbbreviated', () => {
  it('formats name, HP, and AC', () => {
    const result = formatCharacterAbbreviated(makeCharacter())
    expect(result).toBe('Thorin: HP 40/50 AC 18')
  })

  it('includes conditions when present', () => {
    const result = formatCharacterAbbreviated(
      makeCharacter({ conditions: [{ name: 'Poisoned' }, { name: 'Exhaustion', value: 3 }] })
    )
    expect(result).toContain('Conditions: Poisoned, Exhaustion 3')
  })

  it('omits conditions section when empty', () => {
    const result = formatCharacterAbbreviated(makeCharacter())
    expect(result).not.toContain('Conditions')
  })
})
