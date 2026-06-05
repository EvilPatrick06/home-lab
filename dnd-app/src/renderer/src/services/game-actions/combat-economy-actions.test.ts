import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-econ' })

import {
  executeSetEntityDash,
  executeSetEntityDisengage,
  executeSetEntityDodge,
  executeSetEntityHidden,
  executeSpendAction,
  executeSpendBonusAction,
  executeSpendMovement,
  executeSpendReaction
} from './combat-economy-actions'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

const gameMethods = () => ({
  setDashing: vi.fn(),
  setDisengaging: vi.fn(),
  setDodging: vi.fn(),
  setHidden: vi.fn(),
  useAction: vi.fn(),
  useBonusAction: vi.fn(),
  useReaction: vi.fn(),
  useMovement: vi.fn()
})

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
})
