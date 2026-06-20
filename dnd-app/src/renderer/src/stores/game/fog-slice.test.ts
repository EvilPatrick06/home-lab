import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import type { GameMap } from '../../types/map'
import { useGameStore } from './index'

function makeMap(overrides: Partial<GameMap> = {}): GameMap {
  return {
    id: 'm1',
    name: 'Test Map',
    campaignId: 'c1',
    imagePath: '',
    width: 800,
    height: 600,
    grid: { cellSize: 40, offsetX: 0, offsetY: 0, enabled: true, color: '#555', opacity: 0.5, type: 'square' },
    tokens: [],
    terrain: [],
    fogOfWar: { enabled: false, revealedCells: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('fog-slice', () => {
  beforeEach(() => useGameStore.getState().reset())

  it('can be imported', async () => {
    const mod = await import('./fog-slice')
    expect(mod).toBeDefined()
  })

  it('exports createFogSlice as a function', async () => {
    const mod = await import('./fog-slice')
    expect(typeof mod.createFogSlice).toBe('function')
  })

  describe('hideFog', () => {
    it('turns fog ON when hiding on a fresh (fog-disabled) map — Hide All on a new map', () => {
      // Reproduces the bug: new maps default to { enabled: false, revealedCells: [] }.
      // "Hide All" passes the (empty) revealedCells; without the enabled flip this is a
      // total no-op and drawFogOfWar returns early, so the canvas shows no fog.
      useGameStore.getState().loadGameState({ maps: [makeMap()] })
      const map = useGameStore.getState().maps[0]
      // handleHideAll passes the map's current revealedCells (empty here).
      useGameStore.getState().hideFog(map.id, map.fogOfWar.revealedCells)
      const fog = useGameStore.getState().maps[0].fogOfWar
      expect(fog.enabled).toBe(true)
      expect(fog.revealedCells).toEqual([])
    })

    it('Hide All empties revealedCells and enables fog (previously-revealed map)', () => {
      const revealed = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      ]
      useGameStore
        .getState()
        .loadGameState({ maps: [makeMap({ fogOfWar: { enabled: true, revealedCells: revealed } })] })
      // Hide All passes exactly the currently-revealed cells.
      useGameStore.getState().hideFog('m1', useGameStore.getState().maps[0].fogOfWar.revealedCells)
      const fog = useGameStore.getState().maps[0].fogOfWar
      expect(fog.enabled).toBe(true)
      expect(fog.revealedCells).toEqual([])
    })

    it('manual fog-hide brush removes only the brushed cells and keeps fog enabled', () => {
      const revealed = [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ]
      useGameStore
        .getState()
        .loadGameState({ maps: [makeMap({ fogOfWar: { enabled: false, revealedCells: revealed } })] })
      useGameStore.getState().hideFog('m1', [{ x: 0, y: 0 }])
      const fog = useGameStore.getState().maps[0].fogOfWar
      expect(fog.enabled).toBe(true)
      expect(fog.revealedCells).toEqual([{ x: 1, y: 0 }])
    })
  })

  describe('revealFog', () => {
    it('appends new revealed cells without duplicating existing ones', () => {
      useGameStore
        .getState()
        .loadGameState({ maps: [makeMap({ fogOfWar: { enabled: true, revealedCells: [{ x: 0, y: 0 }] } })] })
      useGameStore.getState().revealFog('m1', [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ])
      const fog = useGameStore.getState().maps[0].fogOfWar
      expect(fog.revealedCells).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ])
    })
  })
})
