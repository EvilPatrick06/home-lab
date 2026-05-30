import type { ConnectionState, MessageType, PeerInfo } from '../../network'

export interface NetworkState {
  role: 'none' | 'host' | 'client'
  connectionState: ConnectionState
  inviteCode: string | null
  campaignId: string | null
  localPeerId: string | null
  displayName: string
  peers: PeerInfo[]
  error: string | null
  disconnectReason: 'kicked' | 'banned' | 'rejected' | null
  latencyMs: number | null
  /**
   * Phase 30e — whether the *local* user currently holds DM (game-rule)
   * authority, decoupled from the network host. The host starts as DM
   * (`hostGame` sets it true); `transferDm` / an inbound `dm:transfer-dm`
   * moves it. Initial false (standalone / client until proven otherwise).
   */
  localIsDM: boolean
  /**
   * Phase 32 — transport in use for the current session. `'p2p'` is the WebRTC
   * mesh (a player laptop hosts); `'cloud'` routes everything through the
   * always-on Pi's Socket.IO relay. Default `'p2p'`; set by `hostGame`/`joinGame`.
   */
  connectionMode: 'p2p' | 'cloud'

  hostGame: (displayName: string, existingInviteCode?: string, mode?: 'p2p' | 'cloud') => Promise<string>
  stopHosting: () => void
  kickPlayer: (peerId: string) => void
  /**
   * Phase 30e — hand DM authority to `newDmPeerId` over the mesh. Host-only
   * (the network host owns the broadcast). Updates every peer's `isDM`, the
   * local `localIsDM` flag, and broadcasts `dm:transfer-dm` so every client
   * applies the same change.
   */
  transferDm: (newDmPeerId: string) => void
  joinGame: (inviteCode: string, displayName: string, mode?: 'p2p' | 'cloud') => Promise<void>
  disconnect: () => void
  sendMessage: (type: MessageType, payload: unknown) => void
  setDisplayName: (name: string) => void
  updatePeer: (peerId: string, updates: Partial<PeerInfo>) => void
  removePeer: (peerId: string) => void
  addPeer: (peer: PeerInfo) => void
  setConnectionState: (state: ConnectionState) => void
  setError: (error: string | null) => void
  clearDisconnectReason: () => void
}
