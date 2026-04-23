import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock stores ────────────────────────────────────────────────

const mockAddCombatLogEntry = vi.fn()
const mockAddChatMessage = vi.fn()
const mockSendMessage = vi.fn()

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      round: 3,
      addCombatLogEntry: mockAddCombatLogEntry
    }))
  }
}))

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      addChatMessage: mockAddChatMessage
    }))
  }
}))

vi.mock('../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      sendMessage: mockSendMessage
    }))
  }
}))

import { broadcastCombatResult, logCombatEntry } from './combat-log'

// ─── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logCombatEntry', () => {
  it('calls addCombatLogEntry on the game store', () => {
    logCombatEntry({
      type: 'damage',
      sourceEntityName: 'Fighter',
      targetEntityName: 'Goblin',
      description: 'Fighter hits Goblin for 12 damage'
    })
    expect(mockAddCombatLogEntry).toHaveBeenCalledTimes(1)
  })

  it('adds id, timestamp, and round from game store state', () => {
    logCombatEntry({
      type: 'attack',
      description: 'Sword attack'
    })

    const call = mockAddCombatLogEntry.mock.calls[0][0]
    expect(call.id).toBeDefined()
    expect(typeof call.id).toBe('string')
    expect(call.timestamp).toBeGreaterThan(0)
    expect(call.round).toBe(3)
  })

  it('preserves all provided entry fields', () => {
    logCombatEntry({
      type: 'damage',
      sourceEntityId: 'src-1',
      sourceEntityName: 'Fighter',
      targetEntityId: 'tgt-1',
      targetEntityName: 'Goblin',
      value: 12,
      damageType: 'slashing',
      description: 'Fighter hits Goblin for 12 slashing damage'
    })

    const call = mockAddCombatLogEntry.mock.calls[0][0]
    expect(call.type).toBe('damage')
    expect(call.sourceEntityId).toBe('src-1')
    expect(call.sourceEntityName).toBe('Fighter')
    expect(call.targetEntityId).toBe('tgt-1')
    expect(call.targetEntityName).toBe('Goblin')
    expect(call.value).toBe(12)
    expect(call.damageType).toBe('slashing')
    expect(call.description).toBe('Fighter hits Goblin for 12 slashing damage')
  })
})

describe('broadcastCombatResult', () => {
  it('adds a system chat message to the lobby store', () => {
    broadcastCombatResult('Fighter hits Goblin', false)

    expect(mockAddChatMessage).toHaveBeenCalledTimes(1)
    const msg = mockAddChatMessage.mock.calls[0][0]
    expect(msg.senderId).toBe('system')
    expect(msg.senderName).toBe('Combat')
    expect(msg.content).toBe('Fighter hits Goblin')
    expect(msg.isSystem).toBe(true)
  })

  it('sends a network message with the combat summary', () => {
    broadcastCombatResult('Fighter hits Goblin', false)

    expect(mockSendMessage).toHaveBeenCalledWith('chat:message', {
      message: 'Fighter hits Goblin',
      isSystem: true
    })
  })

  it('does nothing when isSecret is true', () => {
    broadcastCombatResult('Secret damage roll', true)

    expect(mockAddChatMessage).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('chat message has a unique id with combat prefix', () => {
    broadcastCombatResult('Test message', false)

    const msg = mockAddChatMessage.mock.calls[0][0]
    expect(msg.id).toMatch(/^combat-/)
  })

  it('chat message has a timestamp', () => {
    broadcastCombatResult('Test message', false)

    const msg = mockAddChatMessage.mock.calls[0][0]
    expect(msg.timestamp).toBeGreaterThan(0)
  })
})
