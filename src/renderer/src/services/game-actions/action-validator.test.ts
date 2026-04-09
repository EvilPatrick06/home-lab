import { describe, expect, it } from 'vitest'
import { filterValidActions, validateActionsAgainstState } from './action-validator'
import type { ActiveMap, DmAction, GameStoreSnapshot } from './types'

function makeMap(
  overrides: Partial<{
    tokens: Array<{ label: string; gridX: number; gridY: number }>
    gridWidth: number
    gridHeight: number
  }> = {}
): ActiveMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    tokens: overrides.tokens ?? [],
    gridWidth: overrides.gridWidth ?? 20,
    gridHeight: overrides.gridHeight ?? 20
  } as unknown as ActiveMap
}

function makeGameStore(
  overrides: Partial<{
    initiative: { entries: Array<{ label: string }> }
    maps: Array<{ name: string; id: string }>
  }> = {}
): GameStoreSnapshot {
  return {
    initiative: overrides.initiative ?? null,
    maps: overrides.maps ?? [{ name: 'Test Map', id: 'map-1' }]
  } as unknown as GameStoreSnapshot
}

describe('validateActionsAgainstState', () => {
  describe('place_token', () => {
    it('passes when map exists and position is in bounds', () => {
      const results = validateActionsAgainstState(
        [{ action: 'place_token', label: 'Goblin', entityType: 'enemy', gridX: 5, gridY: 5 } as DmAction],
        makeGameStore(),
        makeMap()
      )
      expect(results[0].valid).toBe(true)
    })

    it('fails when no active map', () => {
      const results = validateActionsAgainstState(
        [{ action: 'place_token', label: 'Goblin', entityType: 'enemy', gridX: 5, gridY: 5 } as DmAction],
        makeGameStore(),
        undefined
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('No active map')
    })

    it('fails when position is out of bounds', () => {
      const results = validateActionsAgainstState(
        [{ action: 'place_token', label: 'Goblin', entityType: 'enemy', gridX: 25, gridY: 5 } as DmAction],
        makeGameStore(),
        makeMap({ gridWidth: 20, gridHeight: 20 })
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('out of map bounds')
    })

    it('fails when position is negative', () => {
      const results = validateActionsAgainstState(
        [{ action: 'place_token', label: 'Goblin', entityType: 'enemy', gridX: -1, gridY: 5 } as DmAction],
        makeGameStore(),
        makeMap()
      )
      expect(results[0].valid).toBe(false)
    })
  })

  describe('move_token', () => {
    it('passes when token exists and target is in bounds', () => {
      const results = validateActionsAgainstState(
        [{ action: 'move_token', label: 'Goblin 1', gridX: 10, gridY: 10 } as DmAction],
        makeGameStore(),
        makeMap({ tokens: [{ label: 'Goblin 1', gridX: 5, gridY: 5 }] })
      )
      expect(results[0].valid).toBe(true)
    })

    it('fails when token does not exist', () => {
      const results = validateActionsAgainstState(
        [{ action: 'move_token', label: 'Ghost', gridX: 10, gridY: 10 } as DmAction],
        makeGameStore(),
        makeMap({ tokens: [{ label: 'Goblin 1', gridX: 5, gridY: 5 }] })
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('not found')
    })

    it('fails when target is out of bounds', () => {
      const results = validateActionsAgainstState(
        [{ action: 'move_token', label: 'Goblin 1', gridX: 50, gridY: 10 } as DmAction],
        makeGameStore(),
        makeMap({ tokens: [{ label: 'Goblin 1', gridX: 5, gridY: 5 }], gridWidth: 20 })
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('out of map bounds')
    })

    it('matches token label case-insensitively', () => {
      const results = validateActionsAgainstState(
        [{ action: 'move_token', label: 'goblin 1', gridX: 10, gridY: 10 } as DmAction],
        makeGameStore(),
        makeMap({ tokens: [{ label: 'Goblin 1', gridX: 5, gridY: 5 }] })
      )
      expect(results[0].valid).toBe(true)
    })
  })

  describe('remove_token', () => {
    it('passes when token exists', () => {
      const results = validateActionsAgainstState(
        [{ action: 'remove_token', label: 'Goblin 1' } as DmAction],
        makeGameStore(),
        makeMap({ tokens: [{ label: 'Goblin 1', gridX: 5, gridY: 5 }] })
      )
      expect(results[0].valid).toBe(true)
    })

    it('fails when token does not exist', () => {
      const results = validateActionsAgainstState(
        [{ action: 'remove_token', label: 'Dragon' } as DmAction],
        makeGameStore(),
        makeMap({ tokens: [] })
      )
      expect(results[0].valid).toBe(false)
    })
  })

  describe('initiative actions', () => {
    it('next_turn passes when initiative is active', () => {
      const results = validateActionsAgainstState(
        [{ action: 'next_turn' } as DmAction],
        makeGameStore({ initiative: { entries: [{ label: 'Goblin 1' }] } }),
        makeMap()
      )
      expect(results[0].valid).toBe(true)
    })

    it('next_turn fails when no initiative', () => {
      const results = validateActionsAgainstState([{ action: 'next_turn' } as DmAction], makeGameStore(), makeMap())
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('No active initiative')
    })

    it('remove_from_initiative fails when label not in initiative', () => {
      const results = validateActionsAgainstState(
        [{ action: 'remove_from_initiative', label: 'Ghost' } as DmAction],
        makeGameStore({ initiative: { entries: [{ label: 'Goblin 1' }] } }),
        makeMap()
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('not found in initiative')
    })
  })

  describe('switch_map', () => {
    it('passes when map exists', () => {
      const results = validateActionsAgainstState(
        [{ action: 'switch_map', mapName: 'Tavern' } as DmAction],
        makeGameStore({
          maps: [
            { name: 'Tavern', id: 'm1' },
            { name: 'Dungeon', id: 'm2' }
          ]
        }),
        makeMap()
      )
      expect(results[0].valid).toBe(true)
    })

    it('matches map name case-insensitively', () => {
      const results = validateActionsAgainstState(
        [{ action: 'switch_map', mapName: 'tavern' } as DmAction],
        makeGameStore({ maps: [{ name: 'Tavern', id: 'm1' }] }),
        makeMap()
      )
      expect(results[0].valid).toBe(true)
    })

    it('fails when map does not exist', () => {
      const results = validateActionsAgainstState(
        [{ action: 'switch_map', mapName: 'Moon Base' } as DmAction],
        makeGameStore({ maps: [{ name: 'Tavern', id: 'm1' }] }),
        makeMap()
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('not found')
    })
  })

  describe('fog actions', () => {
    it('passes when all cells are in bounds', () => {
      const results = validateActionsAgainstState(
        [
          {
            action: 'reveal_fog',
            cells: [
              { x: 0, y: 0 },
              { x: 19, y: 19 }
            ]
          } as DmAction
        ],
        makeGameStore(),
        makeMap({ gridWidth: 20, gridHeight: 20 })
      )
      expect(results[0].valid).toBe(true)
    })

    it('fails when some cells are out of bounds', () => {
      const results = validateActionsAgainstState(
        [
          {
            action: 'reveal_fog',
            cells: [
              { x: 5, y: 5 },
              { x: 25, y: 5 }
            ]
          } as DmAction
        ],
        makeGameStore(),
        makeMap({ gridWidth: 20, gridHeight: 20 })
      )
      expect(results[0].valid).toBe(false)
      expect(results[0].reason).toContain('out of map bounds')
    })
  })

  describe('unknown actions pass through', () => {
    it('allows actions not explicitly validated', () => {
      const results = validateActionsAgainstState(
        [
          { action: 'sound_effect', sound: 'attack-hit' } as DmAction,
          { action: 'play_ambient', loop: 'ambient-tavern' } as DmAction,
          { action: 'advance_time', hours: 8 } as DmAction
        ],
        makeGameStore(),
        makeMap()
      )
      expect(results.every((r) => r.valid)).toBe(true)
    })
  })
})

describe('filterValidActions', () => {
  it('separates valid and rejected actions', () => {
    const actions: DmAction[] = [
      { action: 'move_token', label: 'Goblin 1', gridX: 10, gridY: 10 } as DmAction,
      { action: 'remove_token', label: 'Ghost' } as DmAction,
      { action: 'next_turn' } as DmAction
    ]
    const gameStore = makeGameStore({ initiative: { entries: [{ label: 'Goblin 1' }] } })
    const map = makeMap({ tokens: [{ label: 'Goblin 1', gridX: 5, gridY: 5 }] })

    const { valid, rejected } = filterValidActions(actions, gameStore, map)
    expect(valid).toHaveLength(2)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].action.action).toBe('remove_token')
  })
})
