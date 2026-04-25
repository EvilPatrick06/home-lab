import { describe, expect, it } from 'vitest'
import type { EntityCondition, TurnState } from '../../types/game-state'
import {
  canReact,
  checkCounterspell,
  checkOpportunityAttack,
  checkSilveryBarbs,
  executeReaction,
  getAvailableReactions,
  type ReactionPrompt,
  resolveMultipleReactions
} from './reaction-tracker'

// ─── Helpers ────────────────────────────────────────────────────

function makeTurnState(entityId: string, overrides: Partial<TurnState> = {}): TurnState {
  return {
    entityId,
    movementRemaining: 30,
    movementMax: 30,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    freeInteractionUsed: false,
    isDashing: false,
    isDisengaging: false,
    isDodging: false,
    isHidden: false,
    ...overrides
  }
}

function makeCondition(entityId: string, condition: string): EntityCondition {
  return {
    id: `cond-${entityId}-${condition}`,
    entityId,
    entityName: entityId,
    condition,
    duration: 1,
    source: 'test',
    appliedRound: 0
  }
}

// ─── canReact ───────────────────────────────────────────────────

describe('canReact', () => {
  it('returns true when reaction is unused and no blocking conditions', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    expect(canReact('fighter1', turnStates, [])).toBe(true)
  })

  it('returns false when reaction has already been used', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1', { reactionUsed: true })
    }
    expect(canReact('fighter1', turnStates, [])).toBe(false)
  })

  it('returns false when entity is Incapacitated', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const conditions = [makeCondition('fighter1', 'Incapacitated')]
    expect(canReact('fighter1', turnStates, conditions)).toBe(false)
  })

  it('returns false when entity is Stunned', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const conditions = [makeCondition('fighter1', 'Stunned')]
    expect(canReact('fighter1', turnStates, conditions)).toBe(false)
  })

  it('returns false when entity is Paralyzed', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const conditions = [makeCondition('fighter1', 'Paralyzed')]
    expect(canReact('fighter1', turnStates, conditions)).toBe(false)
  })

  it('returns false when entity is Unconscious', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const conditions = [makeCondition('fighter1', 'Unconscious')]
    expect(canReact('fighter1', turnStates, conditions)).toBe(false)
  })

  it('returns true when a different entity has a blocking condition', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1'),
      fighter2: makeTurnState('fighter2')
    }
    const conditions = [makeCondition('fighter2', 'Stunned')]
    expect(canReact('fighter1', turnStates, conditions)).toBe(true)
  })

  it('returns true when entity has a non-blocking condition (Frightened)', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const conditions = [makeCondition('fighter1', 'Frightened')]
    expect(canReact('fighter1', turnStates, conditions)).toBe(true)
  })

  it('returns true when entity has no TurnState entry (never acted yet)', () => {
    expect(canReact('fighter1', {}, [])).toBe(true)
  })
})

// ─── getAvailableReactions ──────────────────────────────────────

describe('getAvailableReactions', () => {
  describe('opportunity-attack trigger', () => {
    it('always includes basic Opportunity Attack', () => {
      const result = getAvailableReactions('opportunity-attack', [], [], false)
      expect(result).toContain('Opportunity Attack')
    })

    it('includes War Caster spell option when entity has War Caster and spell slots', () => {
      const result = getAvailableReactions('opportunity-attack', ['War Caster'], [], true)
      expect(result).toContain('War Caster: Cast a Spell')
    })

    it('does not include War Caster spell option without spell slots', () => {
      const result = getAvailableReactions('opportunity-attack', ['War Caster'], [], false)
      expect(result).not.toContain('War Caster: Cast a Spell')
    })

    it('includes Sentinel Strike when entity has Sentinel', () => {
      const result = getAvailableReactions('opportunity-attack', ['Sentinel'], [], false)
      expect(result).toContain('Sentinel Strike')
    })

    it('includes all three options for entity with War Caster, Sentinel, and spell slots', () => {
      const result = getAvailableReactions('opportunity-attack', ['War Caster', 'Sentinel'], [], true)
      expect(result).toContain('Opportunity Attack')
      expect(result).toContain('War Caster: Cast a Spell')
      expect(result).toContain('Sentinel Strike')
      expect(result).toHaveLength(3)
    })
  })

  describe('shield trigger', () => {
    it('includes Shield when entity knows Shield and has spell slots', () => {
      const result = getAvailableReactions('shield', [], ['Shield'], true)
      expect(result).toEqual(['Shield (+5 AC)'])
    })

    it('returns empty when entity knows Shield but has no spell slots', () => {
      const result = getAvailableReactions('shield', [], ['Shield'], false)
      expect(result).toEqual([])
    })

    it('returns empty when entity does not know Shield', () => {
      const result = getAvailableReactions('shield', [], ['Fireball'], true)
      expect(result).toEqual([])
    })
  })

  describe('counterspell trigger', () => {
    it('includes Counterspell when known and has slots', () => {
      const result = getAvailableReactions('counterspell', [], ['Counterspell'], true)
      expect(result).toEqual(['Counterspell'])
    })

    it('returns empty without spell slots', () => {
      const result = getAvailableReactions('counterspell', [], ['Counterspell'], false)
      expect(result).toEqual([])
    })
  })

  describe('absorb-elements trigger', () => {
    it('includes Absorb Elements when known and has slots', () => {
      const result = getAvailableReactions('absorb-elements', [], ['Absorb Elements'], true)
      expect(result).toEqual(['Absorb Elements'])
    })

    it('returns empty without spell slots', () => {
      const result = getAvailableReactions('absorb-elements', [], ['Absorb Elements'], false)
      expect(result).toEqual([])
    })
  })

  describe('sentinel trigger', () => {
    it('includes Sentinel melee attack for entity with Sentinel feat', () => {
      const result = getAvailableReactions('sentinel', ['Sentinel'], [], false)
      expect(result).toEqual(['Sentinel: Melee Attack'])
    })

    it('returns empty without Sentinel feat', () => {
      const result = getAvailableReactions('sentinel', ['War Caster'], [], false)
      expect(result).toEqual([])
    })
  })

  describe('war-caster trigger', () => {
    it('includes War Caster spell option with feature and slots', () => {
      const result = getAvailableReactions('war-caster', ['War Caster'], [], true)
      expect(result).toEqual(['War Caster: Cast a Spell'])
    })

    it('returns empty without spell slots', () => {
      const result = getAvailableReactions('war-caster', ['War Caster'], [], false)
      expect(result).toEqual([])
    })
  })

  describe('hellish-rebuke trigger', () => {
    it('includes Hellish Rebuke when known and has slots', () => {
      const result = getAvailableReactions('hellish-rebuke', [], ['Hellish Rebuke'], true)
      expect(result).toEqual(['Hellish Rebuke'])
    })

    it('returns empty without spell slots', () => {
      const result = getAvailableReactions('hellish-rebuke', [], ['Hellish Rebuke'], false)
      expect(result).toEqual([])
    })
  })

  it('feature matching is case-insensitive', () => {
    const result = getAvailableReactions('opportunity-attack', ['war caster'], [], true)
    expect(result).toContain('War Caster: Cast a Spell')
  })

  it('spell matching is case-insensitive', () => {
    const result = getAvailableReactions('shield', [], ['shield'], true)
    expect(result).toEqual(['Shield (+5 AC)'])
  })
})

// ─── checkOpportunityAttack ─────────────────────────────────────

describe('checkOpportunityAttack', () => {
  const cellSizeFt = 5

  function makeEnemy(
    overrides: Partial<{
      entityId: string
      entityName: string
      x: number
      y: number
      reach: number
      features: string[]
      isDisengaging: boolean
    }> = {}
  ) {
    return {
      entityId: 'enemy-1',
      entityName: 'Goblin',
      x: 5,
      y: 5,
      reach: 1,
      features: [],
      isDisengaging: false,
      ...overrides
    }
  }

  it('generates OA prompt when entity leaves enemy reach', () => {
    // Entity starts at (5,4) — within reach 1 of enemy at (5,5)
    // Entity moves to (5,2) — outside reach
    const enemies = [makeEnemy()]
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 2, enemies, cellSizeFt)
    expect(result).toHaveLength(1)
    expect(result[0].trigger).toBe('opportunity-attack')
    expect(result[0].entityId).toBe('enemy-1')
    expect(result[0].availableReactions).toContain('Opportunity Attack')
  })

  it('does not generate OA when entity stays within reach', () => {
    // Entity moves from (5,4) to (5,6) — both within reach of enemy at (5,5)
    const enemies = [makeEnemy()]
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 6, enemies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('does not generate OA when entity was never in reach', () => {
    // Entity moves from (5,0) to (5,1) — both far from enemy at (5,5)
    const enemies = [makeEnemy()]
    const result = checkOpportunityAttack('player-1', 5, 0, 5, 1, enemies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('skips enemies that are disengaging', () => {
    const enemies = [makeEnemy({ isDisengaging: true })]
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 2, enemies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('generates OA prompts from multiple enemies', () => {
    const enemies = [
      makeEnemy({ entityId: 'enemy-1', entityName: 'Goblin A', x: 5, y: 5 }),
      makeEnemy({ entityId: 'enemy-2', entityName: 'Goblin B', x: 6, y: 4 })
    ]
    // Entity at (5,4) is within reach of both enemies (reach 1)
    // Entity moves to (5,0) — outside reach of both
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 0, enemies, cellSizeFt)
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.entityId)).toContain('enemy-1')
    expect(result.map((p) => p.entityId)).toContain('enemy-2')
  })

  it('prompt includes trigger description with distance moved', () => {
    const enemies = [makeEnemy()]
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 2, enemies, cellSizeFt)
    expect(result[0].triggerDescription).toContain('player-1')
    expect(result[0].triggerDescription).toContain('ft')
  })

  it('prompt has correct default expiration time', () => {
    const enemies = [makeEnemy()]
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 2, enemies, cellSizeFt)
    expect(result[0].expiresInMs).toBe(15_000)
  })

  it('includes Sentinel Strike for enemy with Sentinel feat', () => {
    const enemies = [makeEnemy({ features: ['Sentinel'] })]
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 2, enemies, cellSizeFt)
    expect(result[0].availableReactions).toContain('Sentinel Strike')
  })

  it('handles 10ft reach correctly', () => {
    const enemies = [makeEnemy({ reach: 2 })]
    // Entity at (5,3) is within reach 2 of enemy at (5,5) — distance ~2 cells
    // Entity moves to (5,0) — outside reach 2
    const result = checkOpportunityAttack('player-1', 5, 3, 5, 0, enemies, cellSizeFt)
    expect(result).toHaveLength(1)
  })

  it('returns empty array when nearbyEnemies is empty', () => {
    const result = checkOpportunityAttack('player-1', 5, 4, 5, 2, [], cellSizeFt)
    expect(result).toEqual([])
  })
})

// ─── checkCounterspell ──────────────────────────────────────────

describe('checkCounterspell', () => {
  const cellSizeFt = 5

  function makeAlly(
    overrides: Partial<{
      entityId: string
      entityName: string
      x: number
      y: number
      hasCounterspell: boolean
      hasSpellSlots: boolean
    }> = {}
  ) {
    return {
      entityId: 'wizard-1',
      entityName: 'Gandalf',
      x: 5,
      y: 5,
      hasCounterspell: true,
      hasSpellSlots: true,
      ...overrides
    }
  }

  it('generates counterspell prompt for ally within 60ft', () => {
    // Caster at (0,0), ally at (5,5) — distance ~7 cells * 5ft = ~35ft (within 60ft)
    const allies = [makeAlly()]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result).toHaveLength(1)
    expect(result[0].trigger).toBe('counterspell')
    expect(result[0].availableReactions).toEqual(['Counterspell'])
  })

  it('does not generate prompt for ally beyond 60ft', () => {
    // Ally at (20, 0) — 20 cells * 5ft = 100ft (beyond 60ft range)
    const allies = [makeAlly({ x: 20, y: 0 })]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('skips ally without Counterspell', () => {
    const allies = [makeAlly({ hasCounterspell: false })]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('skips ally without spell slots', () => {
    const allies = [makeAlly({ hasSpellSlots: false })]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('includes caster info in prompt', () => {
    const allies = [makeAlly()]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result[0].sourceEntityId).toBe('badwiz-1')
    expect(result[0].sourceEntityName).toBe('Evil Mage')
    expect(result[0].triggerDescription).toContain('Evil Mage')
  })

  it('generates prompts for multiple qualifying allies', () => {
    const allies = [
      makeAlly({ entityId: 'wizard-1', entityName: 'Gandalf', x: 2, y: 0 }),
      makeAlly({ entityId: 'wizard-2', entityName: 'Dumbledore', x: 3, y: 0 })
    ]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when allies list is empty', () => {
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, [], cellSizeFt)
    expect(result).toEqual([])
  })

  it('ally at exactly 60ft (12 cells) is within range', () => {
    // Ally at (12, 0) — exactly 12 cells * 5ft = 60ft
    const allies = [makeAlly({ x: 12, y: 0 })]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result).toHaveLength(1)
  })

  it('includes distance in trigger description', () => {
    const allies = [makeAlly({ x: 6, y: 0 })]
    const result = checkCounterspell('badwiz-1', 'Evil Mage', 0, 0, allies, cellSizeFt)
    expect(result[0].triggerDescription).toContain('ft')
  })
})

// ─── checkSilveryBarbs ─────────────────────────────────────────

describe('checkSilveryBarbs', () => {
  const cellSizeFt = 5

  function makeEnemy(
    overrides: Partial<{
      entityId: string
      entityName: string
      x: number
      y: number
      hasSilveryBarbs: boolean
      hasSpellSlots: boolean
    }> = {}
  ) {
    return {
      entityId: 'wizard-1',
      entityName: 'Gandalf',
      x: 5,
      y: 5,
      hasSilveryBarbs: true,
      hasSpellSlots: true,
      ...overrides
    }
  }

  it('generates prompt when enemy with Silvery Barbs is within 60ft', () => {
    const enemies = [makeEnemy()]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result).toHaveLength(1)
    expect(result[0].trigger).toBe('silvery-barbs')
    expect(result[0].availableReactions).toEqual(['Silvery Barbs'])
  })

  it('does not generate prompt when enemy is beyond 60ft', () => {
    const enemies = [makeEnemy({ x: 20, y: 0 })]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('skips enemy without Silvery Barbs', () => {
    const enemies = [makeEnemy({ hasSilveryBarbs: false })]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('skips enemy without spell slots', () => {
    const enemies = [makeEnemy({ hasSpellSlots: false })]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result).toHaveLength(0)
  })

  it('includes source entity info in prompt', () => {
    const enemies = [makeEnemy()]
    const result = checkSilveryBarbs('orc-1', 'Orc Warlord', 0, 0, 'save', enemies, cellSizeFt)
    expect(result[0].sourceEntityId).toBe('orc-1')
    expect(result[0].sourceEntityName).toBe('Orc Warlord')
  })

  it('describes attack success type in trigger description', () => {
    const enemies = [makeEnemy()]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result[0].triggerDescription).toContain('a attack')
  })

  it('describes save success type in trigger description', () => {
    const enemies = [makeEnemy()]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'save', enemies, cellSizeFt)
    expect(result[0].triggerDescription).toContain('a save')
  })

  it('describes ability-check success type in trigger description', () => {
    const enemies = [makeEnemy()]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'ability-check', enemies, cellSizeFt)
    expect(result[0].triggerDescription).toContain('an ability check')
  })

  it('generates prompts for multiple qualifying enemies', () => {
    const enemies = [
      makeEnemy({ entityId: 'wiz-1', entityName: 'Gandalf', x: 2, y: 0 }),
      makeEnemy({ entityId: 'wiz-2', entityName: 'Merlin', x: 3, y: 0 })
    ]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when enemies list is empty', () => {
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', [], cellSizeFt)
    expect(result).toEqual([])
  })

  it('enemy at exactly 60ft (12 cells) is within range', () => {
    const enemies = [makeEnemy({ x: 12, y: 0 })]
    const result = checkSilveryBarbs('orc-1', 'Orc', 0, 0, 'attack', enemies, cellSizeFt)
    expect(result).toHaveLength(1)
  })
})

// ─── executeReaction ───────────────────────────────────────────

describe('executeReaction', () => {
  function makePrompt(overrides: Partial<ReactionPrompt> = {}): ReactionPrompt {
    return {
      id: 'reaction-1',
      entityId: 'fighter1',
      entityName: 'Fighter',
      trigger: 'opportunity-attack',
      triggerDescription: 'Goblin moves out of reach',
      availableReactions: ['Opportunity Attack'],
      expiresInMs: 15_000,
      ...overrides
    }
  }

  it('succeeds when entity has unused reaction and valid choice', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const result = executeReaction(makePrompt(), 'Opportunity Attack', turnStates)
    expect(result.success).toBe(true)
    expect(result.description).toContain('Fighter')
    expect(result.description).toContain('Opportunity Attack')
  })

  it('fails when entity has no turn state', () => {
    const result = executeReaction(makePrompt(), 'Opportunity Attack', {})
    expect(result.success).toBe(false)
    expect(result.description).toContain('no active turn state')
  })

  it('fails when reaction already used', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1', { reactionUsed: true })
    }
    const result = executeReaction(makePrompt(), 'Opportunity Attack', turnStates)
    expect(result.success).toBe(false)
    expect(result.description).toContain('already used their reaction')
  })

  it('fails when chosen reaction is not in available list', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const result = executeReaction(makePrompt(), 'Counterspell', turnStates)
    expect(result.success).toBe(false)
    expect(result.description).toContain('not available')
  })

  it('includes trigger description in success message', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const prompt = makePrompt({ triggerDescription: 'Goblin flees' })
    const result = executeReaction(prompt, 'Opportunity Attack', turnStates)
    expect(result.description).toContain('Goblin flees')
  })

  it('works with multiple available reactions choosing a valid one', () => {
    const turnStates: Record<string, TurnState> = {
      fighter1: makeTurnState('fighter1')
    }
    const prompt = makePrompt({
      availableReactions: ['Opportunity Attack', 'Sentinel Strike']
    })
    const result = executeReaction(prompt, 'Sentinel Strike', turnStates)
    expect(result.success).toBe(true)
    expect(result.description).toContain('Sentinel Strike')
  })
})

// ─── resolveMultipleReactions ──────────────────────────────────

describe('resolveMultipleReactions', () => {
  function makePrompt(entityId: string): ReactionPrompt {
    return {
      id: `reaction-${entityId}`,
      entityId,
      entityName: entityId,
      trigger: 'opportunity-attack',
      triggerDescription: 'test',
      availableReactions: ['Opportunity Attack'],
      expiresInMs: 15_000
    }
  }

  it('returns same array for 0 or 1 prompts', () => {
    expect(resolveMultipleReactions([], [], undefined)).toEqual([])

    const single = [makePrompt('a')]
    expect(resolveMultipleReactions(single, [], undefined)).toEqual(single)
  })

  it('sorts by initiative total (higher first) when no DM override', () => {
    const prompts = [makePrompt('slow'), makePrompt('fast')]
    const initiative = [
      { entityId: 'slow', total: 5 },
      { entityId: 'fast', total: 18 }
    ]
    const sorted = resolveMultipleReactions(prompts, initiative)
    expect(sorted[0].entityId).toBe('fast')
    expect(sorted[1].entityId).toBe('slow')
  })

  it('DM override order takes priority over initiative', () => {
    const prompts = [makePrompt('a'), makePrompt('b'), makePrompt('c')]
    const initiative = [
      { entityId: 'a', total: 20 },
      { entityId: 'b', total: 15 },
      { entityId: 'c', total: 10 }
    ]
    const dmOrder = ['c', 'a', 'b']
    const sorted = resolveMultipleReactions(prompts, initiative, dmOrder)
    expect(sorted[0].entityId).toBe('c')
    expect(sorted[1].entityId).toBe('a')
    expect(sorted[2].entityId).toBe('b')
  })

  it('entities not in initiative order sort to end', () => {
    const prompts = [makePrompt('unknown'), makePrompt('known')]
    const initiative = [{ entityId: 'known', total: 10 }]
    const sorted = resolveMultipleReactions(prompts, initiative)
    expect(sorted[0].entityId).toBe('known')
    expect(sorted[1].entityId).toBe('unknown')
  })

  it('entities not in DM override sort to end', () => {
    const prompts = [makePrompt('a'), makePrompt('b')]
    const initiative = [
      { entityId: 'a', total: 20 },
      { entityId: 'b', total: 10 }
    ]
    const sorted = resolveMultipleReactions(prompts, initiative, ['b'])
    expect(sorted[0].entityId).toBe('b')
    expect(sorted[1].entityId).toBe('a')
  })

  it('empty DM override array falls through to initiative order', () => {
    const prompts = [makePrompt('slow'), makePrompt('fast')]
    const initiative = [
      { entityId: 'slow', total: 5 },
      { entityId: 'fast', total: 18 }
    ]
    const sorted = resolveMultipleReactions(prompts, initiative, [])
    expect(sorted[0].entityId).toBe('fast')
    expect(sorted[1].entityId).toBe('slow')
  })

  it('does not mutate the original prompts array', () => {
    const prompts = [makePrompt('b'), makePrompt('a')]
    const initiative = [
      { entityId: 'a', total: 20 },
      { entityId: 'b', total: 10 }
    ]
    resolveMultipleReactions(prompts, initiative)
    expect(prompts[0].entityId).toBe('b')
    expect(prompts[1].entityId).toBe('a')
  })

  it('handles tied initiative values stably', () => {
    const prompts = [makePrompt('x'), makePrompt('y'), makePrompt('z')]
    const initiative = [
      { entityId: 'x', total: 15 },
      { entityId: 'y', total: 15 },
      { entityId: 'z', total: 15 }
    ]
    const sorted = resolveMultipleReactions(prompts, initiative)
    expect(sorted).toHaveLength(3)
  })
})

// ─── getAvailableReactions — uncanny-dodge & deflect-missiles ──

describe('getAvailableReactions — additional triggers', () => {
  it('uncanny-dodge returns Uncanny Dodge with the feature', () => {
    const result = getAvailableReactions('uncanny-dodge', ['Uncanny Dodge'], [], false)
    expect(result).toEqual(['Uncanny Dodge'])
  })

  it('uncanny-dodge returns empty without the feature', () => {
    const result = getAvailableReactions('uncanny-dodge', [], [], false)
    expect(result).toEqual([])
  })

  it('deflect-missiles returns Deflect Missiles with the feature', () => {
    const result = getAvailableReactions('deflect-missiles', ['Deflect Missiles'], [], false)
    expect(result).toEqual(['Deflect Missiles'])
  })

  it('deflect-missiles returns empty without the feature', () => {
    const result = getAvailableReactions('deflect-missiles', [], [], false)
    expect(result).toEqual([])
  })

  it('silvery-barbs returns Silvery Barbs with spell and slots', () => {
    const result = getAvailableReactions('silvery-barbs', [], ['Silvery Barbs'], true)
    expect(result).toEqual(['Silvery Barbs'])
  })

  it('silvery-barbs returns empty without spell slots', () => {
    const result = getAvailableReactions('silvery-barbs', [], ['Silvery Barbs'], false)
    expect(result).toEqual([])
  })

  it('returns empty array for empty features and spells', () => {
    const result = getAvailableReactions('shield', [], [], true)
    expect(result).toEqual([])
  })
})
