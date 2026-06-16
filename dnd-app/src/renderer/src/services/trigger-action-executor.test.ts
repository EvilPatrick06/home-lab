import { describe, expect, it, vi } from 'vitest'

const addChatMessage = vi.fn()
const setAmbientLight = vi.fn()
// Mutable game state so spawn tests can supply a map.
const gameState: { setAmbientLight: typeof setAmbientLight; maps: unknown[]; activeMapId: string | null } = {
  setAmbientLight,
  maps: [],
  activeMapId: null
}
const executeDmActions = vi.fn()

vi.mock('../stores/use-lobby-store', () => ({ useLobbyStore: { getState: () => ({ addChatMessage }) } }))
vi.mock('../stores/use-game-store', () => ({ useGameStore: { getState: () => gameState } }))
vi.mock('../utils/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('./game-action-executor', () => ({ executeDmActions }))

import { executeTriggerAction } from './trigger-action-executor'

// 10×10-cell map (cellSize 70 → width/height 700).
function withMap(): void {
  gameState.maps = [{ id: 'map-1', grid: { cellSize: 70 }, width: 700, height: 700 }]
  gameState.activeMapId = 'map-1'
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('executeTriggerAction', () => {
  it('narrate posts an AI DM chat message with the text', () => {
    addChatMessage.mockClear()
    executeTriggerAction('narrate', { text: 'The door creaks open.' })
    expect(addChatMessage).toHaveBeenCalledTimes(1)
    const m = addChatMessage.mock.calls[0][0]
    expect(m.content).toBe('The door creaks open.')
    expect(m.senderName).toBe('AI Dungeon Master')
    expect(m.isSystem).toBe(true)
  })

  it('show_message posts a System chat message', () => {
    addChatMessage.mockClear()
    executeTriggerAction('show_message', { text: 'A trap springs!' })
    expect(addChatMessage.mock.calls[0][0].senderName).toBe('System')
  })

  it('ignores empty/whitespace narrate text', () => {
    addChatMessage.mockClear()
    executeTriggerAction('narrate', { text: '   ' })
    expect(addChatMessage).not.toHaveBeenCalled()
  })

  it('change_lighting sets ambient light for a valid level', () => {
    setAmbientLight.mockClear()
    executeTriggerAction('change_lighting', { level: 'dim' })
    expect(setAmbientLight).toHaveBeenCalledWith('dim')
  })

  it('change_lighting ignores an invalid level', () => {
    setAmbientLight.mockClear()
    executeTriggerAction('change_lighting', { level: 'rainbow' })
    expect(setAmbientLight).not.toHaveBeenCalled()
  })

  describe('spawn_creature placement (PHASE-13 13D)', () => {
    it('uses the configured grid coordinates when present', async () => {
      withMap()
      executeDmActions.mockClear()
      executeTriggerAction('spawn_creature', { creatureId: 'goblin', gridX: 3, gridY: 4 })
      await tick()
      expect(executeDmActions).toHaveBeenCalledWith([
        { action: 'place_creature', creatureId: 'goblin', gridX: 3, gridY: 4 }
      ])
    })

    it('clamps out-of-bounds coordinates to the grid', async () => {
      withMap()
      executeDmActions.mockClear()
      executeTriggerAction('spawn_creature', { creatureId: 'goblin', gridX: 99, gridY: 99 })
      await tick()
      // 700/70 = 10 cells → max index 9
      expect(executeDmActions).toHaveBeenCalledWith([
        { action: 'place_creature', creatureId: 'goblin', gridX: 9, gridY: 9 }
      ])
    })

    it('falls back to the map centre when coordinates are absent', async () => {
      withMap()
      executeDmActions.mockClear()
      executeTriggerAction('spawn_creature', { creatureId: 'goblin' })
      await tick()
      expect(executeDmActions).toHaveBeenCalledWith([
        { action: 'place_creature', creatureId: 'goblin', gridX: 5, gridY: 5 }
      ])
    })
  })
})
