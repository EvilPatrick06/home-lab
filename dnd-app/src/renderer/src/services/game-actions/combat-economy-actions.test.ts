import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-econ' })

vi.mock('./dice-helpers', () => ({ rollDiceFormula: vi.fn() }))
vi.mock('../game/token-stats', () => ({
  getTokenStats: vi.fn(() => ({ ac: 13 })),
  getCreatureSaveMod: vi.fn(() => 1)
}))
vi.mock('../combat/concentration-manager', () => ({ checkConcentrationOnDamage: vi.fn(() => ({ needsCheck: false })) }))

import { checkConcentrationOnDamage } from '../combat/concentration-manager'
import {
  executeKnockUnconscious,
  executeOpportunityAttack,
  executeSetEntityDash,
  executeSetEntityDisengage,
  executeSetEntityDodge,
  executeSetEntityHidden,
  executeSpendAction,
  executeSpendBonusAction,
  executeSpendMovement,
  executeSpendReaction
} from './combat-economy-actions'
import { rollDiceFormula } from './dice-helpers'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

const mockRoll = vi.mocked(rollDiceFormula)
const mockConc = vi.mocked(checkConcentrationOnDamage)

const gameMethods = () => ({
  setDashing: vi.fn(),
  setDisengaging: vi.fn(),
  setDodging: vi.fn(),
  setHidden: vi.fn(),
  useAction: vi.fn(),
  useBonusAction: vi.fn(),
  useReaction: vi.fn(),
  useMovement: vi.fn(),
  updateToken: vi.fn(),
  addCondition: vi.fn(),
  setConcentrating: vi.fn(),
  round: 1,
  turnStates: {}
})

function makeCombatMap(): ActiveMap {
  return {
    id: 'm',
    tokens: [
      { id: 't1', entityId: 'e1', label: 'Goblin 1', conditions: [] },
      { id: 't2', entityId: 'e2', label: 'Aria', conditions: [], currentHP: 20, ac: 13 }
    ]
  } as unknown as ActiveMap
}

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    initiative: { round: 1, currentIndex: 0, entries: [] },
    ...gameMethods(),
    ...overrides
  } as unknown as GameStoreSnapshot
}

function makeMap(): ActiveMap {
  return {
    id: 'm',
    tokens: [{ id: 't1', entityId: 'e1', label: 'Goblin 1', conditions: [] }]
  } as unknown as ActiveMap
}

let stores: StoreAccessors
let addChatMessage: ReturnType<typeof vi.fn>
let sendMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  addChatMessage = vi.fn()
  sendMessage = vi.fn()
  stores = {
    getGameStore: vi.fn(),
    getLobbyStore: vi.fn(() => ({ getState: () => ({ addChatMessage }) })),
    getNetworkStore: vi.fn(() => ({ getState: () => ({ sendMessage }) }))
  } as unknown as StoreAccessors
})

describe('combat-economy-actions', () => {
  it('set_entity_dash → setDashing(entityId) + posts + broadcasts', () => {
    const gs = makeGameStore()
    const ok = executeSetEntityDash(
      { action: 'set_entity_dash', entityLabel: 'Goblin 1' } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(ok).toBe(true)
    expect(gs.setDashing).toHaveBeenCalledWith('e1')
    expect(addChatMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith('chat:message', expect.objectContaining({ isSystem: true }))
  })

  it('set_entity_disengage → setDisengaging', () => {
    const gs = makeGameStore()
    executeSetEntityDisengage(
      { action: 'set_entity_disengage', entityLabel: 'Goblin' } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.setDisengaging).toHaveBeenCalledWith('e1')
  })

  it('set_entity_dodge → setDodging', () => {
    const gs = makeGameStore()
    executeSetEntityDodge({ action: 'set_entity_dodge', entityLabel: 'Goblin 1' } as DmAction, gs, makeMap(), stores)
    expect(gs.setDodging).toHaveBeenCalledWith('e1')
  })

  it('set_entity_hidden defaults to hidden=true', () => {
    const gs = makeGameStore()
    executeSetEntityHidden({ action: 'set_entity_hidden', entityLabel: 'Goblin 1' } as DmAction, gs, makeMap(), stores)
    expect(gs.setHidden).toHaveBeenCalledWith('e1', true)
  })

  it('set_entity_hidden honors hidden=false', () => {
    const gs = makeGameStore()
    executeSetEntityHidden(
      { action: 'set_entity_hidden', entityLabel: 'Goblin 1', hidden: false } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.setHidden).toHaveBeenCalledWith('e1', false)
  })

  it('spend_action / bonus / reaction call the matching mutators', () => {
    const gs = makeGameStore()
    const map = makeMap()
    executeSpendAction({ action: 'spend_action', entityLabel: 'Goblin 1' } as DmAction, gs, map, stores)
    executeSpendBonusAction({ action: 'spend_bonus_action', entityLabel: 'Goblin 1' } as DmAction, gs, map, stores)
    executeSpendReaction({ action: 'spend_reaction', entityLabel: 'Goblin 1' } as DmAction, gs, map, stores)
    expect(gs.useAction).toHaveBeenCalledWith('e1')
    expect(gs.useBonusAction).toHaveBeenCalledWith('e1')
    expect(gs.useReaction).toHaveBeenCalledWith('e1')
  })

  it('spend_movement deducts rounded feet', () => {
    const gs = makeGameStore()
    executeSpendMovement(
      { action: 'spend_movement', entityLabel: 'Goblin 1', feet: 15.4 } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.useMovement).toHaveBeenCalledWith('e1', 15)
  })

  it('throws when not in combat (no initiative)', () => {
    const gs = makeGameStore({ initiative: null })
    expect(() =>
      executeSetEntityDash({ action: 'set_entity_dash', entityLabel: 'Goblin 1' } as DmAction, gs, makeMap(), stores)
    ).toThrow('No active combat')
  })

  it('throws when the token label does not resolve', () => {
    const gs = makeGameStore()
    expect(() =>
      executeSetEntityDodge({ action: 'set_entity_dodge', entityLabel: 'Dragon' } as DmAction, gs, makeMap(), stores)
    ).toThrow('Token not found')
  })

  describe('opportunity_attack', () => {
    const oa = (over: Record<string, unknown> = {}) =>
      ({
        action: 'opportunity_attack',
        attackerLabel: 'Goblin 1',
        targetLabel: 'Aria',
        toHit: 4,
        damage: '1d6+2',
        ...over
      }) as DmAction

    it('on a hit: spends the attacker reaction and applies rolled damage', () => {
      mockRoll.mockImplementation((f: string) =>
        f === '1d20' ? { rolls: [15], total: 15 } : { rolls: [3, 1], total: 6 }
      )
      const gs = makeGameStore()
      const ok = executeOpportunityAttack(oa(), gs, makeCombatMap(), stores)
      expect(ok).toBe(true)
      expect(gs.useReaction).toHaveBeenCalledWith('e1') // d20 15 + 4 = 19 vs AC 13 → hit
      expect(gs.updateToken).toHaveBeenCalledWith('m', 't2', { currentHP: 14 }) // 20 - 6
    })

    it('on a miss: spends the reaction but applies no damage', () => {
      mockRoll.mockImplementation((f: string) =>
        f === '1d20' ? { rolls: [2], total: 2 } : { rolls: [3, 1], total: 6 }
      )
      const gs = makeGameStore()
      executeOpportunityAttack(oa({ toHit: 0 }), gs, makeCombatMap(), stores) // 2 + 0 = 2 vs AC 13 → miss
      expect(gs.useReaction).toHaveBeenCalledWith('e1')
      expect(gs.updateToken).not.toHaveBeenCalled()
    })

    it('on a natural 20: hits regardless of AC and doubles the damage dice', () => {
      mockRoll.mockImplementation((f: string) =>
        f === '1d20' ? { rolls: [20], total: 20 } : { rolls: [4, 2], total: 8 }
      )
      const gs = makeGameStore()
      executeOpportunityAttack(oa({ toHit: -5 }), gs, makeCombatMap(), stores)
      // hit (crit). damage total 8 (dice sum 6 + mod 2); crit adds dice sum 6 → 14. 20 - 14 = 6
      expect(gs.updateToken).toHaveBeenCalledWith('m', 't2', { currentHP: 6 })
    })

    it('rolls a concentration check when the target is concentrating and breaks it on failure', () => {
      mockRoll.mockImplementation((f: string) =>
        f === '1d20' ? { rolls: [15], total: 15 } : { rolls: [3, 1], total: 6 }
      )
      mockConc.mockReturnValueOnce({
        needsCheck: true,
        result: { dc: 10, roll: 4, maintained: false, spell: 'Bless', summary: 'Aria loses concentration on Bless' }
      } as never)
      const gs = makeGameStore({ turnStates: { e2: { entityId: 'e2', concentratingSpell: 'Bless' } } })
      executeOpportunityAttack(oa(), gs, makeCombatMap(), stores)
      expect(gs.setConcentrating).toHaveBeenCalledWith('e2', undefined)
    })

    it('throws when not in combat', () => {
      const gs = makeGameStore({ initiative: null })
      expect(() => executeOpportunityAttack(oa(), gs, makeCombatMap(), stores)).toThrow('No active combat')
    })
  })

  describe('knock_unconscious', () => {
    it('sets 0 HP, adds Unconscious, and clears concentration', () => {
      const gs = makeGameStore({ turnStates: { e2: { entityId: 'e2', concentratingSpell: 'Bless' } } })
      const ok = executeKnockUnconscious(
        { action: 'knock_unconscious', entityLabel: 'Aria' } as DmAction,
        gs,
        makeCombatMap(),
        stores
      )
      expect(ok).toBe(true)
      expect(gs.updateToken).toHaveBeenCalledWith('m', 't2', { currentHP: 0 })
      expect(gs.addCondition).toHaveBeenCalledWith(
        expect.objectContaining({ condition: 'Unconscious', entityId: 'e2' })
      )
      expect(gs.setConcentrating).toHaveBeenCalledWith('e2', undefined)
    })

    it('does not duplicate an existing Unconscious condition', () => {
      const gs = makeGameStore()
      const map = {
        id: 'm',
        tokens: [{ id: 't2', entityId: 'e2', label: 'Aria', conditions: ['Unconscious'], currentHP: 5 }]
      } as unknown as ActiveMap
      executeKnockUnconscious({ action: 'knock_unconscious', entityLabel: 'Aria' } as DmAction, gs, map, stores)
      expect(gs.addCondition).not.toHaveBeenCalled()
    })
  })
})
