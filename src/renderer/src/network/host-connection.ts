import type { DataConnection } from 'peerjs'
import { FILE_SIZE_LIMIT, JOIN_TIMEOUT_MS, MAX_DISPLAY_NAME_LENGTH, MESSAGE_SIZE_LIMIT } from '../constants'
import { logger } from '../utils/logger'
import { applyChatModeration, isClientAllowedMessageType, validateMessage } from './host-message-handlers'
import { getPeerId } from './peer-manager'
import { validateNetworkMessage } from './schemas'
import type { BanPayload, JoinPayload, NetworkMessage, PeerInfo } from './types'

/** Shared host state passed to connection handlers to avoid circular module references */
export interface HostStateAccessors {
  connections: Map<string, DataConnection>
  peerInfoMap: Map<string, PeerInfo>
  bannedPeers: Set<string>
  bannedNames: Set<string>
  chatMutedPeers: Map<string, number>
  lastHeartbeat: Map<string, number>
  messageRates: Map<string, number[]>
  getDisplayName: () => string
  getCampaignId: () => string | null
  getModerationEnabled: () => boolean
  getCustomBlockedWords: () => string[]
  getGameStateProvider: () => (() => unknown) | null
  router: { handle: (msg: NetworkMessage) => void }
  joinCallbacks: Set<(peer: PeerInfo) => void>
  leaveCallbacks: Set<(peer: PeerInfo) => void>
  messageCallbacks: Set<(message: NetworkMessage, fromPeerId: string) => void>
  isRateLimited: (peerId: string) => boolean
  isGlobalRateLimited: () => boolean
  buildMessage: <T>(type: NetworkMessage['type'], payload: T) => NetworkMessage<T>
  broadcastMessage: (msg: NetworkMessage) => void
  broadcastExcluding: (msg: NetworkMessage, excludePeerId: string) => void
  sendToPeer: (peerId: string, msg: NetworkMessage) => void
  disconnectPeer: (peerId: string, message: NetworkMessage) => void
  persistBans: () => void
  getConnectedPeers: () => PeerInfo[]
}

/**
 * Handle a new incoming PeerJS data connection.
 * Applies rate limiting, message validation, and anti-spoofing.
 */
export function handleNewConnection(conn: DataConnection, state: HostStateAccessors): void {
  const peerId = conn.peer
  logger.debug('[HostManager] New connection from:', peerId)

  if (state.bannedPeers.has(peerId)) {
    logger.debug('[HostManager] Rejected banned peer:', peerId)
    try {
      conn.close()
    } catch {
      // Ignore close errors
    }
    return
  }

  const joinTimeout = setTimeout(() => {
    logger.warn('[HostManager] Peer', peerId, 'did not send join message in time')
    conn.close()
  }, JOIN_TIMEOUT_MS)

  conn.on('open', () => {
    logger.debug('[HostManager] Connection open with:', peerId)
  })

  conn.on('data', (raw) => {
    // Check raw string size BEFORE parsing JSON
    if (typeof raw === 'string') {
      if (raw.length > FILE_SIZE_LIMIT) {
        logger.warn('[HostManager] Oversized message from', peerId, 'size:', raw.length)
        return
      }
      if (raw.length > MESSAGE_SIZE_LIMIT) {
        const typeMatch = raw.slice(0, 200).match(/"type"\s*:\s*"([^"]+)"/)
        if (!typeMatch || typeMatch[1] !== 'chat:file') {
          logger.warn('[HostManager] Oversized non-file message from', peerId, 'size:', raw.length)
          return
        }
      }
    }

    if (state.isRateLimited(peerId)) {
      logger.warn('[HostManager] Rate limited:', peerId)
      return
    }

    if (state.isGlobalRateLimited()) {
      logger.warn('[HostManager] Global rate limit exceeded, dropping message from', peerId)
      return
    }

    let message: NetworkMessage
    try {
      message = typeof raw === 'string' ? JSON.parse(raw) : (raw as NetworkMessage)
    } catch (e) {
      logger.warn('[HostManager] Invalid message from', peerId, e)
      return
    }

    // Prevent senderId/senderName spoofing before validation
    message.senderId = peerId
    const knownPeer = state.peerInfoMap.get(peerId)
    if (knownPeer) {
      message.senderName = knownPeer.displayName
    }

    const zodResult = validateNetworkMessage(message)
    if (!zodResult.success) {
      logger.warn('[HostManager] Schema validation failed from', peerId, zodResult.error)
      return
    }

    if (!validateMessage(message)) {
      logger.warn('[HostManager] Invalid message from', peerId, (message as unknown as Record<string, unknown>)?.type)
      return
    }

    if (!isClientAllowedMessageType(message.type)) {
      logger.warn('[HostManager] Blocked disallowed message type from client', peerId, message.type)
      return
    }

    if (message.type === 'chat:message') {
      const allowed = applyChatModeration(
        message,
        peerId,
        state.chatMutedPeers,
        state.getModerationEnabled(),
        state.getCustomBlockedWords()
      )
      if (!allowed) return
    }

    if (!state.peerInfoMap.has(peerId)) {
      if (message.type !== 'player:join') {
        logger.warn('[HostManager] Peer', peerId, 'sent', message.type, 'before joining')
        return
      }

      clearTimeout(joinTimeout)
      handleJoin(peerId, conn, message as NetworkMessage<JoinPayload>, state)
      return
    }

    state.router.handle(message)
    for (const cb of state.messageCallbacks) {
      try {
        cb(message, peerId)
      } catch (e) {
        logger.error('[HostManager] Error in message callback:', e)
      }
    }

    if (message.type === 'ping') {
      state.lastHeartbeat.set(peerId, Date.now())
      state.sendToPeer(peerId, state.buildMessage('pong', {}))
    }
  })

  // Guard against both 'close' and 'error' firing and double-invoking handleDisconnection
  let disconnectHandled = false

  conn.on('close', () => {
    clearTimeout(joinTimeout)
    if (!disconnectHandled) {
      disconnectHandled = true
      handleDisconnection(peerId, state)
    }
  })

  conn.on('error', (err) => {
    logger.error('[HostManager] Connection error with', peerId, err)
    clearTimeout(joinTimeout)
    if (!disconnectHandled) {
      disconnectHandled = true
      handleDisconnection(peerId, state)
    }
  })
}

/**
 * Handle a player joining: validate name, register peer, send full state, broadcast join.
 */
export function handleJoin(
  peerId: string,
  conn: DataConnection,
  message: NetworkMessage<JoinPayload>,
  state: HostStateAccessors
): void {
  const { characterId, characterName } = message.payload

  const playerName =
    String(message.payload.displayName ?? 'Unknown')
      .slice(0, MAX_DISPLAY_NAME_LENGTH)
      .trim() || 'Unknown'

  if (state.bannedNames.has(playerName.toLowerCase())) {
    logger.debug('[HostManager] Rejected banned name:', playerName, '(peer:', peerId, ')')
    state.bannedPeers.add(peerId)
    state.bannedNames.add(playerName.toLowerCase())
    state.persistBans()
    const banPayload: BanPayload = { peerId, reason: 'Banned by DM' }
    const banMsg = state.buildMessage('dm:ban-player', banPayload)
    state.disconnectPeer(peerId, banMsg)
    return
  }

  state.connections.set(peerId, conn)
  const peerInfo: PeerInfo = {
    peerId,
    displayName: playerName,
    characterId,
    characterName,
    isReady: false,
    isHost: false
  }
  // Capture connected peers BEFORE adding the new peer so game:state-full
  // doesn't include the joining peer in their own peer list
  const allPeers = state.getConnectedPeers()
  state.peerInfoMap.set(peerId, peerInfo)
  state.lastHeartbeat.set(peerId, Date.now())

  logger.debug('[HostManager] Player joined:', playerName, '(', peerId, ')')

  const hostPeer: PeerInfo = {
    peerId: getPeerId() || '',
    displayName: state.getDisplayName(),
    characterId: null,
    characterName: null,
    isReady: true,
    isHost: true
  }
  const fullPayload: Record<string, unknown> = {
    peers: [hostPeer, ...allPeers],
    campaignId: state.getCampaignId()
  }
  const provider = state.getGameStateProvider()
  if (provider) {
    try {
      fullPayload.gameState = provider()
    } catch (e) {
      logger.warn('[HostManager] Failed to get game state for sync:', e)
    }
  }
  state.sendToPeer(peerId, state.buildMessage('game:state-full', fullPayload))

  state.broadcastExcluding(
    state.buildMessage('player:join', {
      displayName: playerName,
      characterId,
      characterName,
      peerId
    }),
    peerId
  )

  for (const cb of state.joinCallbacks) {
    try {
      cb(peerInfo)
    } catch (e) {
      logger.error('[HostManager] Error in join callback:', e)
    }
  }
}

/**
 * Handle a peer disconnecting: clean up state and notify remaining peers.
 */
export function handleDisconnection(peerId: string, state: HostStateAccessors): void {
  const peerInfo = state.peerInfoMap.get(peerId)
  state.connections.delete(peerId)
  state.peerInfoMap.delete(peerId)
  state.messageRates.delete(peerId)
  state.lastHeartbeat.delete(peerId)

  if (peerInfo) {
    logger.debug('[HostManager] Player left:', peerInfo.displayName, '(', peerId, ')')

    state.broadcastMessage(state.buildMessage('player:leave', { displayName: peerInfo.displayName, peerId }))

    for (const cb of state.leaveCallbacks) {
      try {
        cb(peerInfo)
      } catch (e) {
        logger.error('[HostManager] Error in leave callback:', e)
      }
    }
  }
}
