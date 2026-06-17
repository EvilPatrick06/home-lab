import { describe, expect, it } from 'vitest'
import type { MapToken } from '../../types/map'
import type { MonsterAction, MonsterStatBlock } from '../../types/monster'
import {
  averageRoll,
  chebyshevFt,
  expectedDamage,
  hitProbability,
  intTier,
  type MonsterTurnContext,
  type MonsterTurnStep,
  planMonsterTurn
} from './monster-turn-planner'

function sb(int: number, actions: MonsterAction[], extra: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    id: 'sb',
    name: 'Test Monster',
    size: 'Medium',
    type: 'Humanoid',
    alignment: 'neutral evil',
    ac: 13,
    hp: 20,
    hitDice: '3d8',
    speed: { walk: 30 },
    abilityScores: { str: 14, dex: 12, con: 12, int, wis: 10, cha: 8 },
    languages: [],
    cr: '1',
    xp: 200,
    proficiencyBonus: 2,
    actions,
    ...extra
  } as unknown as MonsterStatBlock
}

function tok(over: Partial<MapToken> & { id: string }): MapToken {
  return {
    entityId: over.id,
    entityType: 'player',
    label: over.id,
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    currentHP: 20,
    maxHP: 20,
    ac: 13,
    ...over
  } as unknown as MapToken
}

function ctx(
  actor: MapToken,
  statBlock: MonsterStatBlock,
  tokens: MapToken[],
  over: Partial<MonsterTurnContext> = {}
): MonsterTurnContext {
  return {
    actor,
    statBlock,
    tokens: [actor, ...tokens],
    walls: [],
    terrain: [],
    gridWidth: 30,
    gridHeight: 30,
    cellSize: 5,
    turnStates: {},
    round: 1,
    diagonalRule: 'standard',
    ...over
  }
}

const scimitar: MonsterAction = {
  name: 'Scimitar',
  description: 'melee',
  attackType: 'melee',
  toHit: 4,
  reach: 5,
  damageDice: '1d6+2',
  damageType: 'slashing'
} as MonsterAction

describe('scoring helpers', () => {
  it('intTier follows the documented thresholds', () => {
    expect(intTier(3)).toBe('mindless')
    expect(intTier(7)).toBe('low')
    expect(intTier(11)).toBe('average')
    expect(intTier(15)).toBe('clever')
    expect(intTier(16)).toBe('genius')
  })
  it('averageRoll computes the mean of a dice formula', () => {
    expect(averageRoll('2d6+3')).toBe(10) // 7 + 3
    expect(averageRoll('1d8')).toBe(4.5)
    expect(averageRoll(undefined)).toBe(0)
  })
  it('hitProbability is clamped to [0.05, 0.95]', () => {
    expect(hitProbability(5, 15)).toBeCloseTo(0.55)
    expect(hitProbability(0, 99)).toBe(0.05)
    expect(hitProbability(50, 5)).toBe(0.95)
  })
  it('expectedDamage scales damage by hit chance', () => {
    expect(expectedDamage(scimitar, 13)).toBeCloseTo(hitProbability(4, 13) * 5.5)
  })
  it('chebyshevFt is the 5-ft Chebyshev metric', () => {
    expect(chebyshevFt({ gridX: 0, gridY: 0 }, { gridX: 3, gridY: 1 })).toBe(15)
  })
})

describe('target selection by INT tier', () => {
  const actor = tok({ id: 'M', entityType: 'enemy', gridX: 5, gridY: 5, currentHP: 20, maxHP: 20 })

  it('mindless picks the nearest hostile', () => {
    const near = tok({ id: 'near', gridX: 6, gridY: 5 })
    const far = tok({ id: 'far', gridX: 5, gridY: 12, currentHP: 4, maxHP: 20 })
    const plan = planMonsterTurn(ctx(actor, sb(2, [scimitar]), [far, near]))
    expect(plan.intTier).toBe('mindless')
    expect(plan.targetTokenId).toBe('near')
  })

  it('average focuses a concentrating caster over a closer healthy target', () => {
    const caster = tok({ id: 'caster', gridX: 5, gridY: 9, currentHP: 18, maxHP: 20 })
    const bruiser = tok({ id: 'bruiser', gridX: 6, gridY: 5, currentHP: 20, maxHP: 20 })
    const plan = planMonsterTurn(
      ctx(actor, sb(10, [scimitar]), [bruiser, caster], {
        turnStates: { caster: { entityId: 'caster', concentratingSpell: 'Bless' } as never }
      })
    )
    expect(plan.intTier).toBe('average')
    expect(plan.targetTokenId).toBe('caster')
  })

  it('clever focuses the lowest-HP% hostile when none concentrate', () => {
    const hurt = tok({ id: 'hurt', gridX: 6, gridY: 5, currentHP: 3, maxHP: 20 })
    const healthy = tok({ id: 'healthy', gridX: 7, gridY: 5, currentHP: 20, maxHP: 20 })
    const plan = planMonsterTurn(ctx(actor, sb(14, [scimitar]), [healthy, hurt]))
    expect(plan.intTier).toBe('clever')
    expect(plan.targetTokenId).toBe('hurt')
  })
})

describe('attack assembly', () => {
  it('expands a Multiattack into one step per referenced action', () => {
    const actor = tok({ id: 'M', entityType: 'enemy', gridX: 5, gridY: 5 })
    const target = tok({ id: 'pc', gridX: 6, gridY: 5 })
    const multi: MonsterAction = {
      name: 'Multiattack',
      description: 'two scimitars',
      multiattackActions: ['Scimitar', 'Scimitar']
    } as MonsterAction
    const plan = planMonsterTurn(ctx(actor, sb(8, [multi, scimitar]), [target]))
    const attacks = plan.steps.filter((s): s is Extract<MonsterTurnStep, { kind: 'attack' }> => s.kind === 'attack')
    expect(attacks).toHaveLength(2)
    expect(attacks[0].targetTokenId).toBe('pc')
  })
})

describe('recharge AoE gating', () => {
  const breath: MonsterAction = {
    name: 'Acid Breath',
    description: 'cone',
    saveDC: 13,
    saveAbility: 'dexterity',
    damageDice: '4d6',
    damageType: 'acid',
    areaOfEffect: { type: 'sphere', size: 20 },
    recharge: '5-6'
  } as MonsterAction
  const bite: MonsterAction = {
    name: 'Bite',
    description: 'm',
    attackType: 'melee',
    toHit: 5,
    reach: 5,
    damageDice: '1d10+3'
  } as MonsterAction
  const actor = tok({ id: 'drake', entityType: 'enemy', gridX: 1, gridY: 1, currentHP: 40, maxHP: 40 })
  const cluster = [
    tok({ id: 'a', gridX: 10, gridY: 10 }),
    tok({ id: 'b', gridX: 11, gridY: 10 }),
    tok({ id: 'c', gridX: 10, gridY: 11 })
  ]

  it('uses a ready AoE when 3+ hostiles are caught and no allies are', () => {
    const plan = planMonsterTurn(ctx(actor, sb(10, [breath, bite]), cluster))
    const save = plan.steps.find((s) => s.kind === 'save-action')
    expect(save).toBeTruthy()
  })

  it('vetoes the AoE when a friendly would be caught (non-mindless)', () => {
    const ally = tok({ id: 'ally', entityType: 'enemy', gridX: 11, gridY: 11, currentHP: 10, maxHP: 10 })
    const plan = planMonsterTurn(ctx(actor, sb(10, [breath, bite]), [...cluster, ally]))
    expect(plan.steps.find((s) => s.kind === 'save-action')).toBeUndefined()
  })
})

describe('movement', () => {
  it('dashes when the target is unreachable within one move but reachable within two', () => {
    const actor = tok({ id: 'M', entityType: 'enemy', gridX: 1, gridY: 1, currentHP: 20, maxHP: 20 })
    // 30 ft walk = 6 cells; target ~9 cells away (needs > 6, ≤ 12 with dash).
    const target = tok({ id: 'pc', gridX: 10, gridY: 1 })
    const plan = planMonsterTurn(ctx(actor, sb(8, [scimitar]), [target]))
    expect(plan.steps.some((s) => s.kind === 'stance' && s.stance === 'dash')).toBe(true)
  })

  it('a ranged attacker steps away from an adjacent hostile before shooting', () => {
    const bow: MonsterAction = {
      name: 'Longbow',
      description: 'r',
      attackType: 'ranged',
      toHit: 5,
      rangeNormal: 150,
      damageDice: '1d8+2'
    } as MonsterAction
    const actor = tok({ id: 'archer', entityType: 'enemy', gridX: 5, gridY: 5, currentHP: 20, maxHP: 20 })
    const adjacent = tok({ id: 'pc', gridX: 6, gridY: 5 })
    const plan = planMonsterTurn(ctx(actor, sb(8, [bow]), [adjacent]))
    expect(plan.steps.some((s) => s.kind === 'move')).toBe(true)
    expect(plan.steps.some((s) => s.kind === 'attack')).toBe(true)
  })
})

describe('retreat', () => {
  it('a hurt clever creature disengages and flees', () => {
    const actor = tok({ id: 'M', entityType: 'enemy', gridX: 5, gridY: 5, currentHP: 3, maxHP: 20 })
    const pc = tok({ id: 'pc', gridX: 6, gridY: 5 })
    const plan = planMonsterTurn(ctx(actor, sb(14, [scimitar]), [pc]))
    expect(plan.retreating).toBe(true)
    expect(plan.steps.some((s) => s.kind === 'stance' && s.stance === 'disengage')).toBe(true)
  })

  it('Undead never retreat (fight to destruction)', () => {
    const actor = tok({ id: 'Z', entityType: 'enemy', gridX: 5, gridY: 5, currentHP: 2, maxHP: 20 })
    const pc = tok({ id: 'pc', gridX: 6, gridY: 5 })
    const plan = planMonsterTurn(ctx(actor, sb(8, [scimitar], { type: 'Undead' }), [pc]))
    expect(plan.retreating).toBe(false)
    expect(plan.steps.some((s) => s.kind === 'attack')).toBe(true)
  })
})

describe('no usable action', () => {
  it('returns a note-only plan for a utility-only stat block', () => {
    const utility: MonsterAction = { name: 'Change Shape', description: 'u', utility: true } as MonsterAction
    const actor = tok({ id: 'M', entityType: 'enemy', gridX: 5, gridY: 5 })
    const pc = tok({ id: 'pc', gridX: 6, gridY: 5 })
    const plan = planMonsterTurn(ctx(actor, sb(10, [utility]), [pc]))
    expect(plan.steps.some((s) => s.kind === 'attack')).toBe(false)
  })
})
