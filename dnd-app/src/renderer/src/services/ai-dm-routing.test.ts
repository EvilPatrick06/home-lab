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

import { buildPlayerRoster, routePlayerMessageToAiDm } from './ai-dm-routing'

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

  it('sends the message to the AI DM with roster + game-state appended', async () => {
    routePlayerMessageToAiDm('camp-1', 'I open the door', 'Pat', [
      cp({ displayName: 'Pat', characterId: 'c1', isActive: true })
    ])
    // The async dynamic-import chain resolves on a microtask.
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    const [campaignId, message, charIds, senderName, _creatures, gameState] = sendMessage.mock.calls[0]
    expect(campaignId).toBe('camp-1')
    expect(message).toBe('I open the door')
    expect(charIds).toEqual(['c1'])
    expect(senderName).toBe('Pat')
    expect(gameState).toContain('SNAPSHOT')
    expect(gameState).toContain('[PARTY ROSTER]')
  })
})
