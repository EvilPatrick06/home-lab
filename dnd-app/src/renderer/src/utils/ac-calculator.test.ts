import { describe, expect, it } from 'vitest'
import type { Character } from '../types/character'
import { computeDynamicAC } from './ac-calculator'

// Helper to build a minimal Character for AC testing
function makeCharacter(overrides: Record<string, any> = {}): Character {
  return {
    id: 'test',
    gameSystem: 'dnd5e',
    campaignId: null,
    playerId: 'p1',
    name: 'Test',
    species: 'Human',
    classes: overrides.classes ?? [{ name: 'Fighter', level: 5 }],
    level: 5,
    background: '',
    alignment: '',
    xp: 0,
    levelingMode: 'milestone',
    abilityScores: overrides.abilityScores ?? {
      strength: 10,
      dexterity: 14, // +2 DEX mod
      constitution: 12,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    hitPoints: { current: 30, max: 30, temp: 0 },
    hitDice: [],
    armorClass: 10,
    initiative: 0,
    speed: 30,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    details: {},
    proficiencies: {},
    skills: [],
    equipment: [],
    treasure: { cp: 0, sp: 0, gp: 0, pp: 0 },
    features: [],
    knownSpells: [],
    preparedSpellIds: [],
    spellSlotLevels: {},
    classFeatures: [],
    weapons: [],
    armor: overrides.armor ?? [],
    feats: overrides.feats ?? [],
    buildChoices: {},
    status: 'active',
    campaignHistory: [],
    backstory: '',
    notes: '',
    pets: [],
    deathSaves: { successes: 0, failures: 0 },
    attunement: [],
    languageDescriptions: {}
  } as unknown as Character
}

// ─── No Armor (Unarmored) ───────────────────────────────────

describe('computeDynamicAC - unarmored', () => {
  it('returns 10 + DEX mod when no armor is equipped', () => {
    // DEX 14 = +2 mod
    const char = makeCharacter()
    expect(computeDynamicAC(char)).toBe(12)
  })

  it('handles negative DEX modifier', () => {
    const char = makeCharacter({
      abilityScores: {
        strength: 10,
        dexterity: 8,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      }
    })
    // DEX 8 = -1 mod, AC = 10 + (-1) = 9
    expect(computeDynamicAC(char)).toBe(9)
  })
})

// ─── Barbarian Unarmored Defense ────────────────────────────

describe('computeDynamicAC - Barbarian Unarmored Defense', () => {
  it('uses 10 + DEX + CON for Barbarian', () => {
    const char = makeCharacter({
      classes: [{ name: 'Barbarian', level: 5 }],
      abilityScores: {
        strength: 16,
        dexterity: 14,
        constitution: 16,
        intelligence: 8,
        wisdom: 10,
        charisma: 10
      }
    })
    // 10 + 2 (DEX) + 3 (CON) = 15
    expect(computeDynamicAC(char)).toBe(15)
  })

  it('picks the higher of standard or Barbarian formula', () => {
    const char = makeCharacter({
      classes: [{ name: 'Barbarian', level: 5 }],
      abilityScores: {
        strength: 16,
        dexterity: 20,
        constitution: 8,
        intelligence: 8,
        wisdom: 10,
        charisma: 10
      }
    })
    // Standard: 10 + 5 (DEX) = 15
    // Barbarian: 10 + 5 (DEX) + (-1) (CON) = 14
    // Should pick 15
    expect(computeDynamicAC(char)).toBe(15)
  })
})

// ─── Monk Unarmored Defense ─────────────────────────────────

describe('computeDynamicAC - Monk Unarmored Defense', () => {
  it('uses 10 + DEX + WIS for Monk (no shield)', () => {
    const char = makeCharacter({
      classes: [{ name: 'Monk', level: 5 }],
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 10,
        intelligence: 10,
        wisdom: 16,
        charisma: 10
      }
    })
    // 10 + 3 (DEX) + 3 (WIS) = 16
    expect(computeDynamicAC(char)).toBe(16)
  })

  it('does not use Monk formula when shield is equipped', () => {
    const char = makeCharacter({
      classes: [{ name: 'Monk', level: 5 }],
      armor: [{ id: 's1', name: 'Shield', acBonus: 2, equipped: true, type: 'shield' }],
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 10,
        intelligence: 10,
        wisdom: 16,
        charisma: 10
      }
    })
    // With shield equipped, Monk formula excluded
    // Standard: 10 + 3 (DEX) = 13, + 2 (shield) = 15
    // Monk formula excluded because shield is equipped
    expect(computeDynamicAC(char)).toBe(15)
  })
})

// ─── Draconic Sorcerer Unarmored Defense ────────────────────

describe('computeDynamicAC - Draconic Sorcerer', () => {
  it('uses 10 + DEX + CHA for Draconic Sorcery subclass', () => {
    const char = makeCharacter({
      classes: [{ name: 'Sorcerer', level: 5, subclass: 'Draconic Sorcery' }],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 18
      }
    })
    // Standard: 10 + 2 = 12
    // Draconic: 10 + 2 + 4 = 16
    expect(computeDynamicAC(char)).toBe(16)
  })
})

// ─── Equipped Armor ─────────────────────────────────────────

describe('computeDynamicAC - equipped armor', () => {
  it('uses armor AC + DEX for light armor (no dex cap)', () => {
    const char = makeCharacter({
      armor: [{ id: 'a1', name: 'Leather Armor', acBonus: 11, equipped: true, type: 'armor', dexCap: null }]
    })
    // 11 + 2 (full DEX) = 13
    expect(computeDynamicAC(char)).toBe(13)
  })

  it('caps DEX bonus for medium armor (dexCap = 2)', () => {
    const char = makeCharacter({
      armor: [
        { id: 'a1', name: 'Breastplate', acBonus: 14, equipped: true, type: 'armor', category: 'medium', dexCap: 2 }
      ],
      abilityScores: {
        strength: 10,
        dexterity: 18,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      }
    })
    // DEX mod = +4, but capped to 2. AC = 14 + 2 = 16
    expect(computeDynamicAC(char)).toBe(16)
  })

  it('allows 0 DEX bonus for heavy armor (dexCap = 0)', () => {
    const char = makeCharacter({
      armor: [{ id: 'a1', name: 'Plate', acBonus: 18, equipped: true, type: 'armor', category: 'heavy', dexCap: 0 }],
      abilityScores: {
        strength: 16,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      }
    })
    // dexCap = 0 means no DEX bonus. AC = 18
    expect(computeDynamicAC(char)).toBe(18)
  })

  it('adds shield AC bonus on top of armor', () => {
    const char = makeCharacter({
      armor: [
        { id: 'a1', name: 'Chain Mail', acBonus: 16, equipped: true, type: 'armor', dexCap: 0 },
        { id: 's1', name: 'Shield', acBonus: 2, equipped: true, type: 'shield' }
      ]
    })
    // 16 + 0 (DEX) + 2 (shield) = 18
    expect(computeDynamicAC(char)).toBe(18)
  })

  it('adds +1 for Defense fighting style when wearing armor', () => {
    const char = makeCharacter({
      armor: [{ id: 'a1', name: 'Chain Mail', acBonus: 16, equipped: true, type: 'armor', dexCap: 0 }],
      feats: [{ id: 'fighting-style-defense', name: 'Defense', description: '+1 AC when wearing armor' }]
    })
    // 16 + 0 + 1 (defense) = 17
    expect(computeDynamicAC(char)).toBe(17)
  })

  it('does not add Defense fighting style bonus when unarmored', () => {
    const char = makeCharacter({
      feats: [{ id: 'fighting-style-defense', name: 'Defense', description: '+1 AC' }]
    })
    // No armor equipped, Defense FS should not apply
    // 10 + 2 (DEX) = 12
    expect(computeDynamicAC(char)).toBe(12)
  })
})

// ─── Medium Armor Master ────────────────────────────────────

describe('computeDynamicAC - Medium Armor Master feat', () => {
  it('increases dex cap by 1 for medium armor', () => {
    const char = makeCharacter({
      armor: [
        { id: 'a1', name: 'Breastplate', acBonus: 14, equipped: true, type: 'armor', category: 'medium', dexCap: 2 }
      ],
      feats: [{ id: 'medium-armor-master', name: 'Medium Armor Master', description: '' }],
      abilityScores: {
        strength: 10,
        dexterity: 18,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      }
    })
    // DEX mod = +4, dexCap raised from 2 to 3. AC = 14 + 3 = 17
    expect(computeDynamicAC(char)).toBe(17)
  })

  it('does not affect heavy armor', () => {
    const char = makeCharacter({
      armor: [{ id: 'a1', name: 'Plate', acBonus: 18, equipped: true, type: 'armor', category: 'heavy', dexCap: 0 }],
      feats: [{ id: 'medium-armor-master', name: 'Medium Armor Master', description: '' }]
    })
    // Heavy armor dexCap = 0, Medium Armor Master only applies to medium armor
    expect(computeDynamicAC(char)).toBe(18)
  })
})

// ─── Shield only (no body armor) ────────────────────────────

describe('computeDynamicAC - shield only', () => {
  it('adds shield bonus to unarmored AC', () => {
    const char = makeCharacter({
      armor: [{ id: 's1', name: 'Shield', acBonus: 2, equipped: true, type: 'shield' }]
    })
    // Unarmored: 10 + 2 (DEX) + 2 (shield) = 14
    expect(computeDynamicAC(char)).toBe(14)
  })
})
