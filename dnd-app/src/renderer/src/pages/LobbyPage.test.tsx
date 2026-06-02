// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- react-router ---------------------------------------------------------
const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ campaignId: 'camp-1' })
}))

// --- network bridges hook (no-op) -----------------------------------------
vi.mock('./lobby/use-lobby-bridges', () => ({
  useLobbyBridges: () => undefined
}))

// --- network barrel -------------------------------------------------------
// LobbyPage + the LobbyLayout subtree pull a handful of imperative helpers
// (announce, moderation, kick/ban, character-info, PLAYER_COLORS) from the
// `../network` barrel. Stub them so nothing touches a real transport.
vi.mock('../network', () => ({
  onClientMessage: () => () => undefined,
  setHostCampaignId: vi.fn(),
  setHostCaps: vi.fn(),
  startHostAnnounce: vi.fn(async () => undefined),
  stopHostAnnounce: vi.fn(async () => undefined),
  updateHostAnnounce: vi.fn(async () => undefined),
  setCharacterInfo: vi.fn(),
  banPeer: vi.fn(),
  chatMutePeer: vi.fn(),
  kickPeer: vi.fn(),
  isModerationEnabled: () => false,
  setModerationEnabled: vi.fn(),
  PLAYER_COLORS: ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899']
}))

// --- zustand store mocks --------------------------------------------------
// Each store is a hook that supports the three call shapes LobbyPage + the
// LobbyLayout subtree use: bare `useX()` (returns whole state), selector
// `useX((s) => s.foo)`, and the static `useX.getState()`. The backing state
// objects are mutated per-test before render.
type AnyState = Record<string, unknown>

function makeStoreHook(getStateObj: () => AnyState): {
  (selector?: (s: AnyState) => unknown): unknown
  getState: () => AnyState
} {
  const hook = ((selector?: (s: AnyState) => unknown) => {
    const state = getStateObj()
    return selector ? selector(state) : state
  }) as ReturnType<typeof makeStoreHook>
  hook.getState = getStateObj
  return hook
}

// Module-level mutable state holders the mock factories close over.
const stores = vi.hoisted(() => ({
  network: {} as AnyState,
  lobby: {} as AnyState,
  campaign: {} as AnyState,
  character: {} as AnyState,
  game: {} as AnyState,
  aiDm: {} as AnyState
}))

vi.mock('../stores/network-store', () => ({
  useNetworkStore: makeStoreHook(() => stores.network)
}))
vi.mock('../stores/use-lobby-store', () => ({
  useLobbyStore: makeStoreHook(() => stores.lobby)
}))
vi.mock('../stores/use-campaign-store', () => ({
  useCampaignStore: makeStoreHook(() => stores.campaign)
}))
vi.mock('../stores/use-character-store', () => ({
  useCharacterStore: makeStoreHook(() => stores.character)
}))
vi.mock('../stores/use-game-store', () => ({
  useGameStore: makeStoreHook(() => stores.game)
}))
vi.mock('../stores/use-ai-dm-store', () => ({
  useAiDmStore: makeStoreHook(() => stores.aiDm)
}))

// The lobby-store mock module above doesn't export the LobbyPlayer type, but
// the subtree imports it as a *type* (erased at runtime), so no value needed.

// Import the REAL LobbyPage (and, transitively, the real LobbyLayout subtree)
// after the mocks are registered.
import LobbyPage from './LobbyPage'

// A realistic HOST lobby with two players. The local player is the host.
function seedHostLobby(): void {
  const players = [
    {
      peerId: 'host-peer',
      clientId: 'host-client',
      role: 'host',
      displayName: 'Dungeon Master Dave',
      characterId: null,
      characterName: null,
      isReady: false,
      isHost: true,
      color: '#eab308',
      colorConfirmed: true,
      status: 'connected'
    },
    {
      peerId: 'player-peer',
      clientId: 'player-client',
      role: 'player',
      displayName: 'Aragorn',
      characterId: null,
      characterName: null,
      isReady: false,
      isHost: false,
      color: '#3b82f6',
      colorConfirmed: true,
      status: 'connected'
    }
  ]

  stores.network = {
    role: 'host',
    connectionState: 'connected',
    inviteCode: 'ABCD',
    localPeerId: 'host-peer',
    displayName: 'Dungeon Master Dave',
    connectionMode: 'p2p',
    peers: [],
    latencyMs: null,
    error: null,
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    removePeer: vi.fn()
  }

  stores.lobby = {
    campaignId: 'camp-1',
    players,
    chatMessages: [],
    isHost: true,
    locallyMutedPeers: [],
    setCampaignId: vi.fn(),
    setIsHost: vi.fn(),
    addPlayer: vi.fn(),
    reset: vi.fn(),
    updatePlayer: vi.fn(),
    toggleLocalMutePlayer: vi.fn(),
    setPlayerReady: vi.fn(),
    allPlayersReady: () => false
  }

  stores.campaign = {
    campaigns: [
      {
        id: 'camp-1',
        name: 'Curse of the Crimson Keep',
        system: 'dnd5e',
        settings: { isPrivate: true, maxPlayers: 8, maxSpectators: 5 },
        aiDm: { enabled: false }
      }
    ],
    loadCampaigns: vi.fn(),
    saveCampaign: vi.fn(),
    addCampaignToState: vi.fn()
  }

  stores.character = {
    characters: [],
    loading: false,
    loadCharacters: vi.fn()
  }

  stores.game = { activeMapId: null }

  stores.aiDm = {
    sceneStatus: 'idle',
    initFromCampaign: vi.fn(),
    prepareScene: vi.fn(async () => undefined),
    checkSceneStatus: vi.fn(async () => undefined)
  }
}

beforeEach(() => {
  seedHostLobby()
})

afterEach(() => {
  navigate.mockClear()
})

describe('LobbyPage (host lobby flow)', () => {
  it('renders the campaign name, invite code, and both player names', () => {
    render(<LobbyPage />)

    // Campaign name header.
    expect(screen.getByRole('heading', { name: 'Curse of the Crimson Keep' })).toBeTruthy()

    // Invite code chip (private game → code is shown).
    expect(screen.getByText('ABCD')).toBeTruthy()

    // Connection status surfaced from the network store.
    expect(screen.getByText('connected')).toBeTruthy()

    // Both players rendered by the real LobbyLayout → PlayerList → PlayerCard.
    expect(screen.getByText('Dungeon Master Dave')).toBeTruthy()
    expect(screen.getByText('Aragorn')).toBeTruthy()

    // The host's Make Public/Private toggle is present (host-only control).
    expect(screen.getByRole('button', { name: 'Make Public' })).toBeTruthy()

    // The leave control exists and the confirmation modal is NOT yet open.
    expect(screen.getByRole('button', { name: /Leave Lobby/i })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces hosting_mode from the resolved connectionMode, not the campaign preference', async () => {
    // Regression: a default-p2p campaign hosted off-LAN routes through the Pi
    // cloud relay (connectionMode === 'cloud') but used to announce the static
    // campaign.hostingMode ('p2p'), so joiners took the PeerJS path and hit
    // peer-unavailable ("No game found"). The announce must reflect the actual
    // transport so both sides rendezvous on the same wire.
    const { startHostAnnounce } = await import('../network')
    vi.mocked(startHostAnnounce).mockClear()
    stores.network.connectionMode = 'cloud'
    render(<LobbyPage />)
    expect(startHostAnnounce).toHaveBeenCalledWith(expect.objectContaining({ hosting_mode: 'cloud' }))
  })

  it('opens the leave-confirmation modal when the Leave control is clicked', () => {
    render(<LobbyPage />)

    fireEvent.click(screen.getByRole('button', { name: /Leave Lobby/i }))

    // Modal (role="dialog") now appears with the confirmation copy + the
    // host-specific warning, and a danger "Leave" action.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Are you sure you want to disconnect/i)).toBeTruthy()
    expect(within(dialog).getByText(/leaving will end the session for all players/i)).toBeTruthy()

    // Confirming leave disconnects + resets + navigates the DM back to their
    // campaign hub (BUG-4 — was the join-a-game browser / bare home).
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }))
    expect(stores.network.disconnect as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
    expect(stores.lobby.reset as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/campaign/camp-1', { replace: true })
  })
})
