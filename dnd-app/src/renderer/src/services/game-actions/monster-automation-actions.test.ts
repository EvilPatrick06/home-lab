import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

vi.mock('../combat/monster-turn-executor', () => ({ runMonsterTurn: vi.fn() }))

import { runMonsterTurn } from '../combat/monster-turn-executor'
import { executeRunMonsterTurn } from './monster-automation-actions'

const gs = { initiative: { round: 1, currentIndex: 0, entries: [] } } as unknown as GameStoreSnapshot
const map = { id: 'm1', tokens: [] } as unknown as ActiveMap
const stores = {} as StoreAccessors

beforeEach(() => vi.clearAllMocks())

describe('executeRunMonsterTurn (PHASE-30 30C)', () => {
  it('delegates to the engine and returns true on success', () => {
    vi.mocked(runMonsterTurn).mockReturnValue({
      summaryLines: [],
      attacksResolved: 1,
      damageDealt: 5,
      turnAdvanced: false
    })
    const ok = executeRunMonsterTurn(
      { action: 'run_monster_turn', entityLabel: 'Goblin 1' } as DmAction,
      gs,
      map,
      stores
    )
    expect(ok).toBe(true)
    expect(runMonsterTurn).toHaveBeenCalledWith('Goblin 1', stores)
  })

  it('throws when no initiative is running', () => {
    expect(() =>
      executeRunMonsterTurn(
        { action: 'run_monster_turn', entityLabel: 'Goblin 1' } as DmAction,
        { initiative: null } as unknown as GameStoreSnapshot,
        map,
        stores
      )
    ).toThrow('No initiative running')
  })

  it('throws when the entityLabel is missing', () => {
    expect(() => executeRunMonsterTurn({ action: 'run_monster_turn' } as DmAction, gs, map, stores)).toThrow(
      'Missing entityLabel'
    )
  })

  it('surfaces an engine error as a throw (so the AI sees a failed action)', () => {
    vi.mocked(runMonsterTurn).mockReturnValue({ error: 'No stat block linked to Goblin 1' })
    expect(() =>
      executeRunMonsterTurn({ action: 'run_monster_turn', entityLabel: 'Goblin 1' } as DmAction, gs, map, stores)
    ).toThrow('No stat block linked to Goblin 1')
  })
})
