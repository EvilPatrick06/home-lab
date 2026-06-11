import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignPlayer } from '../types/campaign'

// ── Mocks so importing ai-dm-routing doesn't pull real stores / window ──
const sendMessage = vi.fn()
let lobbyPlayers: Array<{
  displayName: string
  characterId: string | null
  characterName: string | null
  peerId: string
}> = []

vi.mock('../stores/use-ai-dm-store', () => ({
  useAiDmStore: { getState: () => ({ sendMessage }) }
}))
vi.mock('../stores/use-game-store', () => ({
  useGameStore: { getState: () => ({ maps: [], activeMapId: null }) }
}))
vi.mock('../stores/use-lobby-store', () => ({
  useLobbyStore: { getState: () => ({ players: lobbyPlayers }) }
}))
vi.mock('./game/token-stats', () => ({ getTokenStats: () => ({}) }))
vi.mock('../utils/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('./game-action-executor', () => ({ buildGameStateSnapshot: () => 'SNAPSHOT' }))

import { buildPlayerRoster, resolveActingCharacterId, routePlayerMessageToAiDm } from './ai-dm-routing'

const cp = (p: Partial<CampaignPlayer>): CampaignPlayer => p as CampaignPlayer

describe('buildPlayerRoster', () => {
  it('solo (1 lobby player) → "Solo play: X controls Y"', () => {
    const r = buildPlayerRoster([{ displayName: 'Pat', characterId: 'c1', characterName: 'Aria', peerId: 'p1' }], [])
    expect(r.charIds).toEqual(['c1'])
    expect(r.rosterText).toContain('Solo play: Pat controls Aria')
  })

  it('multiplayer (2+ lobby players) → party list', () => {
    const r = buildPlayerRoster(
      [
        { displayName: 'Pat', characterId: 'c1', characterName: 'Aria', peerId: 'p1' },
        { displayName: 'Sam', characterId: 'c2', characterName: 'Bron', peerId: 'p2' }
      ],
      []
    )
    expect(r.charIds).toEqual(['c1', 'c2'])
    expect(r.rosterText).toContain('Party roster (2 players)')
    expect(r.rosterText).toContain('Pat → Aria')
    expect(r.rosterText).toContain('Sam → Bron')
  })

  it('falls back to ACTIVE campaign players when lobby is empty', () => {
    const r = buildPlayerRoster(
      [],
      [
        cp({ displayName: 'Pat', characterId: 'c1', isActive: true }),
        cp({ displayName: 'Ghost', characterId: 'c9', isActive: false })
      ]
    )
    expect(r.charIds).toEqual(['c1']) // inactive excluded
    expect(r.rosterText).toContain('Solo play: Pat')
  })

  it('returns empty when no one has a character', () => {
    const r = buildPlayerRoster([], [])
    expect(r.charIds).toEqual([])
    expect(r.rosterText).toBe('')
  })
})

describe('routePlayerMessageToAiDm', () => {
  beforeEach(() => {
    sendMessage.mockClear()
    lobbyPlayers = []
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends the message to the AI DM with roster + game-state + acting char appended', async () => {
    routePlayerMessageToAiDm('camp-1', 'I open the door', 'Pat', [
      cp({ displayName: 'Pat', characterId: 'c1', isActive: true })
    ])
    // The async dynamic-import chain resolves on a microtask.
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    const [campaignId, message, charIds, senderName, _creatures, gameState, actingCharacterId] =
      sendMessage.mock.calls[0]
    expect(campaignId).toBe('camp-1')
    expect(message).toBe('I open the door')
    expect(charIds).toEqual(['c1'])
    expect(senderName).toBe('Pat')
    expect(gameState).toContain('SNAPSHOT')
    expect(gameState).toContain('[PARTY ROSTER]')
    // PHASE-11 11F — the sender's own character is the actor (7th arg).
    expect(actingCharacterId).toBe('c1')
  })
})

describe('resolveActingCharacterId (PHASE-11 11F)', () => {
  it('prefers a lobby player whose displayName matches the sender', () => {
    const id = resolveActingCharacterId(
      'Pat',
      [
        { displayName: 'Pat', characterId: 'c1' },
        { displayName: 'Sam', characterId: 'c2' }
      ],
      []
    )
    expect(id).toBe('c1')
  })

  it('falls back to an active campaign player by name when no lobby', () => {
    const id = resolveActingCharacterId(
      'Sam',
      [],
      [
        cp({ displayName: 'Sam', characterId: 'c2', isActive: true }),
        cp({ displayName: 'Pat', characterId: 'c1', isActive: true })
      ]
    )
    expect(id).toBe('c2')
  })

  it('returns the single roster member even when the name does not match (solo)', () => {
    const id = resolveActingCharacterId(
      'SomeOtherName',
      [],
      [cp({ displayName: 'Hero', characterId: 'solo-1', isActive: true })]
    )
    expect(id).toBe('solo-1')
  })

  it('returns undefined for an unknown sender in a 2+ roster', () => {
    const id = resolveActingCharacterId(
      'Ghost',
      [
        { displayName: 'Pat', characterId: 'c1' },
        { displayName: 'Sam', characterId: 'c2' }
      ],
      []
    )
    expect(id).toBeUndefined()
  })
})
