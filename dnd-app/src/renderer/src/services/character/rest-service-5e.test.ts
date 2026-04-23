import { describe, expect, it } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import {
  applyLongRest,
  applyShortRest,
  getLongRestPreview,
  getShortRestPreview,
  rollShortRestDice
} from './rest-service-5e'

// Minimal character factory for rest tests
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
      constitution: 14, // +2 mod
      intelligence: 10,
      wisdom: 12,
      charisma: 8
    },
    hitPoints: { current: 20, maximum: 44, temporary: 0 },
    hitDice: [{ current: 3, maximum: 5, dieType: 10 }],
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

describe('getShortRestPreview', () => {
  it('returns hit die pool for single class', () => {
    const char = makeCharacter()
    const preview = getShortRestPreview(char)
    expect(preview.hitDiePools).toHaveLength(1)
    expect(preview.hitDiePools[0].dieSize).toBe(10)
    expect(preview.hitDiePools[0].remaining).toBe(3)
    expect(preview.hitDiePools[0].total).toBe(5)
  })

  it('returns CON modifier', () => {
    const char = makeCharacter()
    const preview = getShortRestPreview(char)
    expect(preview.conMod).toBe(2) // CON 14 → +2
  })

  it('identifies Warlock pact slots', () => {
    const char = makeCharacter({
      pactMagicSlotLevels: { 3: { current: 0, max: 2 } }
    })
    const preview = getShortRestPreview(char)
    expect(preview.warlockPactSlots).not.toBeNull()
    expect(preview.warlockPactSlots?.max).toBe(2)
    expect(preview.warlockPactSlots?.current).toBe(0)
  })

  it('identifies Arcane Recovery for wizards', () => {
    const char = makeCharacter({
      classes: [{ name: 'Wizard', level: 6, hitDie: 6, subclass: undefined }]
    })
    const preview = getShortRestPreview(char)
    expect(preview.arcaneRecoveryEligible).toBe(true)
    expect(preview.arcaneRecoverySlotsToRecover).toBe(3) // ceil(6/2)
    expect(preview.arcaneRecoveryMaxSlotLevel).toBe(3) // min(5, ceil(6/2))
  })

  it('identifies restoring class resources', () => {
    const char = makeCharacter({
      classResources: [{ id: 'second-wind', name: 'Second Wind', current: 0, max: 1, shortRestRestore: 'all' }]
    })
    const preview = getShortRestPreview(char)
    expect(preview.restorableClassResources).toHaveLength(1)
    expect(preview.restorableClassResources[0].name).toBe('Second Wind')
  })
})

describe('rollShortRestDice', () => {
  it('returns the correct number of rolls', () => {
    const rolls = rollShortRestDice(3, 10, 2)
    expect(rolls).toHaveLength(3)
  })

  it('each roll has minimum healing of 1', () => {
    // Even with negative CON mod, minimum 1
    const rolls = rollShortRestDice(20, 6, -5)
    for (const roll of rolls) {
      expect(roll.healing).toBeGreaterThanOrEqual(1)
    }
  })

  it('healing = rawRoll + conMod (min 1)', () => {
    const rolls = rollShortRestDice(1, 8, 3)
    expect(rolls[0].healing).toBe(Math.max(1, rolls[0].rawRoll + 3))
  })
})

describe('applyShortRest', () => {
  it('heals character by dice total', () => {
    const char = makeCharacter({ hitPoints: { current: 20, maximum: 44, temporary: 0 } })
    const diceRolls = [{ dieSize: 10, rawRoll: 6, conMod: 2, healing: 8 }]
    const result = applyShortRest(char, diceRolls)
    expect(result.totalHealing).toBe(8)
    expect(result.character.hitPoints.current).toBe(28) // 20 + 8
  })

  it('does not exceed max HP', () => {
    const char = makeCharacter({ hitPoints: { current: 40, maximum: 44, temporary: 0 } })
    const diceRolls = [{ dieSize: 10, rawRoll: 8, conMod: 2, healing: 10 }]
    const result = applyShortRest(char, diceRolls)
    expect(result.character.hitPoints.current).toBe(44)
  })

  it('decrements hit dice remaining', () => {
    const char = makeCharacter({ hitDice: [{ current: 3, maximum: 5, dieType: 10 }] })
    const diceRolls = [
      { dieSize: 10, rawRoll: 5, conMod: 2, healing: 7 },
      { dieSize: 10, rawRoll: 6, conMod: 2, healing: 8 }
    ]
    const result = applyShortRest(char, diceRolls)
    expect(result.character.hitDice[0].current).toBe(1) // 3 - 2
  })

  it('restores Warlock pact slots to max', () => {
    const char = makeCharacter({
      pactMagicSlotLevels: { 3: { current: 0, max: 2 } }
    })
    const result = applyShortRest(char, [])
    expect(result.character.pactMagicSlotLevels?.[3]?.current).toBe(2)
    expect(result.resourcesRestored).toContain('Pact Magic Slots')
  })

  it('restores class resources with shortRestRestore', () => {
    const char = makeCharacter({
      classResources: [{ id: 'action-surge', name: 'Action Surge', current: 0, max: 1, shortRestRestore: 'all' }]
    })
    const result = applyShortRest(char, [])
    expect(result.character.classResources?.[0]?.current).toBe(1)
    expect(result.resourcesRestored).toContain('Action Surge')
  })
})

describe('getLongRestPreview', () => {
  it('reports HP and HD status', () => {
    const char = makeCharacter({
      hitPoints: { current: 20, maximum: 44, temporary: 0 },
      hitDice: [{ current: 3, maximum: 5, dieType: 10 }]
    })
    const preview = getLongRestPreview(char)
    expect(preview.currentHP).toBe(20)
    expect(preview.maxHP).toBe(44)
    expect(preview.currentHD).toBe(3)
    expect(preview.maxHD).toBe(5)
  })

  it('reports exhaustion reduction when exhausted', () => {
    const char = makeCharacter({
      conditions: [{ name: 'Exhaustion', type: 'condition', isCustom: false, value: 2 }]
    })
    const preview = getLongRestPreview(char)
    expect(preview.exhaustionReduction).toBe(true)
    expect(preview.currentExhaustionLevel).toBe(2)
  })

  it('reports heroic inspiration for humans', () => {
    const char = makeCharacter({ species: 'Human' })
    expect(getLongRestPreview(char).heroicInspirationGain).toBe(true)
  })

  it('no heroic inspiration for non-humans', () => {
    const char = makeCharacter({ species: 'Elf' })
    expect(getLongRestPreview(char).heroicInspirationGain).toBe(false)
  })

  it('identifies spell slots to restore', () => {
    const char = makeCharacter({
      spellSlotLevels: { 1: { current: 1, max: 4 }, 2: { current: 3, max: 3 } }
    })
    const preview = getLongRestPreview(char)
    expect(preview.spellSlotsToRestore).toHaveLength(1) // only L1 needs restore
    expect(preview.spellSlotsToRestore[0].level).toBe(1)
  })
})

describe('applyLongRest', () => {
  it('restores HP to maximum', () => {
    const char = makeCharacter({ hitPoints: { current: 10, maximum: 44, temporary: 0 } })
    const result = applyLongRest(char)
    expect(result.character.hitPoints.current).toBe(44)
    expect(result.hpRestored).toBe(34)
  })

  it('restores up to half total hit dice (2024 PHB rule)', () => {
    const char = makeCharacter({ hitDice: [{ current: 2, maximum: 5, dieType: 10 }] })
    const result = applyLongRest(char)
    // floor(5/2) = 2 HD budget; 3 spent, so restores 2
    expect(result.character.hitDice[0].current).toBe(4)
    expect(result.hdRestored).toBe(2)
  })

  it('restores all spell slots to max', () => {
    const char = makeCharacter({
      spellSlotLevels: { 1: { current: 1, max: 4 }, 2: { current: 0, max: 3 } }
    })
    const result = applyLongRest(char)
    expect(result.character.spellSlotLevels[1]?.current).toBe(4)
    expect(result.character.spellSlotLevels[2]?.current).toBe(3)
    expect(result.spellSlotsRestored).toBe(6) // (4-1) + (3-0)
  })

  it('restores all class resources', () => {
    const char = makeCharacter({
      classResources: [
        { id: 'action-surge', name: 'Action Surge', current: 0, max: 1, shortRestRestore: 'all' },
        { id: 'superiority-dice', name: 'Superiority Dice', current: 2, max: 5, shortRestRestore: 'all' }
      ]
    })
    const result = applyLongRest(char)
    expect(result.character.classResources?.[0]?.current).toBe(1)
    expect(result.character.classResources?.[1]?.current).toBe(5)
    expect(result.resourcesRestored).toContain('Action Surge')
    expect(result.resourcesRestored).toContain('Superiority Dice')
  })

  it('reduces exhaustion by 1', () => {
    const char = makeCharacter({
      conditions: [{ name: 'Exhaustion', type: 'condition', isCustom: false, value: 3 }]
    })
    const result = applyLongRest(char)
    const exhaustion = result.character.conditions?.find((c) => c.name === 'Exhaustion')
    expect(exhaustion?.value).toBe(2)
    expect(result.exhaustionReduced).toBe(true)
  })

  it('removes exhaustion condition when reduced to 0', () => {
    const char = makeCharacter({
      conditions: [{ name: 'Exhaustion', type: 'condition', isCustom: false, value: 1 }]
    })
    const result = applyLongRest(char)
    const exhaustion = result.character.conditions?.find((c) => c.name === 'Exhaustion')
    expect(exhaustion).toBeUndefined()
  })

  it('resets death saves', () => {
    const char = makeCharacter({ deathSaves: { successes: 2, failures: 1 } })
    const result = applyLongRest(char)
    expect(result.character.deathSaves).toEqual({ successes: 0, failures: 0 })
  })

  it('grants heroic inspiration to humans', () => {
    const char = makeCharacter({ species: 'Human' })
    const result = applyLongRest(char)
    expect(result.heroicInspirationGranted).toBe(true)
    expect(result.character.heroicInspiration).toBe(true)
  })

  it('clears temporary HP on long rest (PHB 2024)', () => {
    const char = makeCharacter({
      hitPoints: { current: 30, maximum: 44, temporary: 10 }
    })
    const result = applyLongRest(char)
    expect(result.character.hitPoints.temporary).toBe(0)
  })

  it('restores innate spell uses', () => {
    const char = makeCharacter({
      knownSpells: [
        { name: 'Burning Hands', level: 1, school: 'evocation', innateUses: { max: 1, remaining: 0 } }
      ] as unknown as import('../../types/character-common').SpellEntry[]
    })
    const result = applyLongRest(char)
    const spell = result.character.knownSpells?.find((s) => s.name === 'Burning Hands')
    expect(spell?.innateUses?.remaining).toBe(1)
  })

  it('flags High Elf cantrip swap eligibility', () => {
    const char = makeCharacter({
      buildChoices: {
        classId: 'wizard',
        backgroundId: 'sage',
        speciesId: 'elf',
        subspeciesId: 'high-elf',
        abilityScoreMethod: 'standard-array',
        selectedAbilityScores: {},
        backgroundAbilityBonuses: {},
        skillProficiencies: [],
        toolProficiencies: [],
        languageProficiencies: [],
        fightingStyleId: null,
        selections: {}
      }
    } as unknown as Partial<Character5e>)
    const result = applyLongRest(char)
    expect(result.highElfCantripSwap).toBe(true)
  })
})
