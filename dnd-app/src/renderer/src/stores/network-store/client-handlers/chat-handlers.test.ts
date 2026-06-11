import { beforeEach, describe, expect, it, vi } from 'vitest'

// PHASE-09 09G — handleMapPing renders a visual ping in addition to the chat line.
const mocks = vi.hoisted(() => ({
  addChatMessage: vi.fn(),
  createPing: vi.fn(),
  gameState: {
    activeMapId: 'map-1' as string | null,
    maps: [{ id: 'map-1', grid: { cellSize: 50 }, tokens: [] }]
  }
}))

vi.mock('../../use-lobby-store', () => ({
  useLobbyStore: { getState: vi.fn(() => ({ addChatMessage: mocks.addChatMessage })) }
}))
vi.mock('../../use-game-store', () => ({
  useGameStore: { getState: vi.fn(() => mocks.gameState) }
}))
vi.mock('../../use-macro-store', () => ({
  useMacroStore: { getState: vi.fn(() => ({ importMacros: vi.fn() })) }
}))
vi.mock('../../../services/map/map-utils', () => ({ createPing: mocks.createPing }))

import { handleMapPing } from './chat-handlers'

// biome-ignore lint/suspicious/noExplicitAny: minimal NetworkMessage shape for the handler under test
function pingMsg(gridX: number, gridY: number, label?: string): any {
  return { type: 'game:map-ping', senderId: 'peer-9', senderName: 'Bob', payload: { gridX, gridY, label } }
}

describe('handleMapPing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.gameState.activeMapId = 'map-1'
    mocks.gameState.maps = [{ id: 'map-1', grid: { cellSize: 50 }, tokens: [] }]
  })

  it('posts a chat line and renders the visual ping at converted coords', () => {
    handleMapPing(pingMsg(2, 3))
    expect(mocks.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('pinged the map at (2, 3)') })
    )
    // cellSize 50 → world (2*50+25, 3*50+25) = (125, 175)
    expect(mocks.createPing).toHaveBeenCalledWith(125, 175, 'Bob')
  })

  it('includes the label in the chat line when present', () => {
    handleMapPing(pingMsg(1, 1, 'over here'))
    expect(mocks.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('over here') })
    )
  })

  it('posts only the chat line when there is no active map loaded', () => {
    mocks.gameState.activeMapId = null
    handleMapPing(pingMsg(2, 3))
    expect(mocks.addChatMessage).toHaveBeenCalled()
    expect(mocks.createPing).not.toHaveBeenCalled()
  })
})
