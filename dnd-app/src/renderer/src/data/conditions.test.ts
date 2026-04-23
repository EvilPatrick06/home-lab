import { beforeAll, describe, expect, it, vi } from 'vitest'
import { isBloodied } from '../types/character-common'

// vi.hoisted ensures this runs before vi.mock factory
const conditionsJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(readSync(resolvePath(__dirname, '../../public/data/5e/hazards/conditions.json'), 'utf-8'))
})

// Mock load5eConditions before importing conditions module
vi.mock('../services/data-provider', () => ({
  load5eConditions: vi.fn(() => Promise.resolve(conditionsJson))
}))

// Import after mock is set up
import type { ConditionDef } from './conditions'
import { getConditions5e } from './conditions'

describe('CONDITIONS_5E — PHB 2024 accuracy', () => {
  let conditions: ConditionDef[]

  beforeAll(async () => {
    conditions = await getConditions5e()
  })

  const findCondition = (name: string) => conditions.find((c) => c.name === name)

  it('has all 15 standard conditions plus Bloodied and Burning', () => {
    const expected = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Exhaustion',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
      'Restrained',
      'Stunned',
      'Unconscious',
      'Bloodied',
      'Burning'
    ]
    for (const name of expected) {
      expect(findCondition(name), `Missing condition: ${name}`).toBeDefined()
    }
    expect(conditions.length).toBe(17)
  })

  it('Exhaustion: max level is 6 (not 10)', () => {
    const ex = findCondition('Exhaustion')!
    expect(ex.maxValue).toBe(6)
    expect(ex.hasValue).toBe(true)
    expect(ex.description).toContain('6')
    expect(ex.description).not.toContain('10')
  })

  it('Grappled: no attack penalty (2024 rule, not 2014)', () => {
    const g = findCondition('Grappled')!
    expect(g.description).not.toContain('Disadvantage')
    expect(g.description).not.toContain('attack rolls')
    expect(g.description).not.toContain('Movable')
    expect(g.description).toContain('Speed is 0')
  })

  it('Incapacitated: just actions/reactions restriction', () => {
    const i = findCondition('Incapacitated')!
    expect(i.description).toContain('actions')
    expect(i.description).toContain('Reactions')
    expect(i.description).not.toContain('Speechless')
    expect(i.description).not.toContain('Concentration')
  })

  it('Invisible: mentions Heavily Obscured', () => {
    const inv = findCondition('Invisible')!
    expect(inv.description).toContain('Heavily Obscured')
    expect(inv.description).toContain('noise')
  })

  it('Charmed: says "harmful" not "damaging"', () => {
    const c = findCondition('Charmed')!
    expect(c.description).toContain('harmful abilities')
    expect(c.description).not.toContain('damaging abilities')
  })

  it('Paralyzed: says "can\'t move or speak"', () => {
    const p = findCondition('Paralyzed')!
    expect(p.description).toContain("can't move or speak")
  })

  it('Stunned: mentions faltering speech', () => {
    const s = findCondition('Stunned')!
    expect(s.description).toContain('speak only falteringly')
  })

  it('Prone: includes melee advantage and ranged disadvantage', () => {
    const p = findCondition('Prone')!
    expect(p.description).toContain('Advantage if the attacker is within 5 feet')
    expect(p.description).toContain('Disadvantage')
  })

  it('all conditions have system dnd5e', () => {
    for (const c of conditions) {
      expect(c.system).toBe('dnd5e')
    }
  })
})

describe('isBloodied — PHB 2024', () => {
  it('returns true when HP is exactly half max', () => {
    expect(isBloodied(10, 20)).toBe(true)
  })

  it('returns true when HP is less than half max', () => {
    expect(isBloodied(5, 20)).toBe(true)
    expect(isBloodied(1, 20)).toBe(true)
  })

  it('returns false when HP is more than half max', () => {
    expect(isBloodied(11, 20)).toBe(false)
    expect(isBloodied(20, 20)).toBe(false)
  })

  it('returns false when HP is 0 (unconscious, not bloodied)', () => {
    expect(isBloodied(0, 20)).toBe(false)
  })

  it('handles odd max HP (floor division)', () => {
    // max 15 → half = 7 (floor of 7.5)
    expect(isBloodied(7, 15)).toBe(true)
    expect(isBloodied(8, 15)).toBe(false)
  })

  it('handles max HP of 1', () => {
    // max 1 → half = 0 (floor of 0.5)
    // Current must be > 0 AND <= 0 → impossible → always false
    expect(isBloodied(1, 1)).toBe(false)
    expect(isBloodied(0, 1)).toBe(false)
  })
})
