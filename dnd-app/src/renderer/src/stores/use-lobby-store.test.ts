import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import type { ChatMessage, LobbyPlayer } from './use-lobby-store'
import { useLobbyStore } from './use-lobby-store'
import { useNetworkStore } from './use-network-store'

describe('useLobbyStore', () => {
  const storageState = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => (storageState.has(key) ? (storageState.get(key) ?? null) : null)),
    setItem: vi.fn((key: string, value: string) => {
      storageState.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      storageState.delete(key)
    }),
    clear: vi.fn(() => {
      storageState.clear()
    })
  })

  beforeEach(() => {
    useLobbyStore.getState().reset()
    localStorage.clear()
    useNetworkStore.setState({
      role: 'none',
      localPeerId: null,
      displayName: '',
      peers: []
    })
  })

  it('can be imported', async () => {
    const mod = await import('./use-lobby-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useLobbyStore).toBe('function')
  })

  it('store has player and chat state properties', () => {
    // LobbyPlayer and ChatMessage are type-only exports (erased at runtime)
    // so we verify the store state that uses those types instead
    const state = useLobbyStore.getState()
    expect(Array.isArray(state.players)).toBe(true)
    expect(Array.isArray(state.chatMessages)).toBe(true)
  })

  it('has expected initial state shape', () => {
    const state = useLobbyStore.getState()
    expect(state).toHaveProperty('campaignId')
    expect(state).toHaveProperty('players')
    expect(state).toHaveProperty('chatMessages')
    expect(state).toHaveProperty('isHost')
    expect(state).toHaveProperty('locallyMutedPeers')
    expect(state).toHaveProperty('remoteCharacters')
    expect(state).toHaveProperty('slowModeSeconds')
    expect(state).toHaveProperty('fileSharingEnabled')
    expect(state).toHaveProperty('chatMutedUntil')
  })

  it('has expected initial state values', () => {
    const state = useLobbyStore.getState()
    expect(state.campaignId).toBeNull()
    expect(state.players).toEqual([])
    expect(state.chatMessages).toEqual([])
    expect(state.isHost).toBe(false)
    expect(state.locallyMutedPeers).toEqual([])
    expect(state.remoteCharacters).toEqual({})
    expect(state.slowModeSeconds).toBe(0)
    expect(state.fileSharingEnabled).toBe(true)
    expect(state.chatMutedUntil).toBeNull()
  })

  it('has expected actions', () => {
    const state = useLobbyStore.getState()
    expect(typeof state.setCampaignId).toBe('function')
    expect(typeof state.addPlayer).toBe('function')
    expect(typeof state.removePlayer).toBe('function')
    expect(typeof state.updatePlayer).toBe('function')
    expect(typeof state.setPlayerReady).toBe('function')
    expect(typeof state.addChatMessage).toBe('function')
    expect(typeof state.sendChat).toBe('function')
    expect(typeof state.setIsHost).toBe('function')
    expect(typeof state.allPlayersReady).toBe('function')
    expect(typeof state.toggleLocalMutePlayer).toBe('function')
    expect(typeof state.setRemoteCharacter).toBe('function')
    expect(typeof state.setSlowMode).toBe('function')
    expect(typeof state.setFileSharingEnabled).toBe('function')
    expect(typeof state.setChatMutedUntil).toBe('function')
    expect(typeof state.setDiceColors).toBe('function')
    expect(typeof state.getLocalDiceColors).toBe('function')
    expect(typeof state.reset).toBe('function')
  })

  it('allPlayersReady returns false when no players', () => {
    const state = useLobbyStore.getState()
    expect(state.allPlayersReady()).toBe(false)
  })

  it('LobbyPlayer objects with required fields are accepted by addPlayer', () => {
    const player: LobbyPlayer = {
      peerId: 'peer-test-001',
      displayName: 'Gandalf',
      characterId: null,
      characterName: null,
      isReady: false,
      isHost: false
    }
    useLobbyStore.getState().addPlayer(player)
    const players = useLobbyStore.getState().players
    const found = players.find((p) => p.peerId === 'peer-test-001')
    expect(found).toBeDefined()
    expect(found?.displayName).toBe('Gandalf')
  })

  it('LobbyPlayer optional fields (color, isCoDM, diceColors) are truly optional', () => {
    const minimal: LobbyPlayer = {
      peerId: 'peer-min',
      displayName: 'Frodo',
      characterId: 'char-1',
      characterName: 'Frodo Baggins',
      isReady: true,
      isHost: false
    }
    expect(minimal.color).toBeUndefined()
    expect(minimal.isCoDM).toBeUndefined()
    expect(minimal.diceColors).toBeUndefined()
  })

  it('ChatMessage objects with required fields are accepted by addChatMessage', () => {
    const msg: ChatMessage = {
      id: 'msg-001',
      senderId: 'peer-test-001',
      senderName: 'Gandalf',
      content: 'You shall not pass!',
      timestamp: 1700000000000,
      isSystem: false
    }
    useLobbyStore.getState().addChatMessage(msg)
    const messages = useLobbyStore.getState().chatMessages
    const found = messages.find((m) => m.id === 'msg-001')
    expect(found).toBeDefined()
    expect(found?.content).toBe('You shall not pass!')
    expect(found?.isSystem).toBe(false)
  })

  it('ChatMessage optional dice roll fields are typed correctly', () => {
    const diceMsg: ChatMessage = {
      id: 'msg-dice-001',
      senderId: 'local',
      senderName: 'You',
      content: 'rolled 1d20',
      timestamp: Date.now(),
      isSystem: false,
      isDiceRoll: true,
      diceResult: { formula: '1d20', total: 17, rolls: [17] }
    }
    expect(diceMsg.isDiceRoll).toBe(true)
    expect(diceMsg.diceResult?.formula).toBe('1d20')
    expect(diceMsg.diceResult?.total).toBe(17)
  })

  it('only persists dice colors for local player updates', () => {
    const setItemSpy = vi.mocked(localStorage.setItem)
    useNetworkStore.setState({ localPeerId: 'peer-local' })
    const localColors = { primary: '#111111', secondary: '#222222' }
    const remoteColors = { primary: '#aaaaaa', secondary: '#bbbbbb' }

    useLobbyStore.getState().setDiceColors('peer-remote', remoteColors)
    expect(setItemSpy).not.toHaveBeenCalled()

    useLobbyStore.getState().setDiceColors('peer-local', localColors)
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(setItemSpy).toHaveBeenCalledWith('lobby-dice-colors', JSON.stringify(localColors))
  })

  it('loads chat history safely when storage is malformed or mixed', () => {
    const campaignId = 'camp-1'
    const validMessage: ChatMessage = {
      id: 'msg-valid-1',
      senderId: 'peer-1',
      senderName: 'Valid User',
      content: 'hello',
      timestamp: Date.now(),
      isSystem: false
    }

    localStorage.setItem(`lobby-chat-${campaignId}`, JSON.stringify([validMessage, 42, null, { bad: true }]))
    useLobbyStore.getState().loadChatHistory(campaignId)
    expect(useLobbyStore.getState().chatMessages).toEqual([validMessage])

    localStorage.setItem(`lobby-chat-${campaignId}`, '{not-json')
    expect(() => useLobbyStore.getState().loadChatHistory(campaignId)).not.toThrow()
  })
})
