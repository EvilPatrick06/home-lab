import { describe, expect, it } from 'vitest'
import { validateNetworkMessage } from './schemas'

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'chat:message',
    payload: { message: 'Hello world' },
    senderId: 'peer-123',
    senderName: 'Alice',
    timestamp: Date.now(),
    sequence: 1,
    ...overrides
  }
}

describe('validateNetworkMessage', () => {
  it('accepts a valid chat message', () => {
    const result = validateNetworkMessage(makeMessage())
    expect(result.success).toBe(true)
  })

  it('accepts a valid join message', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'player:join',
        payload: { displayName: 'Alice', characterId: null, characterName: null }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts a valid dice roll message', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'game:dice-roll',
        payload: { formula: '2d6+3', reason: 'attack' }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts a valid dice result message', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'game:dice-result',
        payload: {
          formula: '1d20',
          rolls: [17],
          total: 17,
          isCritical: false,
          isFumble: false,
          rollerName: 'Alice'
        }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts a valid token move message', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:token-move',
        payload: { tokenId: 'tok-1', gridX: 5, gridY: 10 }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts a valid initiative update message', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:initiative-update',
        payload: {
          order: [{ id: '1', name: 'Alice', initiative: 18 }],
          currentTurnIndex: 0
        }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts a valid 3D dice roll message', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'game:dice-roll-3d',
        payload: {
          dice: [{ type: 'd20', count: 1 }],
          results: [15],
          total: 15,
          formula: '1d20',
          rollerName: 'Bob'
        }
      })
    )
    expect(result.success).toBe(true)
  })

  it('rejects null input', () => {
    const result = validateNetworkMessage(null)
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const result = validateNetworkMessage({ type: 'chat:message' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown message types', () => {
    const result = validateNetworkMessage(makeMessage({ type: 'unknown:foo' }))
    expect(result.success).toBe(false)
  })

  it('rejects oversized senderId', () => {
    const result = validateNetworkMessage(makeMessage({ senderId: 'x'.repeat(101) }))
    expect(result.success).toBe(false)
  })

  it('rejects oversized senderName', () => {
    const result = validateNetworkMessage(makeMessage({ senderName: 'x'.repeat(101) }))
    expect(result.success).toBe(false)
  })

  it('rejects invalid join payload (missing displayName)', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'player:join',
        payload: { characterId: null }
      })
    )
    expect(result.success).toBe(false)
  })

  it('rejects invalid chat payload (missing message)', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'chat:message',
        payload: {}
      })
    )
    expect(result.success).toBe(false)
  })

  it('rejects invalid token move payload (missing gridX)', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:token-move',
        payload: { tokenId: 'tok-1', gridY: 5 }
      })
    )
    expect(result.success).toBe(false)
  })

  it('allows extra fields through passthrough', () => {
    const result = validateNetworkMessage(
      makeMessage({
        payload: { message: 'Hi', extraField: 'value' },
        customMeta: 42
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts messages with no specific payload schema (ping)', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'ping',
        payload: {}
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts messages with no specific payload schema (pong)', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'pong',
        payload: {}
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts valid whisper payload', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'chat:whisper',
        payload: { message: 'secret', targetPeerId: 'peer-456', targetName: 'Bob' }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts valid kick payload', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:kick-player',
        payload: { peerId: 'peer-456', reason: 'AFK' }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts valid condition update payload', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:condition-update',
        payload: { targetId: 'char-1', condition: 'Poisoned', active: true }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts valid loot award payload', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:loot-award',
        payload: {
          items: [{ name: 'Longsword', quantity: 1 }],
          currency: { gp: 50 }
        }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts valid announcement payload', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'chat:announcement',
        payload: { message: 'Roll for initiative!', style: 'dramatic' }
      })
    )
    expect(result.success).toBe(true)
  })

  it('accepts valid map ping payload', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'game:map-ping',
        payload: { gridX: 10, gridY: 15, color: '#FF0000' }
      })
    )
    expect(result.success).toBe(true)
  })

  it('rejects invalid roll request (bad type enum)', () => {
    const result = validateNetworkMessage(
      makeMessage({
        type: 'dm:roll-request',
        payload: {
          id: 'req-1',
          type: 'invalid',
          dc: 15,
          isSecret: false,
          requesterId: 'dm',
          requesterName: 'DM'
        }
      })
    )
    expect(result.success).toBe(false)
  })
})
