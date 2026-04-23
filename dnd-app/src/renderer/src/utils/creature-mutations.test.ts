import { describe, expect, it, vi } from 'vitest'
import type { GameMap, MapToken } from '../types/map'
import { applyCreatureMutations } from './creature-mutations'

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'tok-1',
    entityId: 'ent-1',
    entityType: 'enemy',
    label: 'Goblin',
    gridX: 5,
    gridY: 5,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    currentHP: 20,
    maxHP: 20,
    ...overrides
  }
}

function makeMap(tokens: MapToken[]): GameMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    campaignId: 'camp-1',
    imagePath: '/test.png',
    width: 1000,
    height: 1000,
    grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#ffffff', opacity: 0.3, type: 'square' },
    tokens,
    fogOfWar: { enabled: false, revealedCells: [] },
    terrain: [],
    createdAt: '2024-01-01'
  }
}

describe('applyCreatureMutations', () => {
  it('returns all changes as not-applied when activeMap is null', () => {
    const changes = [{ type: 'creature_damage', targetLabel: 'Goblin', value: 5 }]
    const updateToken = vi.fn()

    const results = applyCreatureMutations(changes, null, updateToken)

    expect(results).toHaveLength(1)
    expect(results[0].applied).toBe(false)
    expect(results[0].reason).toBe('No active map')
    expect(updateToken).not.toHaveBeenCalled()
  })

  it('returns not-applied when change has no targetLabel', () => {
    const map = makeMap([makeToken()])
    const changes = [{ type: 'creature_damage', value: 5 }]
    const updateToken = vi.fn()

    const results = applyCreatureMutations(changes, map, updateToken)

    expect(results[0].applied).toBe(false)
    expect(results[0].reason).toBe('No targetLabel')
  })

  it('returns not-applied when token is not found by label', () => {
    const map = makeMap([makeToken({ label: 'Goblin' })])
    const changes = [{ type: 'creature_damage', targetLabel: 'Dragon', value: 5 }]
    const updateToken = vi.fn()

    const results = applyCreatureMutations(changes, map, updateToken)

    expect(results[0].applied).toBe(false)
    expect(results[0].reason).toContain('Token not found')
  })

  it('finds tokens by case-insensitive label match', () => {
    const map = makeMap([makeToken({ label: 'Goblin Boss' })])
    const changes = [{ type: 'creature_damage', targetLabel: 'goblin boss', value: 3 }]
    const updateToken = vi.fn()

    const results = applyCreatureMutations(changes, map, updateToken)

    expect(results[0].applied).toBe(true)
  })

  // ─── creature_damage ───────────────────────────────────────

  describe('creature_damage', () => {
    it('reduces token HP by the specified value', () => {
      const token = makeToken({ currentHP: 20, maxHP: 20 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_damage', targetLabel: 'Goblin', value: 5 }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 15 })
    })

    it('does not reduce HP below 0', () => {
      const token = makeToken({ currentHP: 3, maxHP: 20 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_damage', targetLabel: 'Goblin', value: 10 }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 0 })
    })

    it('handles undefined currentHP as 0', () => {
      const token = makeToken({ currentHP: undefined, maxHP: 20 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_damage', targetLabel: 'Goblin', value: 5 }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 0 })
    })

    it('handles undefined value as 0 damage', () => {
      const token = makeToken({ currentHP: 10 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_damage', targetLabel: 'Goblin' }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 10 })
    })
  })

  // ─── creature_heal ────────────────────────────────────────

  describe('creature_heal', () => {
    it('increases token HP by the specified value', () => {
      const token = makeToken({ currentHP: 10, maxHP: 20 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_heal', targetLabel: 'Goblin', value: 5 }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 15 })
    })

    it('does not exceed maxHP', () => {
      const token = makeToken({ currentHP: 18, maxHP: 20 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_heal', targetLabel: 'Goblin', value: 10 }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 20 })
    })

    it('treats undefined maxHP as current HP (no cap increase)', () => {
      const token = makeToken({ currentHP: 5, maxHP: undefined })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_heal', targetLabel: 'Goblin', value: 3 }], map, updateToken)

      // maxHP fallback is current HP (5), so min(5, 5+3) = 5
      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 5 })
    })
  })

  // ─── creature_add_condition ───────────────────────────────

  describe('creature_add_condition', () => {
    it('adds a new condition to the token', () => {
      const token = makeToken({ conditions: [] })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations(
        [{ type: 'creature_add_condition', targetLabel: 'Goblin', name: 'Poisoned' }],
        map,
        updateToken
      )

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', {
        conditions: ['Poisoned']
      })
    })

    it('does not duplicate an existing condition', () => {
      const token = makeToken({ conditions: ['Poisoned'] })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations(
        [{ type: 'creature_add_condition', targetLabel: 'Goblin', name: 'Poisoned' }],
        map,
        updateToken
      )

      // updateToken should not be called with conditions that include duplicates
      // The function doesn't call updateToken if condition already exists (name matches exactly)
      expect(updateToken).not.toHaveBeenCalled()
    })

    it('handles empty condition name gracefully', () => {
      const token = makeToken({ conditions: [] })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_add_condition', targetLabel: 'Goblin', name: '' }], map, updateToken)

      // Empty name means the condition is not added
      expect(updateToken).not.toHaveBeenCalled()
    })
  })

  // ─── creature_remove_condition ────────────────────────────

  describe('creature_remove_condition', () => {
    it('removes a condition from the token (case-insensitive)', () => {
      const token = makeToken({ conditions: ['Poisoned', 'Prone'] })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations(
        [{ type: 'creature_remove_condition', targetLabel: 'Goblin', name: 'poisoned' }],
        map,
        updateToken
      )

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', {
        conditions: ['Prone']
      })
    })

    it('does nothing harmful when condition does not exist', () => {
      const token = makeToken({ conditions: ['Prone'] })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations(
        [{ type: 'creature_remove_condition', targetLabel: 'Goblin', name: 'Blinded' }],
        map,
        updateToken
      )

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', {
        conditions: ['Prone']
      })
    })
  })

  // ─── creature_kill ────────────────────────────────────────

  describe('creature_kill', () => {
    it('sets token HP to 0', () => {
      const token = makeToken({ currentHP: 50 })
      const map = makeMap([token])
      const updateToken = vi.fn()

      applyCreatureMutations([{ type: 'creature_kill', targetLabel: 'Goblin' }], map, updateToken)

      expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 0 })
    })
  })

  // ─── Unknown type ─────────────────────────────────────────

  describe('unknown change type', () => {
    it('returns not-applied with reason for unknown types', () => {
      const map = makeMap([makeToken()])
      const updateToken = vi.fn()

      const results = applyCreatureMutations([{ type: 'creature_fly', targetLabel: 'Goblin' }], map, updateToken)

      expect(results[0].applied).toBe(false)
      expect(results[0].reason).toContain('Unknown creature change type')
      expect(updateToken).not.toHaveBeenCalled()
    })
  })

  // ─── Multiple changes ────────────────────────────────────

  describe('multiple changes', () => {
    it('processes all changes in order', () => {
      const token = makeToken({ currentHP: 20, maxHP: 20, conditions: [] })
      const map = makeMap([token])
      const updateToken = vi.fn()

      const changes = [
        { type: 'creature_damage', targetLabel: 'Goblin', value: 5 },
        { type: 'creature_add_condition', targetLabel: 'Goblin', name: 'Poisoned' },
        { type: 'creature_heal', targetLabel: 'Goblin', value: 2 }
      ]

      const results = applyCreatureMutations(changes, map, updateToken)

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.applied)).toBe(true)
      expect(updateToken).toHaveBeenCalledTimes(3)
    })
  })
})
