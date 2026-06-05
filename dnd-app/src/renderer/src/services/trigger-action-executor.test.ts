import { describe, expect, it, vi } from 'vitest'

const addChatMessage = vi.fn()
const setAmbientLight = vi.fn()

vi.mock('../stores/use-lobby-store', () => ({ useLobbyStore: { getState: () => ({ addChatMessage }) } }))
vi.mock('../stores/use-game-store', () => ({
  useGameStore: { getState: () => ({ setAmbientLight, maps: [], activeMapId: null }) }
}))
vi.mock('../utils/logger', () => ({ logger: { warn: vi.fn() } }))

import { executeTriggerAction } from './trigger-action-executor'

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
})
