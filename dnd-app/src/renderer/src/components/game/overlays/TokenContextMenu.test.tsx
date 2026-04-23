import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTurnState } from '../../../stores/game/types'
import type { MapToken } from '../../../types/map'
import TokenContextMenu from './TokenContextMenu'

const mockStoreState = {
  updateToken: vi.fn(),
  removeToken: vi.fn(),
  addSidebarEntry: vi.fn(),
  allies: [],
  enemies: [],
  maps: [],
  turnStates: {}
}

vi.mock('../../../services/plugin-system/ui-extensions', () => ({
  getPluginContextMenuItems: vi.fn(() => [])
}))

vi.mock('../../../stores/use-game-store', () => ({
  useGameStore: vi.fn((selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState))
}))

function createToken(overrides: Partial<MapToken>): MapToken {
  return {
    id: 'token-1',
    entityId: 'entity-1',
    entityType: 'player',
    label: 'Token',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

function renderMenu(token: MapToken): string {
  return renderToStaticMarkup(
    <TokenContextMenu
      x={100}
      y={100}
      token={token}
      mapId="map-1"
      isDM={false}
      characterId="knight-1"
      onClose={vi.fn()}
      onEditToken={vi.fn()}
      onAddToInitiative={vi.fn()}
    />
  )
}

describe('TokenContextMenu', () => {
  beforeEach(() => {
    mockStoreState.updateToken.mockReset()
    mockStoreState.removeToken.mockReset()
    mockStoreState.addSidebarEntry.mockReset()
    mockStoreState.allies = []
    mockStoreState.enemies = []
    mockStoreState.maps = []
    mockStoreState.turnStates = {}
  })

  it('can be imported', async () => {
    const mod = await import('./TokenContextMenu')
    expect(mod).toBeDefined()
  })

  it('shows Unmount for the current character token when mounted', () => {
    const riderToken = createToken({
      id: 'rider-token',
      entityId: 'knight-1',
      label: 'Knight',
      gridX: 2,
      gridY: 2
    })
    const mountToken = createToken({
      id: 'mount-token',
      entityId: 'horse-1',
      entityType: 'npc',
      label: 'Horse',
      gridX: 2,
      gridY: 2,
      sizeX: 2,
      sizeY: 2,
      riderId: 'knight-1',
      currentHP: 19,
      maxHP: 19,
      ac: 11
    })

    mockStoreState.maps = [
      {
        id: 'map-1',
        name: 'Road',
        campaignId: 'camp-1',
        imagePath: 'road.png',
        width: 1000,
        height: 1000,
        grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 1, type: 'square' },
        tokens: [riderToken, mountToken],
        fogOfWar: { enabled: false, revealedCells: [] },
        terrain: [],
        createdAt: '2026-03-09T00:00:00.000Z'
      }
    ]
    mockStoreState.turnStates = {
      'knight-1': {
        ...createTurnState('knight-1', 30),
        mountedOn: 'mount-token',
        mountType: 'controlled'
      }
    }

    const markup = renderMenu(riderToken)

    expect(markup).toContain('Unmount')
    expect(markup).not.toContain('Mount</button>')
  })

  it('shows Unmount on the current mount without exposing DM actions', () => {
    const riderToken = createToken({
      id: 'rider-token',
      entityId: 'knight-1',
      label: 'Knight',
      gridX: 2,
      gridY: 2
    })
    const mountToken = createToken({
      id: 'mount-token',
      entityId: 'horse-1',
      entityType: 'npc',
      label: 'Horse',
      gridX: 2,
      gridY: 2,
      sizeX: 2,
      sizeY: 2,
      riderId: 'knight-1'
    })

    mockStoreState.maps = [
      {
        id: 'map-1',
        name: 'Road',
        campaignId: 'camp-1',
        imagePath: 'road.png',
        width: 1000,
        height: 1000,
        grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 1, type: 'square' },
        tokens: [riderToken, mountToken],
        fogOfWar: { enabled: false, revealedCells: [] },
        terrain: [],
        createdAt: '2026-03-09T00:00:00.000Z'
      }
    ]
    mockStoreState.turnStates = {
      'knight-1': {
        ...createTurnState('knight-1', 30),
        mountedOn: 'mount-token',
        mountType: 'controlled'
      }
    }

    const markup = renderMenu(mountToken)

    expect(markup).toContain('Unmount')
    expect(markup).not.toContain('Edit Token')
    expect(markup).not.toContain('Set HP')
    expect(markup).not.toContain('Remove Token')
    expect(markup).not.toContain('HP:')
    expect(markup).not.toContain('AC:')
  })

  it('shows Mount for a valid mount candidate token', () => {
    const riderToken = createToken({
      id: 'rider-token',
      entityId: 'knight-1',
      label: 'Knight',
      gridX: 2,
      gridY: 2
    })
    const mountToken = createToken({
      id: 'mount-token',
      entityId: 'horse-1',
      entityType: 'npc',
      label: 'Horse',
      gridX: 3,
      gridY: 2,
      sizeX: 2,
      sizeY: 2,
      currentHP: 19,
      maxHP: 19,
      ac: 11
    })

    mockStoreState.maps = [
      {
        id: 'map-1',
        name: 'Road',
        campaignId: 'camp-1',
        imagePath: 'road.png',
        width: 1000,
        height: 1000,
        grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 1, type: 'square' },
        tokens: [riderToken, mountToken],
        fogOfWar: { enabled: false, revealedCells: [] },
        terrain: [],
        createdAt: '2026-03-09T00:00:00.000Z'
      }
    ]

    const markup = renderMenu(mountToken)

    expect(markup).toContain('Mount')
    expect(markup).not.toContain('Unmount')
    expect(markup).not.toContain('Edit Token')
    expect(markup).not.toContain('Set HP')
    expect(markup).not.toContain('Remove Token')
    expect(markup).not.toContain('HP:')
    expect(markup).not.toContain('AC:')
  })

  it('does not show mount actions for unrelated tokens', () => {
    const riderToken = createToken({
      id: 'rider-token',
      entityId: 'knight-1',
      label: 'Knight',
      gridX: 2,
      gridY: 2
    })
    const unrelatedToken = createToken({
      id: 'enemy-token',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Goblin',
      gridX: 8,
      gridY: 8
    })

    mockStoreState.maps = [
      {
        id: 'map-1',
        name: 'Road',
        campaignId: 'camp-1',
        imagePath: 'road.png',
        width: 1000,
        height: 1000,
        grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 1, type: 'square' },
        tokens: [riderToken, unrelatedToken],
        fogOfWar: { enabled: false, revealedCells: [] },
        terrain: [],
        createdAt: '2026-03-09T00:00:00.000Z'
      }
    ]

    const markup = renderMenu(unrelatedToken)

    expect(markup).not.toContain('Mount')
    expect(markup).not.toContain('Unmount')
  })
})
