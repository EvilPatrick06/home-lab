import { describe, expect, it } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import type { CustomEffect } from '../../types/effects'
import { resolveEffects } from './effect-resolver-5e'

// Minimal character factory
function makeCharacter(overrides: Partial<Character5e> = {}): Character5e {
  return {
    id: 'test-char',
    name: 'Test',
    gameSystem: 'dnd5e',
    level: 5,
    species: 'Human',
    classes: [{ name: 'Fighter', level: 5, hitDie: 10, subclass: undefined }],
    abilityScores: {
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8
    },
    hitPoints: { current: 44, maximum: 44, temporary: 0 },
    hitDice: [{ current: 5, maximum: 5, dieType: 10 }],
    deathSaves: { successes: 0, failures: 0 },
    spellSlotLevels: {},
    pactMagicSlotLevels: {},
    classResources: [],
    speciesResources: [],
    conditions: [],
    feats: [],
    skills: [],
    knownSpells: [],
    magicItems: [],
    armor: [],
    weapons: [],
    equipment: [],
    buildChoices: {
      classId: 'fighter',
      backgroundId: 'soldier',
      speciesId: 'human',
      abilityScoreMethod: 'standard-array',
      selectedAbilityScores: {},
      backgroundAbilityBonuses: {},
      skillProficiencies: [],
      toolProficiencies: [],
      languageProficiencies: [],
      fightingStyleId: null,
      selections: {}
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  } as Character5e
}

describe('resolveEffects', () => {
  it('returns zeroed defaults for character with no effects', () => {
    const char = makeCharacter()
    const resolved = resolveEffects(char)
    expect(resolved.acBonus).toBe(0)
    expect(resolved.hpBonus).toBe(0)
    expect(resolved.speedBonus).toBe(0)
    expect(resolved.initiativeBonus).toBe(0)
    expect(resolved.spellDCBonus).toBe(0)
    expect(resolved.spellAttackBonus).toBe(0)
    expect(resolved.saveBonusAll).toBe(0)
    expect(resolved.damageReduction).toBe(0)
    expect(resolved.critPrevention).toBe(false)
    expect(resolved.resistances).toEqual([])
    expect(resolved.immunities).toEqual([])
    expect(resolved.vulnerabilities).toEqual([])
  })

  it('collects custom effects targeting the character', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'blessing',
        name: 'Blessing of Protection',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'ac_bonus', value: 2 }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.acBonus).toBe(2)
    expect(resolved.sources).toHaveLength(1)
    expect(resolved.sources[0].sourceName).toBe('Blessing of Protection')
  })

  it('ignores custom effects targeting a different character', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'curse',
        name: 'Curse',
        targetEntityId: 'other-char',
        targetEntityName: 'Other',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'ac_bonus', value: -2 }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.acBonus).toBe(0)
  })

  it('stacks multiple AC bonuses', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Shield of Faith',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'ac_bonus', value: 2 }]
      },
      {
        id: 'e2',
        name: 'Haste',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'ac_bonus', value: 2 }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.acBonus).toBe(4)
  })

  it('resolves weapon-scoped attack bonus', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Magic Weapon',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'attack_bonus', value: 1, scope: 'melee' }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.attackBonus({ isMelee: true })).toBe(1)
    expect(resolved.attackBonus({ isRanged: true })).toBe(0)
  })

  it('resolves weapon-scoped damage bonus', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Hunter Mark',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'damage_bonus', value: 2, scope: 'ranged' }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.damageBonus({ isRanged: true })).toBe(2)
    expect(resolved.damageBonus({ isMelee: true })).toBe(0)
  })

  it('collects resistances from effects', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Protection from Energy',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'resistance', stringValue: 'fire' }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.resistances).toContain('fire')
  })

  it('deduplicates resistances', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Effect 1',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'resistance', stringValue: 'fire' }]
      },
      {
        id: 'e2',
        name: 'Effect 2',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'resistance', stringValue: 'fire' }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.resistances.filter((r) => r === 'fire')).toHaveLength(1)
  })

  it('resolves hp_per_level effect', () => {
    const char = makeCharacter({ level: 10 })
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Toughness Aura',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'hp_per_level', value: 1 }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.hpBonus).toBe(10) // 1 * level(10)
  })

  it('resolves speed bonus', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Longstrider',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'speed_bonus', value: 10 }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.speedBonus).toBe(10)
  })

  it('resolves crit prevention', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Adamantine Armor',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'crit_prevention' }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.critPrevention).toBe(true)
  })

  it('resolves advantage checks', () => {
    const char = makeCharacter()
    const customEffects: CustomEffect[] = [
      {
        id: 'e1',
        name: 'Cloak of Elvenkind',
        targetEntityId: 'test-char',
        targetEntityName: 'Test',
        appliedBy: 'DM',
        duration: undefined,
        effects: [{ type: 'advantage_on', stringValue: 'stealth' }]
      }
    ]
    const resolved = resolveEffects(char, customEffects)
    expect(resolved.hasAdvantageOn('stealth')).toBe(true)
    expect(resolved.hasAdvantageOn('perception')).toBe(false)
  })
})
