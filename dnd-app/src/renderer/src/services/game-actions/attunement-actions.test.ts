import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./broadcast-helpers', () => ({ postDmMessage: vi.fn() }))
vi.mock('../../types/character', () => ({ is5eCharacter: () => true }))

// getEffectiveMagicItems is overridden per-test; default returns nothing.
const mockGetItems = vi.fn(() => [] as unknown[])
vi.mock('../character/effective-character-5e', () => ({
  getEffectiveMagicItems: () => mockGetItems()
}))

const saveCharacter = vi.fn()
let characters: Array<Record<string, unknown>> = []
vi.mock('../../stores/use-character-store', () => ({
  useCharacterStore: { getState: () => ({ characters, saveCharacter }) }
}))

import type { ActiveMap, GameStoreSnapshot, StoreAccessors } from './types'

const gs = {} as GameStoreSnapshot
const map = undefined as ActiveMap
const stores = {} as StoreAccessors

function makeItem(name: string, overrides: Record<string, unknown> = {}) {
  return { name, attunement: true, attuned: false, __instanceId: `inst-${name}`, ...overrides }
}

describe('attunement-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    characters = [{ id: 'c1', name: 'Aria', state: {} }]
    mockGetItems.mockReturnValue([])
  })

  describe('executeAttuneItem', () => {
    it('attunes a character to a magic item and persists', async () => {
      mockGetItems.mockReturnValue([makeItem('Flame Tongue')])
      const { executeAttuneItem } = await import('./attunement-actions')
      expect(
        executeAttuneItem({ action: 'attune_item', characterName: 'Aria', itemName: 'Flame Tongue' }, gs, map, stores)
      ).toBe(true)
      const saved = saveCharacter.mock.calls[0][0] as { state: { magicItemAttuned: Record<string, boolean> } }
      expect(saved.state.magicItemAttuned['inst-Flame Tongue']).toBe(true)
    })

    it('throws when the item does not require attunement', async () => {
      mockGetItems.mockReturnValue([makeItem('Bag of Holding', { attunement: false })])
      const { executeAttuneItem } = await import('./attunement-actions')
      expect(() =>
        executeAttuneItem({ action: 'attune_item', characterName: 'Aria', itemName: 'Bag of Holding' }, gs, map, stores)
      ).toThrow('does not require attunement')
    })

    it('enforces the 3-item attunement limit', async () => {
      mockGetItems.mockReturnValue([
        makeItem('A', { attuned: true }),
        makeItem('B', { attuned: true }),
        makeItem('C', { attuned: true }),
        makeItem('D')
      ])
      const { executeAttuneItem } = await import('./attunement-actions')
      expect(() =>
        executeAttuneItem({ action: 'attune_item', characterName: 'Aria', itemName: 'D' }, gs, map, stores)
      ).toThrow('already attuned to 3 items')
    })

    it('is a no-op when already attuned', async () => {
      mockGetItems.mockReturnValue([makeItem('Flame Tongue', { attuned: true })])
      const { executeAttuneItem } = await import('./attunement-actions')
      expect(
        executeAttuneItem({ action: 'attune_item', characterName: 'Aria', itemName: 'Flame Tongue' }, gs, map, stores)
      ).toBe(true)
      expect(saveCharacter).not.toHaveBeenCalled()
    })

    it('throws when the character is not found', async () => {
      characters = []
      const { executeAttuneItem } = await import('./attunement-actions')
      expect(() =>
        executeAttuneItem({ action: 'attune_item', characterName: 'Nobody', itemName: 'X' }, gs, map, stores)
      ).toThrow('not found')
    })
  })

  describe('executeUnattuneItem', () => {
    it('ends attunement and persists false', async () => {
      mockGetItems.mockReturnValue([makeItem('Flame Tongue', { attuned: true })])
      const { executeUnattuneItem } = await import('./attunement-actions')
      expect(
        executeUnattuneItem(
          { action: 'unattune_item', characterName: 'Aria', itemName: 'Flame Tongue' },
          gs,
          map,
          stores
        )
      ).toBe(true)
      const saved = saveCharacter.mock.calls[0][0] as { state: { magicItemAttuned: Record<string, boolean> } }
      expect(saved.state.magicItemAttuned['inst-Flame Tongue']).toBe(false)
    })
  })
})
