import type { DataConnection } from 'peerjs'
import { FILE_SIZE_LIMIT, JOIN_TIMEOUT_MS, MAX_DISPLAY_NAME_LENGTH, MESSAGE_SIZE_LIMIT } from '../constants'
import { logger } from '../utils/logger'
import { applyChatModeration, isClientAllowedMessageType, validateMessage } from './host-message-handlers'
import type { BanClientEntry } from './host-state-sync'
import { getPeerId } from './peer-manager'
import { validateNetworkMessage } from './schemas'
import type { BanPayload, JoinPayload, NetworkMessage, PeerInfo } from './types'

/** Shared host state passed to connection handlers to avoid circular module references */
export interface HostStateAccessors {
  connections: Map<string, DataConnection>
  peerInfoMap: Map<string, PeerInfo>
  /** Phase 29c: clientId-keyed ban map. Survives reconnect. */
  bannedClients: Map<string, BanClientEntry>
  bannedNames: Set<string>
  chatMutedPeers: Map<string, number>
  lastHeartbeat: Map<string, number>
  messageRates: Map<string, number[]>
  getDisplayName: () => string
  getCampaignId: () => string | null
  /** Host's stable per-installation UUID. Stamped onto the host peer's PeerInfo so clients see consistent identity. (Phase 29b) */
  getHostClientId: () => string
  /** Phase 29e: max player slots (from `campaign.settings.maxPlayers`). Host rejects joins past this cap. */
  getMaxPlayers: () => number
  /** Phase 29e: max spectator slots (from `campaign.settings.maxSpectators`). Host rejects spectator joins past this cap. */
  getMaxSpectators: () => number
  getModerationEnabled: () => boolean
  getCustomBlockedWords: () => string[]
  getGameStateProvider: () => ((peerInfo: PeerInfo) => unknown) | null
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
  /** Phase 29h: register a replay buffer for a freshly joined client. */
  registerClientBuffer: (clientId: string) => void
  /** Phase 29h: look up the per-client replay buffer for a reconnect. */
  replayAfter: (
    clientId: string,
    lastSequence: number
  ) => {
    fromSequence: number
    toSequence: number
    fallback: boolean
    messages: NetworkMessage[]
  }
}

/**
 * Handle a new incoming PeerJS data connection.
 * Applies rate limiting, message validation, and anti-spoofing.
 */
export function handleNewConnection(conn: DataConnection, state: HostStateAccessors): void {
  const peerId = conn.peer
  logger.debug('[HostManager] New connection from:', peerId)

  // Phase 29c: ban check moved to handleJoin where the joinPayload.clientId is
  // available (peerIds are per-session and not a stable identity). The
  // join-timeout below still kicks any peer that doesn't send a valid join in
  // time, so an idle banned client costs at most JOIN_TIMEOUT_MS of socket time.

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

  const joiningClientId = message.payload.clientId

  // Phase 29c: clientId-based ban (survives reconnect) — primary check.
  if (state.bannedClients.has(joiningClientId)) {
    logger.debug(
      '[HostManager] Rejected banned clientId:',
      joiningClientId,
      '(peer:',
      peerId,
      ', name:',
      playerName,
      ')'
    )
    const banPayload: BanPayload = { peerId, reason: 'Banned by DM' }
    const banMsg = state.buildMessage('dm:ban-player', banPayload)
    state.disconnectPeer(peerId, banMsg)
    return
  }

  // Phase 29c: name-based fallback (catches users who clear localStorage and rejoin with the same alias).
  if (state.bannedNames.has(playerName.toLowerCase())) {
    logger.debug('[HostManager] Rejected banned name:', playerName, '(peer:', peerId, ')')
    state.bannedClients.set(joiningClientId, {
      clientId: joiningClientId,
      lastAlias: playerName,
      bannedAt: Date.now()
    })
    state.bannedNames.add(playerName.toLowerCase())
    state.persistBans()
    const banPayload: BanPayload = { peerId, reason: 'Banned by DM' }
    const banMsg = state.buildMessage('dm:ban-player', banPayload)
    state.disconnectPeer(peerId, banMsg)
    return
  }

  // Phase 29e: enforce per-role caps (maxPlayers / maxSpectators).
  const requestedRole: 'player' | 'spectator' = message.payload.role ?? 'player'
  let currentPlayers = 0
  let currentSpectators = 0
  for (const existing of state.peerInfoMap.values()) {
    if (existing.role === 'player') currentPlayers++
    else if (existing.role === 'spectator') currentSpectators++
  }
  if (requestedRole === 'player' && currentPlayers >= state.getMaxPlayers()) {
    logger.debug('[HostManager] Player cap reached:', currentPlayers, '/', state.getMaxPlayers(), '— rejecting', peerId)
    const rejectMsg = state.buildMessage('player:join-rejected', {
      reason: 'full' as const,
      message: `Game is full (${currentPlayers}/${state.getMaxPlayers()} players).`
    })
    state.disconnectPeer(peerId, rejectMsg)
    return
  }
  if (requestedRole === 'spectator' && currentSpectators >= state.getMaxSpectators()) {
    logger.debug(
      '[HostManager] Spectator cap reached:',
      currentSpectators,
      '/',
      state.getMaxSpectators(),
      '— rejecting',
      peerId
    )
    const rejectMsg = state.buildMessage('player:join-rejected', {
      reason: 'spectator-cap' as const,
      message: `Spectator slots full (${currentSpectators}/${state.getMaxSpectators()}).`
    })
    state.disconnectPeer(peerId, rejectMsg)
    return
  }

  // MP-1 (v2.1.31 QA): dedupe by clientId before insert. WebRTC reconnects
  // mint a fresh transient peerId every time; without this dedupe the host's
  // peerInfoMap accumulates a new entry per reconnect cycle ("phantom
  // Patricks") which then cascade into MP-2 (join/leave chat spam), MP-6
  // (color picker showing all colors taken because phantoms each claim one),
  // and broadcast traffic getting routed to dead connections. Find any
  // existing entry with the same clientId, close its connection, and drop
  // it from all peer-keyed maps before we add the fresh one.
  for (const [existingPeerId, existingPeer] of Array.from(state.peerInfoMap.entries())) {
    if (existingPeer.clientId === joiningClientId && existingPeerId !== peerId) {
      logger.debug(
        '[HostManager] Replacing stale peer for clientId:',
        joiningClientId,
        '(old peerId:',
        existingPeerId,
        '→ new peerId:',
        peerId,
        ')'
      )
      const oldConn = state.connections.get(existingPeerId)
      if (oldConn) {
        try {
          oldConn.close()
        } catch {
          /* connection already torn down — ignore */
        }
      }
      state.connections.delete(existingPeerId)
      state.peerInfoMap.delete(existingPeerId)
      state.lastHeartbeat.delete(existingPeerId)
    }
  }

  state.connections.set(peerId, conn)
  const peerInfo: PeerInfo = {
    peerId,
    clientId: message.payload.clientId,
    role: message.payload.role ?? 'player',
    displayName: playerName,
    characterId,
    characterName,
    isReady: false,
    isHost: false,
    // Phase 29j: snapshot the joining peer's wire-format capabilities so
    // subsequent broadcasts can decide whether to emit msgpack frames.
    ...(message.payload.clientCapabilities ? { clientCapabilities: message.payload.clientCapabilities } : {})
  }
  // Capture connected peers BEFORE adding the new peer so game:state-full
  // doesn't include the joining peer in their own peer list
  const allPeers = state.getConnectedPeers()
  state.peerInfoMap.set(peerId, peerInfo)
  state.lastHeartbeat.set(peerId, Date.now())
  state.registerClientBuffer(message.payload.clientId)

  logger.debug('[HostManager] Player joined:', playerName, '(', peerId, ')')

  const hostPeer: PeerInfo = {
    peerId: getPeerId() || '',
    clientId: state.getHostClientId(),
    role: 'host',
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
      // Pass peerInfo so the provider can filter DM-only data for non-host peers
      // (hidden tokens, unrevealed traps, dm-only handouts/notes, etc.)
      fullPayload.gameState = provider(peerInfo)
    } catch (e) {
      logger.warn('[HostManager] Failed to get game state for sync:', e)
    }
  }

  // Phase 29h: reconnect resync. If the client returns with the same
  // stable clientId and a `lastSequence` cursor that falls within our
  // retained replay buffer, replay only the missed messages instead of
  // shipping the full state. Falls back to game:state-full otherwise.
  const lastSequence = message.payload.lastSequence
  if (typeof lastSequence === 'number') {
    const replay = state.replayAfter(message.payload.clientId, lastSequence)
    if (!replay.fallback) {
      // Still need to send the peer list / campaign-id meta — drop the
      // gameState field since the replay contains every mutation since.
      const { gameState: _gameState, ...meta } = fullPayload
      state.sendToPeer(peerId, state.buildMessage('game:state-full', meta))
      state.sendToPeer(
        peerId,
        state.buildMessage('game:state-resync', {
          fromSequence: replay.fromSequence,
          toSequence: replay.toSequence,
          fallback: false,
          messages: replay.messages
        })
      )
      state.broadcastExcluding(
        state.buildMessage('player:join', {
          displayName: playerName,
          characterId,
          characterName,
          peerId,
          clientId: peerInfo.clientId,
          role: peerInfo.role
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
      return
    }
  }

  state.sendToPeer(peerId, state.buildMessage('game:state-full', fullPayload))

  state.broadcastExcluding(
    state.buildMessage('player:join', {
      displayName: playerName,
      characterId,
      characterName,
      peerId,
      clientId: peerInfo.clientId,
      role: peerInfo.role
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
