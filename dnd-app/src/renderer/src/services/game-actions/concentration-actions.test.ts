import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-conc' })

vi.mock('../game/token-stats', () => ({ getCreatureSaveMod: vi.fn(() => 2) }))
vi.mock('../combat/concentration-manager', () => ({ checkConcentrationOnDamage: vi.fn() }))

import { checkConcentrationOnDamage } from '../combat/concentration-manager'
import { executeConcentrationCheck, executeSetConcentration } from './concentration-actions'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

const mockConc = vi.mocked(checkConcentrationOnDamage)

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return { setConcentrating: vi.fn(), turnStates: {}, ...overrides } as unknown as GameStoreSnapshot
}
function makeMap(): ActiveMap {
  return { id: 'm', tokens: [{ id: 't1', entityId: 'e1', label: 'Aria', conditions: [] }] } as unknown as ActiveMap
}

let stores: StoreAccessors
let addChatMessage: ReturnType<typeof vi.fn>
beforeEach(() => {
  addChatMessage = vi.fn()
  stores = {
    getGameStore: vi.fn(),
    getLobbyStore: vi.fn(() => ({ getState: () => ({ addChatMessage }) })),
    getNetworkStore: vi.fn(() => ({ getState: () => ({ sendMessage: vi.fn() }) }))
  } as unknown as StoreAccessors
})

describe('concentration-actions', () => {
  it('set_concentration sets a spell', () => {
    const gs = makeGameStore()
    executeSetConcentration(
      { action: 'set_concentration', entityLabel: 'Aria', spell: 'Bless' } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.setConcentrating).toHaveBeenCalledWith('e1', 'Bless')
  })

  it('set_concentration with no/empty spell clears it', () => {
    const gs = makeGameStore()
    executeSetConcentration(
      { action: 'set_concentration', entityLabel: 'Aria', spell: '  ' } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.setConcentrating).toHaveBeenCalledWith('e1', undefined)
  })

  it('concentration_check is a no-op when the creature is not concentrating', () => {
    const gs = makeGameStore()
    executeConcentrationCheck(
      { action: 'concentration_check', entityLabel: 'Aria', damageTaken: 10 } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(mockConc).not.toHaveBeenCalled()
    expect(gs.setConcentrating).not.toHaveBeenCalled()
  })

  it('concentration_check breaks concentration on a failed save', () => {
    const gs = makeGameStore({ turnStates: { e1: { entityId: 'e1', concentratingSpell: 'Bless' } } })
    mockConc.mockReturnValueOnce({
      needsCheck: true,
      result: { dc: 10, roll: 4, maintained: false, spell: 'Bless', summary: 'Aria loses concentration on Bless' }
    } as never)
    executeConcentrationCheck(
      { action: 'concentration_check', entityLabel: 'Aria', damageTaken: 10 } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(mockConc).toHaveBeenCalled()
    expect(gs.setConcentrating).toHaveBeenCalledWith('e1', undefined)
  })

  it('concentration_check keeps concentration on a successful save', () => {
    const gs = makeGameStore({ turnStates: { e1: { entityId: 'e1', concentratingSpell: 'Bless' } } })
    mockConc.mockReturnValueOnce({
      needsCheck: true,
      result: { dc: 10, roll: 18, maintained: true, spell: 'Bless', summary: 'Aria holds concentration on Bless' }
    } as never)
    executeConcentrationCheck(
      { action: 'concentration_check', entityLabel: 'Aria', damageTaken: 10 } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.setConcentrating).not.toHaveBeenCalled()
  })
})
