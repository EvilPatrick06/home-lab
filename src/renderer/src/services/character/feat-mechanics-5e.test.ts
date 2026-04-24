import { describe, expect, it } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import type { FeatMechanic } from './feat-mechanics-5e'
import { getActiveFeatMechanics, getDamageTypeFeatEffects } from './feat-mechanics-5e'

// Helper to create a minimal Character5e with specified feats
function makeCharacter(
  feats: Array<{ id: string; name: string; description: string }>,
  level: number = 5
): Character5e {
  return {
    level,
    feats
  } as unknown as Character5e
}

describe('getActiveFeatMechanics', () => {
  it('returns empty array for character with no feats', () => {
    const char = makeCharacter([])
    expect(getActiveFeatMechanics(char)).toEqual([])
  })

  it('returns empty array when feats is undefined', () => {
    const char = { level: 5 } as unknown as Character5e
    expect(getActiveFeatMechanics(char)).toEqual([])
  })

  it('returns Lucky mechanic with correct proficiency-based Luck Points', () => {
    // Level 5: proficiency bonus = ceil(5/4)+1 = 3
    const char = makeCharacter([{ id: 'lucky', name: 'Lucky', description: '' }], 5)
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(1)
    expect(mechanics[0].featId).toBe('lucky')
    expect(mechanics[0].trigger).toBe('resource')
    expect(mechanics[0].description).toContain('3 Luck Points')
  })

  it('Lucky scales with level (level 1 = 2 Luck Points)', () => {
    // Level 1: proficiency bonus = ceil(1/4)+1 = 2
    const char = makeCharacter([{ id: 'lucky', name: 'Lucky', description: '' }], 1)
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].description).toContain('2 Luck Points')
  })

  it('Lucky scales with level (level 17 = 6 Luck Points)', () => {
    // Level 17: proficiency bonus = ceil(17/4)+1 = 6
    const char = makeCharacter([{ id: 'lucky', name: 'Lucky', description: '' }], 17)
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].description).toContain('6 Luck Points')
  })

  it('returns Savage Attacker mechanic with on_damage trigger', () => {
    const char = makeCharacter([{ id: 'savage-attacker', name: 'Savage Attacker', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(1)
    expect(mechanics[0].trigger).toBe('on_damage')
    expect(mechanics[0].perTurn).toBe(true)
  })

  it('returns Crusher mechanic with on_hit trigger', () => {
    const char = makeCharacter([{ id: 'crusher', name: 'Crusher', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(1)
    expect(mechanics[0].trigger).toBe('on_hit')
    expect(mechanics[0].description).toContain('bludgeoning')
  })

  it('returns Piercer mechanic with on_crit trigger and perTurn', () => {
    const char = makeCharacter([{ id: 'piercer', name: 'Piercer', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(1)
    expect(mechanics[0].trigger).toBe('on_crit')
    expect(mechanics[0].perTurn).toBe(true)
  })

  it('returns Slasher mechanic with on_hit trigger', () => {
    const char = makeCharacter([{ id: 'slasher', name: 'Slasher', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(1)
    expect(mechanics[0].trigger).toBe('on_hit')
    expect(mechanics[0].description).toContain('slashing')
  })

  it('returns Sentinel mechanic with reaction trigger', () => {
    const char = makeCharacter([{ id: 'sentinel', name: 'Sentinel', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(1)
    expect(mechanics[0].trigger).toBe('reaction')
    expect(mechanics[0].description).toContain('opportunity attack')
  })

  it('returns Defensive Duelist with proficiency bonus in AC description', () => {
    // Level 9: proficiency bonus = ceil(9/4)+1 = 4
    const char = makeCharacter([{ id: 'defensive-duelist', name: 'Defensive Duelist', description: '' }], 9)
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].trigger).toBe('reaction')
    expect(mechanics[0].description).toContain('+4 AC')
  })

  it('returns Dual Wielder mechanic with passive trigger', () => {
    const char = makeCharacter([{ id: 'dual-wielder', name: 'Dual Wielder', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].trigger).toBe('passive')
    expect(mechanics[0].description).toContain('+1 AC')
  })

  it('returns Elemental Adept mechanic with on_damage trigger', () => {
    const char = makeCharacter([{ id: 'elemental-adept', name: 'Elemental Adept', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].trigger).toBe('on_damage')
  })

  it('returns Crossbow Expert mechanic with passive trigger', () => {
    const char = makeCharacter([{ id: 'crossbow-expert', name: 'Crossbow Expert', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].trigger).toBe('passive')
    expect(mechanics[0].description).toContain('Loading')
  })

  it('returns Charger mechanic with on_hit trigger', () => {
    const char = makeCharacter([{ id: 'charger', name: 'Charger', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].trigger).toBe('on_hit')
    expect(mechanics[0].description).toContain('Dash')
  })

  it('returns Durable mechanic with passive trigger', () => {
    const char = makeCharacter([{ id: 'durable', name: 'Durable', description: '' }])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics[0].trigger).toBe('passive')
    expect(mechanics[0].description).toContain('Death Saving Throws')
  })

  it('returns multiple mechanics for a character with many feats', () => {
    const char = makeCharacter([
      { id: 'lucky', name: 'Lucky', description: '' },
      { id: 'sentinel', name: 'Sentinel', description: '' },
      { id: 'crusher', name: 'Crusher', description: '' }
    ])
    const mechanics = getActiveFeatMechanics(char)
    expect(mechanics).toHaveLength(3)
    const ids = mechanics.map((m) => m.featId)
    expect(ids).toContain('lucky')
    expect(ids).toContain('sentinel')
    expect(ids).toContain('crusher')
  })

  it('ignores unknown feat IDs', () => {
    const char = makeCharacter([{ id: 'homebrew-feat', name: 'Homebrew', description: '' }])
    expect(getActiveFeatMechanics(char)).toEqual([])
  })
})

describe('FeatMechanic type', () => {
  it('getActiveFeatMechanics returns objects conforming to FeatMechanic shape', () => {
    const char = makeCharacter([{ id: 'lucky', name: 'Lucky', description: '' }], 5)
    const mechanics = getActiveFeatMechanics(char)
    const mechanic: FeatMechanic = mechanics[0]
    expect(mechanic.featId).toBe('lucky')
    expect(mechanic.name).toBe('Lucky')
    expect(mechanic.trigger).toBe('resource')
    expect(typeof mechanic.description).toBe('string')
  })

  it('FeatMechanic perTurn is optional and correctly typed', () => {
    const passive: FeatMechanic = {
      featId: 'dual-wielder',
      name: 'Dual Wielder',
      trigger: 'passive',
      description: '+1 AC when wielding two weapons.'
    }
    expect(passive.perTurn).toBeUndefined()

    const perTurnMechanic: FeatMechanic = {
      featId: 'savage-attacker',
      name: 'Savage Attacker',
      trigger: 'on_damage',
      description: 'Reroll melee weapon damage dice once per turn.',
      perTurn: true
    }
    expect(perTurnMechanic.perTurn).toBe(true)
  })

  it('FeatMechanic trigger covers all supported trigger values', () => {
    const triggers: FeatMechanic['trigger'][] = [
      'on_hit',
      'on_crit',
      'on_miss',
      'on_damage',
      'on_attack',
      'passive',
      'reaction',
      'resource'
    ]
    expect(triggers).toHaveLength(8)
    for (const t of triggers) {
      expect(typeof t).toBe('string')
    }
  })
})

describe('getDamageTypeFeatEffects', () => {
  it('returns empty array when character has no feats', () => {
    const char = makeCharacter([])
    expect(getDamageTypeFeatEffects(char, 'bludgeoning', false)).toEqual([])
  })

  it('returns Crusher push effect on bludgeoning hit', () => {
    const char = makeCharacter([{ id: 'crusher', name: 'Crusher', description: '' }])
    const effects = getDamageTypeFeatEffects(char, 'bludgeoning', false)
    expect(effects).toHaveLength(1)
    expect(effects[0].feat).toBe('Crusher')
    expect(effects[0].effect).toContain('Push')
  })

  it('returns Crusher push AND crit advantage on bludgeoning crit', () => {
    const char = makeCharacter([{ id: 'crusher', name: 'Crusher', description: '' }])
    const effects = getDamageTypeFeatEffects(char, 'bludgeoning', true)
    expect(effects).toHaveLength(2)
    expect(effects[0].feat).toBe('Crusher')
    expect(effects[1].feat).toBe('Crusher (Crit)')
    expect(effects[1].effect).toContain('Advantage')
  })

  it('returns no Crusher effects for slashing damage', () => {
    const char = makeCharacter([{ id: 'crusher', name: 'Crusher', description: '' }])
    expect(getDamageTypeFeatEffects(char, 'slashing', false)).toEqual([])
  })

  it('returns Piercer extra die on piercing crit', () => {
    const char = makeCharacter([{ id: 'piercer', name: 'Piercer', description: '' }])
    const effects = getDamageTypeFeatEffects(char, 'piercing', true)
    expect(effects).toHaveLength(1)
    expect(effects[0].feat).toBe('Piercer (Crit)')
    expect(effects[0].effect).toContain('additional damage die')
  })

  it('returns no Piercer effects on normal piercing hit (no crit)', () => {
    const char = makeCharacter([{ id: 'piercer', name: 'Piercer', description: '' }])
    expect(getDamageTypeFeatEffects(char, 'piercing', false)).toEqual([])
  })

  it('returns Slasher speed reduction on slashing hit', () => {
    const char = makeCharacter([{ id: 'slasher', name: 'Slasher', description: '' }])
    const effects = getDamageTypeFeatEffects(char, 'slashing', false)
    expect(effects).toHaveLength(1)
    expect(effects[0].effect).toContain('speed')
  })

  it('returns Slasher speed AND disadvantage on slashing crit', () => {
    const char = makeCharacter([{ id: 'slasher', name: 'Slasher', description: '' }])
    const effects = getDamageTypeFeatEffects(char, 'slashing', true)
    expect(effects).toHaveLength(2)
    expect(effects[1].feat).toBe('Slasher (Crit)')
    expect(effects[1].effect).toContain('Disadvantage')
  })

  it('returns no effects for fire damage type (none of the three feats apply)', () => {
    const char = makeCharacter([
      { id: 'crusher', name: 'Crusher', description: '' },
      { id: 'piercer', name: 'Piercer', description: '' },
      { id: 'slasher', name: 'Slasher', description: '' }
    ])
    expect(getDamageTypeFeatEffects(char, 'fire', false)).toEqual([])
  })

  it('handles undefined feats array', () => {
    const char = { level: 5 } as unknown as Character5e
    expect(getDamageTypeFeatEffects(char, 'bludgeoning', false)).toEqual([])
  })
})
