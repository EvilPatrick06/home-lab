import { describe, expect, it } from 'vitest'
import type { HaggleResponsePayload } from './types'

describe('message-types', () => {
  it('exports MESSAGE_TYPES as a readonly tuple', async () => {
    const mod = await import('./message-types')
    expect(mod.MESSAGE_TYPES).toBeDefined()
    expect(Array.isArray(mod.MESSAGE_TYPES)).toBe(true)
    expect(mod.MESSAGE_TYPES.length).toBeGreaterThan(0)
  })

  it('MESSAGE_TYPES includes core message types', async () => {
    const { MESSAGE_TYPES } = await import('./message-types')
    const types = [...MESSAGE_TYPES]
    expect(types).toContain('player:join')
    expect(types).toContain('player:leave')
    expect(types).toContain('chat:message')
    expect(types).toContain('game:state-update')
    expect(types).toContain('game:state-full')
    expect(types).toContain('dm:map-change')
    expect(types).toContain('dm:kick-player')
    expect(types).toContain('dm:ban-player')
    expect(types).toContain('ping')
    expect(types).toContain('pong')
  })

  it('KNOWN_MESSAGE_TYPES is a Set containing all MESSAGE_TYPES', async () => {
    const { MESSAGE_TYPES, KNOWN_MESSAGE_TYPES } = await import('./message-types')
    expect(KNOWN_MESSAGE_TYPES).toBeInstanceOf(Set)
    expect(KNOWN_MESSAGE_TYPES.size).toBe(MESSAGE_TYPES.length)
    for (const type of MESSAGE_TYPES) {
      expect(KNOWN_MESSAGE_TYPES.has(type)).toBe(true)
    }
  })

  it('KNOWN_MESSAGE_TYPES does not contain unknown types', async () => {
    const { KNOWN_MESSAGE_TYPES } = await import('./message-types')
    expect(KNOWN_MESSAGE_TYPES.has('unknown:type')).toBe(false)
    expect(KNOWN_MESSAGE_TYPES.has('')).toBe(false)
  })

  it('NetworkMessage interface is structurally valid', () => {
    const msg: import('./message-types').NetworkMessage = {
      type: 'chat:message',
      payload: { message: 'hello' },
      senderId: 'peer-1',
      senderName: 'Alice',
      timestamp: Date.now(),
      sequence: 0
    }
    expect(msg.type).toBe('chat:message')
    expect(msg.senderId).toBe('peer-1')
    expect(msg.senderName).toBe('Alice')
    expect(typeof msg.timestamp).toBe('number')
    expect(msg.sequence).toBe(0)
  })

  it('JoinPayload interface satisfies expected shape', () => {
    const payload: import('./message-types').JoinPayload = {
      displayName: 'Alice',
      characterId: 'char-1',
      characterName: 'Elara'
    }
    expect(payload.displayName).toBe('Alice')
    expect(payload.characterId).toBe('char-1')
    expect(payload.characterName).toBe('Elara')
  })

  it('JoinPayload allows null characterId and characterName', () => {
    const payload: import('./message-types').JoinPayload = {
      displayName: 'Bob',
      characterId: null,
      characterName: null
    }
    expect(payload.characterId).toBeNull()
    expect(payload.characterName).toBeNull()
  })

  it('ChatPayload interface satisfies expected shape', () => {
    const payload: import('./message-types').ChatPayload = {
      message: 'Hello world',
      isSystem: false,
      isDiceRoll: true,
      diceResult: { formula: '1d20', total: 15, rolls: [15] }
    }
    expect(payload.message).toBe('Hello world')
    expect(payload.diceResult?.total).toBe(15)
  })

  it('DiceResultPayload interface satisfies expected shape', () => {
    const payload: import('./message-types').DiceResultPayload = {
      formula: '2d6+3',
      rolls: [4, 5],
      total: 12,
      isCritical: false,
      isFumble: false,
      rollerName: 'Alice'
    }
    expect(payload.total).toBe(12)
    expect(payload.rolls).toEqual([4, 5])
    expect(payload.rollerName).toBe('Alice')
  })

  it('TokenMovePayload interface satisfies expected shape', () => {
    const payload: import('./message-types').TokenMovePayload = {
      mapId: 'map-1',
      tokenId: 'tok-1',
      gridX: 5,
      gridY: 10
    }
    expect(payload.mapId).toBe('map-1')
    expect(payload.gridX).toBe(5)
  })

  it('TradeRequestPayload interface satisfies expected shape', () => {
    const payload: import('./message-types').TradeRequestPayload = {
      tradeId: 'trade-1',
      fromPeerId: 'peer-1',
      fromPlayerName: 'Alice',
      toPeerId: 'peer-2',
      offeredItems: [{ name: 'Sword', quantity: 1 }],
      offeredGold: 50,
      requestedItems: [{ name: 'Shield', quantity: 1 }],
      requestedGold: 0
    }
    expect(payload.tradeId).toBe('trade-1')
    expect(payload.offeredItems).toHaveLength(1)
  })

  it('ReactionPromptPayload interface satisfies expected shape', () => {
    const payload: import('./message-types').ReactionPromptPayload = {
      promptId: 'prompt-1',
      targetEntityId: 'entity-1',
      targetPeerId: 'peer-1',
      triggerType: 'shield',
      triggerContext: { attackRoll: 18, attackerName: 'Goblin' }
    }
    expect(payload.triggerType).toBe('shield')
    expect(payload.triggerContext.attackRoll).toBe(18)
  })

  it('HaggleResponsePayload interface satisfies expected shape', () => {
    const payload: HaggleResponsePayload = {
      itemId: 'item-1',
      accepted: true,
      discountPercent: 15,
      newPrice: { gp: 85 },
      targetPeerId: 'peer-1'
    }
    expect(payload.accepted).toBe(true)
    expect(payload.discountPercent).toBe(15)
  })

  it('MESSAGE_TYPES has no duplicates', async () => {
    const { MESSAGE_TYPES } = await import('./message-types')
    const unique = new Set(MESSAGE_TYPES)
    expect(unique.size).toBe(MESSAGE_TYPES.length)
  })
})
