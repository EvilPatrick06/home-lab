import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock broadcast helpers (postDmMessage captures the chat feedback)
vi.mock('./broadcast-helpers', () => ({
  broadcastTokenSync: vi.fn(),
  broadcastConditionSync: vi.fn(),
  postDmMessage: vi.fn()
}))

// Mock dice helpers — deterministic rolls + controllable area membership
vi.mock('./dice-helpers', () => ({
  rollDiceFormula: vi.fn(() => ({ rolls: [10], total: 10 })),
  findTokensInArea: vi.fn(() => [])
}))

// Mock name resolver — case-insensitive label match
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))

// Mock creature save mod (token-stats) used by the immediate-area path
vi.mock('../game/token-stats', () => ({
  getCreatureSaveMod: vi.fn(() => 0)
}))

vi.stubGlobal('crypto', { randomUUID: () => 'spell-uuid-1234' })

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    round: 3,
    activeSpellEffects: [],
    turnStates: {},
    addSpellEffect: vi.fn(),
    removeSpellEffect: vi.fn(),
    updateSpellEffect: vi.fn(),
    setConcentrating: vi.fn(),
    addCondition: vi.fn(),
    updateToken: vi.fn(),
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

function makeStores(): StoreAccessors {
  const sendMessage = vi.fn()
  return {
    getGameStore: vi.fn(() => ({ getState: () => ({}) })) as unknown as StoreAccessors['getGameStore'],
    getLobbyStore: vi.fn(() => ({
      getState: () => ({ addChatMessage: vi.fn() })
    })) as unknown as StoreAccessors['getLobbyStore'],
    getNetworkStore: vi.fn(() => ({
      getState: () => ({ sendMessage })
    })) as unknown as StoreAccessors['getNetworkStore']
  }
}

function makeActiveMap(
  tokens: Array<{
    id: string
    entityId: string
    label: string
    gridX?: number
    gridY?: number
    currentHP?: number
  }> = []
): ActiveMap {
  return {
    id: 'map-1',
    name: 'Test',
    tokens: tokens.map((t) => ({ gridX: 0, gridY: 0, sizeX: 1, sizeY: 1, conditions: [], ...t }))
  } as unknown as ActiveMap
}

describe('spell-effect-actions', () => {
  let stores: StoreAccessors
  beforeEach(() => {
    vi.clearAllMocks()
    stores = makeStores()
  })

  // ── executeQueryAoe (G9 preview) ──

  describe('executeQueryAoe', () => {
    it('posts a DM-only preview listing affected token labels (no mutation)', async () => {
      const { findTokensInArea } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([
        { id: 't1', label: 'Goblin 1' } as never,
        { id: 't2', label: 'Goblin 2' } as never
      ])
      const { postDmMessage } = await import('./broadcast-helpers')
      const { executeQueryAoe } = await import('./spell-effect-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = {
        action: 'query_aoe',
        shape: 'sphere',
        originX: 5,
        originY: 5,
        radiusOrLength: 20
      }

      expect(executeQueryAoe(action, gs, map, stores)).toBe(true)
      expect(gs.updateToken).not.toHaveBeenCalled()
      const [, , content, broadcast] = vi.mocked(postDmMessage).mock.calls[0]
      expect(content).toContain('Goblin 1')
      expect(content).toContain('Goblin 2')
      expect(broadcast).toBe(false) // DM-only preview
    })

    it('excludes the caster via excludeLabel', async () => {
      const { findTokensInArea } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([
        { id: 't1', label: 'Wizard' } as never,
        { id: 't2', label: 'Goblin' } as never
      ])
      const { postDmMessage } = await import('./broadcast-helpers')
      const { executeQueryAoe } = await import('./spell-effect-actions')
      const action: DmAction = {
        action: 'query_aoe',
        shape: 'sphere',
        originX: 0,
        originY: 0,
        radiusOrLength: 15,
        excludeLabel: 'Wizard'
      }
      executeQueryAoe(action, makeGameStore(), makeActiveMap(), stores)
      const content = vi.mocked(postDmMessage).mock.calls[0][2]
      expect(content).not.toContain('Wizard')
      expect(content).toContain('Goblin')
    })

    it('excludes the caster case-insensitively (08I — excludeLabel "wizard" vs token "Wizard")', async () => {
      const { findTokensInArea } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([
        { id: 't1', label: 'Wizard' } as never,
        { id: 't2', label: 'Goblin' } as never
      ])
      const { postDmMessage } = await import('./broadcast-helpers')
      const { executeQueryAoe } = await import('./spell-effect-actions')
      const action: DmAction = {
        action: 'query_aoe',
        shape: 'sphere',
        originX: 0,
        originY: 0,
        radiusOrLength: 15,
        excludeLabel: 'wizard'
      }
      executeQueryAoe(action, makeGameStore(), makeActiveMap(), stores)
      const content = vi.mocked(postDmMessage).mock.calls[0][2]
      expect(content).not.toContain('Wizard')
      expect(content).toContain('Goblin')
    })

    it('throws without an active map', async () => {
      const { executeQueryAoe } = await import('./spell-effect-actions')
      const action: DmAction = { action: 'query_aoe', shape: 'sphere', originX: 0, originY: 0, radiusOrLength: 10 }
      expect(() => executeQueryAoe(action, makeGameStore(), undefined, stores)).toThrow('No active map')
    })
  })

  // ── executeCastSpell (G11) ──

  describe('executeCastSpell', () => {
    it('registers a spell effect with caster + start round', async () => {
      const { executeCastSpell } = await import('./spell-effect-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Cleric' }])
      const action: DmAction = {
        action: 'cast_spell',
        spellName: 'Spirit Guardians',
        caster: 'Cleric',
        concentration: true
      }
      expect(executeCastSpell(action, gs, map, stores)).toBe(true)
      expect(gs.addSpellEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spirit Guardians',
          caster: 'Cleric',
          casterEntityId: 'e1',
          duration: 'concentration',
          startedRound: 3
        })
      )
    })

    it('sets caster concentration for a concentration spell', async () => {
      const { executeCastSpell } = await import('./spell-effect-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Cleric' }])
      executeCastSpell(
        { action: 'cast_spell', spellName: 'Bless', caster: 'Cleric', duration: 'concentration' },
        gs,
        map,
        stores
      )
      expect(gs.setConcentrating).toHaveBeenCalledWith('e1', 'Bless')
    })

    it('applies immediate area damage when shape + target + damageFormula given', async () => {
      const { findTokensInArea, rollDiceFormula } = await import('./dice-helpers')
      vi.mocked(findTokensInArea).mockReturnValue([
        { id: 'g1', entityId: 'ge1', label: 'Goblin', currentHP: 12 } as never
      ])
      vi.mocked(rollDiceFormula).mockReturnValue({ rolls: [8], total: 8 })
      const { executeCastSpell } = await import('./spell-effect-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 'c1', entityId: 'ce1', label: 'Wizard' }])
      const action: DmAction = {
        action: 'cast_spell',
        spellName: 'Fireball',
        caster: 'Wizard',
        shape: 'sphere',
        targetX: 10,
        targetY: 10,
        radiusOrLength: 20,
        damageFormula: '8d6',
        damageType: 'fire'
      }
      executeCastSpell(action, gs, map, stores)
      // No save given → full damage applied: 12 - 8 = 4
      expect(gs.updateToken).toHaveBeenCalledWith('map-1', 'g1', { currentHP: 4 })
    })

    it('links summoned tokens to the caster + sets expiry', async () => {
      const { executeCastSpell } = await import('./spell-effect-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([
        { id: 'c1', entityId: 'ce1', label: 'Druid' },
        { id: 'w1', entityId: 'we1', label: 'Wolf' }
      ])
      const action: DmAction = {
        action: 'cast_spell',
        spellName: 'Conjure Animals',
        caster: 'Druid',
        duration: 10,
        summonLabels: ['Wolf']
      }
      executeCastSpell(action, gs, map, stores)
      expect(gs.updateToken).toHaveBeenCalledWith(
        'map-1',
        'w1',
        expect.objectContaining({
          companionType: 'summoned',
          sourceSpell: 'Conjure Animals',
          ownerEntityId: 'ce1',
          summonExpiresRound: 13 // round 3 + 10
        })
      )
    })
  })

  // ── executeEndSpell (G11) ──

  describe('executeEndSpell', () => {
    it('removes a spell effect by name + caster and posts a clear end-spell message', async () => {
      const { executeEndSpell } = await import('./spell-effect-actions')
      const { postDmMessage } = await import('./broadcast-helpers')
      const gs = makeGameStore({
        activeSpellEffects: [{ id: 'sx', name: 'Entangle', caster: 'Druid', startedRound: 1 }]
      })
      expect(
        executeEndSpell({ action: 'end_spell', spellName: 'Entangle', caster: 'Druid' }, gs, undefined, stores)
      ).toBe(true)
      expect(gs.removeSpellEffect).toHaveBeenCalledWith('sx')
      // PHASE-12 12E — explicit event + caster attribution.
      const [, idPrefix, content] = vi.mocked(postDmMessage).mock.calls.at(-1)!
      expect(idPrefix).toBe('end-spell')
      expect(content).toBe('🛑 Spell ends: Entangle (cast by Druid).')
    })

    it('clears caster concentration when ending a concentration spell', async () => {
      const { executeEndSpell } = await import('./spell-effect-actions')
      const gs = makeGameStore({
        activeSpellEffects: [
          {
            id: 'sx',
            name: 'Hold Person',
            caster: 'Wizard',
            casterEntityId: 'we1',
            duration: 'concentration',
            startedRound: 1
          }
        ],
        turnStates: { we1: { entityId: 'we1', concentratingSpell: 'Hold Person' } }
      })
      executeEndSpell({ action: 'end_spell', spellEffectId: 'sx' }, gs, undefined, stores)
      expect(gs.setConcentrating).toHaveBeenCalledWith('we1', undefined)
    })

    it('throws when the named effect is not active', async () => {
      const { executeEndSpell } = await import('./spell-effect-actions')
      const gs = makeGameStore({ activeSpellEffects: [] })
      expect(() => executeEndSpell({ action: 'end_spell', spellName: 'Nope' }, gs, undefined, stores)).toThrow(
        'Spell effect not found'
      )
    })
  })
})
