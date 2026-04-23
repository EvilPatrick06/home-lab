import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies before imports
vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../dice/dice-service', () => ({
  parseFormula: vi.fn((f: string) => {
    const m = f.match(/^(\d*)d(\d+)([+-]\d+)?$/)
    if (!m) return null
    return { count: m[1] ? parseInt(m[1], 10) : 1, sides: parseInt(m[2], 10), modifier: m[3] ? parseInt(m[3], 10) : 0 }
  }),
  rollMultiple: vi.fn((count: number, _sides: number) => Array.from({ length: count }, () => 4)),
  rollSingle: vi.fn(() => 10)
}))

vi.mock('../../stores/use-character-store', () => ({
  useCharacterStore: {
    getState: vi.fn(() => ({
      characters: [],
      saveCharacter: vi.fn()
    }))
  }
}))

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      updateToken: vi.fn()
    }))
  }
}))

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      players: [],
      addChatMessage: vi.fn()
    }))
  }
}))

vi.mock('../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      localPeerId: 'local',
      sendMessage: vi.fn(),
      role: 'host'
    }))
  }
}))

vi.mock('../../types/character', () => ({
  is5eCharacter: vi.fn(
    (c: unknown) =>
      !!(
        c &&
        typeof c === 'object' &&
        'system' in (c as Record<string, unknown>) &&
        (c as Record<string, unknown>).system === '5e'
      )
  )
}))

import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import {
  broadcastDiceResult,
  findTokenByName,
  generateMessageId,
  getLastRoll,
  getLatestCharacter,
  parseDiceFormula,
  rollDice,
  rollDiceFormula,
  rollSingle,
  saveAndBroadcastCharacter,
  setLastRoll
} from './helpers'

beforeEach(() => {
  vi.clearAllMocks()
  setLastRoll(null)
})

describe('parseDiceFormula', () => {
  it('parses a valid dice formula', () => {
    const result = parseDiceFormula('2d6+3')
    expect(result).toEqual({ count: 2, sides: 6, modifier: 3 })
  })

  it('returns null for invalid formula', () => {
    const result = parseDiceFormula('garbage')
    expect(result).toBeNull()
  })

  it('parses formula without modifier', () => {
    const result = parseDiceFormula('1d20')
    expect(result).toEqual({ count: 1, sides: 20, modifier: 0 })
  })
})

describe('rollDice', () => {
  it('returns array of rolls', () => {
    const result = rollDice(3, 6)
    expect(result).toHaveLength(3)
    expect(result.every((r) => typeof r === 'number')).toBe(true)
  })
})

describe('rollDiceFormula', () => {
  it('returns rolls array and total with modifier', () => {
    const result = rollDiceFormula({ count: 2, sides: 6, modifier: 3 })
    expect(result.rolls).toHaveLength(2)
    // Mock returns 4 for each roll, so total = 4+4+3 = 11
    expect(result.total).toBe(11)
  })

  it('returns rolls array and total without modifier', () => {
    const result = rollDiceFormula({ count: 1, sides: 20, modifier: 0 })
    expect(result.rolls).toHaveLength(1)
    expect(result.total).toBe(4)
  })
})

describe('rollSingle', () => {
  it('returns a number', () => {
    const result = rollSingle(20)
    expect(typeof result).toBe('number')
  })
})

describe('getLastRoll / setLastRoll', () => {
  it('initially returns null', () => {
    expect(getLastRoll()).toBeNull()
  })

  it('stores and retrieves a roll', () => {
    const roll = { formula: '1d20', rolls: [15], total: 15, rollerName: 'Tester' }
    setLastRoll(roll)
    expect(getLastRoll()).toEqual(roll)
  })

  it('can be reset to null', () => {
    setLastRoll({ formula: '1d6', rolls: [3], total: 3, rollerName: 'X' })
    setLastRoll(null)
    expect(getLastRoll()).toBeNull()
  })
})

describe('broadcastDiceResult', () => {
  it('adds a chat message and sends network message', () => {
    const addChatMessage = vi.fn()
    const sendMessage = vi.fn()
    vi.mocked(useLobbyStore.getState).mockReturnValue({ players: [], addChatMessage } as any)
    vi.mocked(useNetworkStore.getState).mockReturnValue({ localPeerId: 'peer-1', sendMessage, role: 'host' } as any)

    broadcastDiceResult('2d6', [3, 4], 7, 'TestPlayer')

    expect(addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'peer-1',
        senderName: 'TestPlayer',
        content: 'rolled 2d6',
        isDiceRoll: true,
        diceResult: { formula: '2d6', rolls: [3, 4], total: 7 }
      })
    )

    expect(sendMessage).toHaveBeenCalledWith('game:dice-result', {
      formula: '2d6',
      rolls: [3, 4],
      total: 7,
      isCritical: false,
      isFumble: false,
      rollerName: 'TestPlayer'
    })
  })

  it('sets lastRoll after broadcast', () => {
    const addChatMessage = vi.fn()
    const sendMessage = vi.fn()
    vi.mocked(useLobbyStore.getState).mockReturnValue({ players: [], addChatMessage } as any)
    vi.mocked(useNetworkStore.getState).mockReturnValue({ localPeerId: 'peer-1', sendMessage, role: 'host' } as any)

    broadcastDiceResult('1d20', [17], 17, 'Alice')
    expect(getLastRoll()).toEqual({ formula: '1d20', rolls: [17], total: 17, rollerName: 'Alice' })
  })
})

describe('saveAndBroadcastCharacter', () => {
  it('saves character via store', () => {
    const saveCharacter = vi.fn()
    vi.mocked(useCharacterStore.getState).mockReturnValue({ characters: [], saveCharacter } as any)
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ entityId: 'char-1', id: 'tok-1', currentHP: 20 }] }],
      updateToken: vi.fn()
    } as any)
    vi.mocked(useNetworkStore.getState).mockReturnValue({ role: 'host', sendMessage: vi.fn() } as any)

    const char = { id: 'char-1', hitPoints: { current: 15 } } as any
    saveAndBroadcastCharacter(char)
    expect(saveCharacter).toHaveBeenCalledWith(char)
  })

  it('updates token HP on the active map', () => {
    const updateToken = vi.fn()
    vi.mocked(useCharacterStore.getState).mockReturnValue({ characters: [], saveCharacter: vi.fn() } as any)
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ entityId: 'char-1', id: 'tok-1' }] }],
      updateToken
    } as any)
    vi.mocked(useNetworkStore.getState).mockReturnValue({ role: 'host', sendMessage: vi.fn() } as any)

    saveAndBroadcastCharacter({ id: 'char-1', hitPoints: { current: 10 } } as any)
    expect(updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 10 })
  })

  it('sends dm:character-update when role is not host', () => {
    const sendMessage = vi.fn()
    vi.mocked(useCharacterStore.getState).mockReturnValue({ characters: [], saveCharacter: vi.fn() } as any)
    vi.mocked(useGameStore.getState).mockReturnValue({ activeMapId: null, maps: [], updateToken: vi.fn() } as any)
    vi.mocked(useNetworkStore.getState).mockReturnValue({ role: 'player', sendMessage } as any)

    const char = { id: 'char-2', hitPoints: { current: 5 } } as any
    saveAndBroadcastCharacter(char)
    expect(sendMessage).toHaveBeenCalledWith('dm:character-update', {
      characterId: 'char-2',
      characterData: char,
      targetPeerId: 'host'
    })
  })
})

describe('getLatestCharacter', () => {
  it('returns a 5e character by id', () => {
    const char = { id: 'c1', system: '5e', name: 'Test' }
    vi.mocked(useCharacterStore.getState).mockReturnValue({ characters: [char] } as any)
    const result = getLatestCharacter('c1')
    expect(result).toBeDefined()
  })

  it('returns undefined for non-existent id', () => {
    vi.mocked(useCharacterStore.getState).mockReturnValue({ characters: [] } as any)
    expect(getLatestCharacter('missing')).toBeUndefined()
  })
})

describe('findTokenByName', () => {
  it('finds a token by case-insensitive prefix', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [
        {
          id: 'map-1',
          tokens: [
            { id: 't1', label: 'Goblin Warrior', entityId: 'e1' },
            { id: 't2', label: 'Orc Chieftain', entityId: 'e2' }
          ]
        }
      ]
    } as any)

    const result = findTokenByName('goblin')
    expect(result).toBeDefined()
    expect(result!.label).toBe('Goblin Warrior')
  })

  it('returns undefined when no match', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }]
    } as any)

    expect(findTokenByName('Dragon')).toBeUndefined()
  })
})

describe('generateMessageId', () => {
  it('returns a string starting with "msg-"', () => {
    const id = generateMessageId()
    expect(id).toMatch(/^msg-\d+-/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateMessageId()))
    expect(ids.size).toBe(10)
  })
})
