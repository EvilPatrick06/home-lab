import type { DataConnection } from 'peerjs'
import { pushDmAlert } from '../components/game/overlays/DmAlertTray'
import { KICK_DELAY_MS, MAX_RECONNECT_ATTEMPTS } from '../constants'
import { logger } from '../utils/logger'
import { type HostStateAccessors, handleDisconnection, handleNewConnection } from './host-connection'
import {
  buildMessage as buildMessageUtil,
  isGlobalRateLimited as isGlobalRateLimitedUtil,
  isRateLimited as isRateLimitedUtil,
  loadPersistedBans,
  persistBans as persistBansUtil,
  startHeartbeatCheck,
  stopHeartbeatCheck
} from './host-state-sync'
import { createMessageRouter } from './message-handler'
import { createPeer, destroyPeer, generateInviteCode, getPeer } from './peer-manager'
import type { BanPayload, KickPayload, NetworkMessage, PeerInfo } from './types'

// Module-level state
let hosting = false
let inviteCode: string | null = null
let displayName = ''
const sequenceCounter = { value: 0 }
let campaignId: string | null = null

// Rate limiting
const messageRates = new Map<string, number[]>()
const globalMessageTimestamps = { value: [] as number[] }

// Connected peers
const connections = new Map<string, DataConnection>()
const peerInfoMap = new Map<string, PeerInfo>()

// Ban system
const bannedPeers = new Set<string>()
const bannedNames = new Set<string>()
const bansLoaded = { value: false }

// Chat mute system (peerId -> unmute timestamp)
const chatMutedPeers = new Map<string, number>()

// Heartbeat tracking (peerId -> last heartbeat timestamp)
const lastHeartbeat = new Map<string, number>()

// Auto-moderation
let moderationEnabled = false
let customBlockedWords: string[] = []

// Game state provider — set by the network store to supply game state for full syncs
type GameStateProvider = () => unknown
let gameStateProvider: GameStateProvider | null = null

// Ping interval for connection quality
let pingInterval: ReturnType<typeof setInterval> | null = null
const PING_INTERVAL_MS = 5000

// Event callbacks
type PeerCallback = (peer: PeerInfo) => void
type MessageCallback = (message: NetworkMessage, fromPeerId: string) => void

const joinCallbacks = new Set<PeerCallback>()
const leaveCallbacks = new Set<PeerCallback>()
const messageCallbacks = new Set<MessageCallback>()

// Internal message router for host-side message handling
const router = createMessageRouter()

// Per-peer bounded send queue — prevents unbounded memory growth when a peer is slow
// Messages are serialized strings; oldest are dropped when the queue is full.
const MAX_PEER_QUEUE_SIZE = 50
const peerQueues = new Map<string, string[]>()

/** Queue a serialized message for a specific peer and drain synchronously. */
function queueForPeer(peerId: string, serialized: string): void {
  const conn = connections.get(peerId)
  if (!conn?.open) return

  let queue = peerQueues.get(peerId)
  if (!queue) {
    queue = []
    peerQueues.set(peerId, queue)
  }

  if (queue.length >= MAX_PEER_QUEUE_SIZE) {
    logger.warn('[HostManager] Peer send queue full for', peerId, '— dropping oldest message')
    queue.shift()
  }
  queue.push(serialized)

  // Drain in FIFO order (PeerJS conn.send is synchronous / non-blocking)
  while (queue.length > 0) {
    const c = connections.get(peerId)
    if (!c?.open) {
      queue.length = 0
      break
    }
    try {
      c.send(queue[0])
      queue.shift()
    } catch (e) {
      logger.warn('[HostManager] Failed to send queued message to', peerId, e)
      queue.shift() // drop the failed message and stop draining
      break
    }
  }
}

function buildMessage<T>(type: NetworkMessage['type'], payload: T): NetworkMessage<T> {
  return buildMessageUtil(type, payload, displayName, sequenceCounter)
}

function persistBans(): void {
  persistBansUtil(campaignId, bannedPeers, bannedNames)
}

function disconnectPeer(peerId: string, message: NetworkMessage): void {
  const conn = connections.get(peerId)
  if (conn) {
    try {
      conn.send(JSON.stringify(message))
    } catch {
      // Ignore send errors during disconnect
    }
    setTimeout(() => {
      try {
        conn.close()
      } catch {
        // Ignore close errors
      }
    }, KICK_DELAY_MS)
  }

  const peerInfo = peerInfoMap.get(peerId)
  connections.delete(peerId)
  peerInfoMap.delete(peerId)
  peerQueues.delete(peerId)

  if (peerInfo) {
    broadcastMessage(buildMessage('player:leave', { displayName: peerInfo.displayName }))
    for (const cb of leaveCallbacks) {
      try {
        cb(peerInfo)
      } catch (e) {
        logger.error('[HostManager] Error in leave callback:', e)
      }
    }
  }
}

/** Build the HostStateAccessors object for sub-module use */
function getStateAccessors(): HostStateAccessors {
  return {
    connections,
    peerInfoMap,
    bannedPeers,
    bannedNames,
    chatMutedPeers,
    lastHeartbeat,
    messageRates,
    getDisplayName: () => displayName,
    getCampaignId: () => campaignId,
    getModerationEnabled: () => moderationEnabled,
    getCustomBlockedWords: () => customBlockedWords,
    getGameStateProvider: () => gameStateProvider,
    router,
    joinCallbacks,
    leaveCallbacks,
    messageCallbacks,
    isRateLimited: (peerId) => isRateLimitedUtil(peerId, messageRates),
    isGlobalRateLimited: () => isGlobalRateLimitedUtil(globalMessageTimestamps),
    buildMessage,
    broadcastMessage,
    broadcastExcluding,
    sendToPeer,
    disconnectPeer,
    persistBans,
    getConnectedPeers
  }
}

/** Start hosting a game session. Returns the invite code for players to join. */
export async function startHosting(hostDisplayName: string, existingInviteCode?: string): Promise<string> {
  if (hosting) {
    throw new Error('Already hosting a game')
  }

  displayName = hostDisplayName
  sequenceCounter.value = 0

  // Use the provided invite code or generate a new one
  inviteCode = existingInviteCode || generateInviteCode()

  try {
    const peer = await createPeer(inviteCode)
    hosting = true

    if (campaignId) {
      await loadPersistedBans(campaignId, bannedPeers, bannedNames, bansLoaded)
    }

    // Listen for incoming data connections
    peer.on('connection', (conn: DataConnection) => {
      handleNewConnection(conn, getStateAccessors())
    })

    // Handle peer-level errors while hosting
    peer.on('error', (err) => {
      logger.error('[HostManager] Peer error while hosting:', err)
      pushDmAlert('error', `Network error: ${err.type ?? err.message ?? String(err)}`)
    })

    let reconnectAttempts = 0
    peer.on('disconnected', () => {
      const currentPeer = getPeer()
      if (!currentPeer || currentPeer.destroyed) return
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.error('[HostManager] Max reconnect attempts reached, giving up')
        pushDmAlert('error', 'Host reconnection failed after 5 attempts')
        return
      }
      reconnectAttempts++
      const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 30000)
      logger.warn(
        `[HostManager] Disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
      )
      setTimeout(() => {
        const p = getPeer()
        if (p && !p.destroyed) p.reconnect()
      }, delay)
    })

    peer.on('open', () => {
      reconnectAttempts = 0 // Reset on successful connection
    })

    // Start ping interval for connection quality monitoring
    pingInterval = setInterval(() => {
      const msg = buildMessage('ping', { timestamp: Date.now() })
      for (const [, conn] of connections) {
        try {
          if (conn.open) conn.send(JSON.stringify(msg))
        } catch {
          /* ignore */
        }
      }
    }, PING_INTERVAL_MS)

    startHeartbeatCheck({
      connections,
      peerInfoMap,
      lastHeartbeat,
      messageCallbacks,
      buildMessage,
      handleDisconnection: (peerId) => {
        peerQueues.delete(peerId)
        handleDisconnection(peerId, getStateAccessors())
      }
    })

    logger.debug('[HostManager] Hosting started with invite code:', inviteCode)
    return inviteCode
  } catch (err) {
    hosting = false
    inviteCode = null
    throw err
  }
}

/** Stop hosting — disconnect all peers and destroy the PeerJS instance. */
export function stopHosting(): void {
  if (!hosting) return

  logger.debug('[HostManager] Stopping host...')

  // Notify all peers that the game is ending
  broadcastMessage(buildMessage('dm:game-end', {}))

  // Close all connections
  for (const [peerId, conn] of connections) {
    try {
      conn.close()
    } catch (e) {
      logger.warn('[HostManager] Error closing connection to', peerId, e)
    }
  }

  connections.clear()
  peerInfoMap.clear()
  messageRates.clear()
  globalMessageTimestamps.value = []
  bannedPeers.clear()
  bannedNames.clear()
  chatMutedPeers.clear()
  lastHeartbeat.clear()
  peerQueues.clear()
  stopHeartbeatCheck()
  router.clear()
  joinCallbacks.clear()
  leaveCallbacks.clear()
  messageCallbacks.clear()

  moderationEnabled = false
  customBlockedWords = []
  gameStateProvider = null

  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }

  destroyPeer()
  hosting = false
  inviteCode = null
  campaignId = null
  sequenceCounter.value = 0
  bansLoaded.value = false
}

/** Send a message to all connected peers. */
export function broadcastMessage(msg: NetworkMessage): void {
  const serialized = JSON.stringify(msg)
  for (const [peerId] of connections) {
    queueForPeer(peerId, serialized)
  }
}

/** Broadcast to all peers except the specified one (rebroadcast without echo). */
export function broadcastExcluding(msg: NetworkMessage, excludePeerId: string): void {
  const serialized = JSON.stringify(msg)
  for (const [peerId] of connections) {
    if (peerId === excludePeerId) continue
    queueForPeer(peerId, serialized)
  }
}

/** Send a message to a specific peer. */
export function sendToPeer(peerId: string, msg: NetworkMessage): void {
  if (!connections.has(peerId)) {
    logger.warn('[HostManager] No connection found for peer:', peerId)
    return
  }
  queueForPeer(peerId, JSON.stringify(msg))
}

/** Kick a peer from the game. */
export function kickPeer(peerId: string): void {
  const kickPayload: KickPayload = { peerId, reason: 'Kicked by DM' }
  const kickMsg = buildMessage('dm:kick-player', kickPayload)
  disconnectPeer(peerId, kickMsg)
}

/** Get all currently connected peers (not including the host). */
export function getConnectedPeers(): PeerInfo[] {
  return Array.from(peerInfoMap.values())
}

/** Register a callback for when a peer joins. Returns an unsubscribe function. */
export function onPeerJoined(callback: PeerCallback): () => void {
  joinCallbacks.add(callback)
  return () => {
    joinCallbacks.delete(callback)
  }
}

/** Register a callback for when a peer leaves. Returns an unsubscribe function. */
export function onPeerLeft(callback: PeerCallback): () => void {
  leaveCallbacks.add(callback)
  return () => {
    leaveCallbacks.delete(callback)
  }
}

/** Register a callback for incoming messages. Returns an unsubscribe function. */
export function onMessage(callback: MessageCallback): () => void {
  messageCallbacks.add(callback)
  return () => {
    messageCallbacks.delete(callback)
  }
}

/** Check if currently hosting. */
export function isHosting(): boolean {
  return hosting
}

/** Get the current invite code. */
export function getInviteCode(): string | null {
  return inviteCode
}

/** Set the campaign ID; also loads persisted bans. */
export async function setCampaignId(id: string): Promise<void> {
  campaignId = id
  await loadPersistedBans(id, bannedPeers, bannedNames, bansLoaded)
}

/** Get the campaign ID for this hosted game. */
export function getCampaignId(): string | null {
  return campaignId
}

/** Ban a peer — kicks them and prevents reconnection. */
export function banPeer(peerId: string): void {
  bannedPeers.add(peerId)
  const peerInfo = peerInfoMap.get(peerId)
  if (peerInfo) {
    bannedNames.add(peerInfo.displayName.toLowerCase())
  }
  const banPayload: BanPayload = { peerId, reason: 'Banned by DM' }
  const banMsg = buildMessage('dm:ban-player', banPayload)
  disconnectPeer(peerId, banMsg)
  logger.debug('[HostManager] Banned peer:', peerId, peerInfo ? `(name: ${peerInfo.displayName})` : '')
  persistBans()
}

/** Unban a peer — allows them to reconnect. */
export function unbanPeer(peerId: string): void {
  bannedPeers.delete(peerId)
  logger.debug('[HostManager] Unbanned peer:', peerId)
  persistBans()
}

/** Unban a display name — allows users with that name to reconnect. */
export function unbanName(name: string): void {
  bannedNames.delete(name.toLowerCase())
  logger.debug('[HostManager] Unbanned name:', name)
  persistBans()
}

/** Get all currently banned peer IDs. */
export function getBannedPeers(): string[] {
  return Array.from(bannedPeers)
}

/** Get all currently banned display names. */
export function getBannedNames(): string[] {
  return Array.from(bannedNames)
}

/** Chat-mute a peer for a specified duration and broadcast notification. */
export function chatMutePeer(peerId: string, durationMs: number): void {
  chatMutedPeers.set(peerId, Date.now() + durationMs)
  logger.debug('[HostManager] Chat-muted peer:', peerId, 'for', durationMs, 'ms')

  const durationSeconds = Math.round(durationMs / 1000)
  broadcastMessage(buildMessage('dm:chat-timeout', { peerId, duration: durationSeconds }))
}

/** Check if a peer is currently chat-muted. */
export function isChatMuted(peerId: string): boolean {
  const expiry = chatMutedPeers.get(peerId)
  if (!expiry) return false
  if (Date.now() >= expiry) {
    chatMutedPeers.delete(peerId)
    return false
  }
  return true
}

/** Enable or disable auto-moderation for chat messages. */
export function setModerationEnabled(enabled: boolean): void {
  moderationEnabled = enabled
}

/** Set custom blocked words for auto-moderation. */
export function setCustomBlockedWords(words: string[]): void {
  customBlockedWords = words
}

/** Check if moderation is enabled. */
export function isModerationEnabled(): boolean {
  return moderationEnabled
}

/** Set a game state provider callback for full syncs on new peer connections. */
export function setGameStateProvider(provider: GameStateProvider | null): void {
  gameStateProvider = provider
}

/** Look up a connected peer's info by their peer ID. */
export function getPeerInfo(peerId: string): PeerInfo | undefined {
  return peerInfoMap.get(peerId)
}

/** Update a connected peer's info (e.g., when a player changes their color). */
export function updatePeerInfo(peerId: string, updates: Partial<PeerInfo>): void {
  const existing = peerInfoMap.get(peerId)
  if (existing) {
    peerInfoMap.set(peerId, { ...existing, ...updates })
  }
}
