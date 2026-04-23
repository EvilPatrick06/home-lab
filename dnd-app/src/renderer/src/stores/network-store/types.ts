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
  disconnectReason: 'kicked' | 'banned' | null
  latencyMs: number | null

  hostGame: (displayName: string, existingInviteCode?: string) => Promise<string>
  stopHosting: () => void
  kickPlayer: (peerId: string) => void
  joinGame: (inviteCode: string, displayName: string) => Promise<void>
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
