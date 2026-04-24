import type { DataConnection } from 'peerjs'
import {
  BASE_RETRY_MS,
  CONNECTION_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  MAX_RECONNECT_RETRIES,
  MAX_RETRY_MS,
  RECONNECT_DELAY_MS
} from '../constants'
import { logger } from '../utils/logger'
import { createPeer, destroyPeer, getPeerId } from './peer-manager'
import { validateNetworkMessage } from './schemas'
import type { NetworkMessage } from './types'
import { KNOWN_MESSAGE_TYPES } from './types'

function validateIncomingMessage(msg: unknown): msg is NetworkMessage {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return false
  const m = msg as Record<string, unknown>
  if (typeof m.type !== 'string' || !KNOWN_MESSAGE_TYPES.has(m.type)) return false
  if (m.payload !== undefined && m.payload !== null && typeof m.payload !== 'object') return false
  if (typeof m.senderId === 'string' && (m.senderId as string).length > 100) return false
  if (typeof m.senderName === 'string' && (m.senderName as string).length > 100) return false

  const payload = m.payload as Record<string, unknown> | null | undefined
  if (payload && typeof payload === 'object') {
    if (typeof payload.displayName === 'string' && (payload.displayName as string).length > 100) return false
    if (typeof payload.message === 'string' && (payload.message as string).length > 5000) return false
  }

  return true
}

// Module-level state
let connection: DataConnection | null = null
let connected = false
let displayName = ''
let sequenceCounter = 0

// Sequence gap detection — tracks the last seen sequence number from the host
// to detect dropped or out-of-order messages (informational only; WebRTC reliable
// ordered channels should prevent gaps, but we log when they occur for debugging).
let lastHostSequence = -1

// Persisted character info for reconnection
let lastCharacterId: string | null = null
let lastCharacterName: string | null = null

// Reconnection state (exponential backoff with jitter)
let retryCount = 0
let retryTimeout: ReturnType<typeof setTimeout> | null = null
let lastInviteCode: string | null = null
let isReconnecting = false

// Heartbeat
let heartbeatInterval: ReturnType<typeof setInterval> | null = null

// Event callbacks
type MessageCallback = (message: NetworkMessage) => void
type DisconnectedCallback = (reason: string) => void

const messageCallbacks = new Set<MessageCallback>()
const disconnectedCallbacks = new Set<DisconnectedCallback>()

/**
 * Connect to a host using an invite code.
 * Creates a PeerJS peer, connects to the host peer ID (the invite code),
 * and automatically sends a join message.
 */
export async function connectToHost(
  inviteCode: string,
  playerDisplayName: string,
  characterId: string | null = null,
  characterName: string | null = null
): Promise<void> {
  if (connected) {
    throw new Error('Already connected to a game')
  }

  displayName = playerDisplayName
  lastInviteCode = inviteCode.toUpperCase().trim()
  retryCount = 0
  sequenceCounter = 0

  // Persist character info for reconnection
  if (characterId !== null) lastCharacterId = characterId
  if (characterName !== null) lastCharacterName = characterName

  await attemptConnection(lastInviteCode, characterId, characterName)
}

/**
 * Disconnect from the host and clean up.
 */
export function disconnect(): void {
  logger.debug('[ClientManager] Disconnecting...')

  // Cancel any pending retry
  if (retryTimeout) {
    clearTimeout(retryTimeout)
    retryTimeout = null
  }

  if (connection) {
    // Send a leave message before closing
    try {
      sendMessage({ type: 'player:leave', payload: { displayName } })
    } catch {
      // Ignore errors during disconnect
    }

    try {
      connection.close()
    } catch {
      // Ignore close errors
    }
    connection = null
  }

  connected = false
  lastInviteCode = null
  lastCharacterId = null
  lastCharacterName = null
  retryCount = 0
  isReconnecting = false
  lastHostSequence = -1

  stopHeartbeat()
  destroyPeer()

  messageCallbacks.clear()
  disconnectedCallbacks.clear()
}

/**
 * Send a message to the host. Automatically fills in senderId,
 * senderName, timestamp, and sequence number.
 */
export function sendMessage(msg: Omit<NetworkMessage, 'senderId' | 'senderName' | 'timestamp' | 'sequence'>): void {
  if (!connection || !connection.open) {
    logger.warn('[ClientManager] Cannot send message — not connected')
    return
  }

  const fullMessage: NetworkMessage = {
    ...msg,
    senderId: getPeerId() || '',
    senderName: displayName,
    timestamp: Date.now(),
    sequence: sequenceCounter++
  }

  try {
    connection.send(JSON.stringify(fullMessage))
  } catch (e) {
    logger.error('[ClientManager] Failed to send message:', e)
  }
}

/**
 * Register a callback for incoming messages from the host.
 * Returns an unsubscribe function.
 */
export function onMessage(callback: MessageCallback): () => void {
  messageCallbacks.add(callback)
  return () => {
    messageCallbacks.delete(callback)
  }
}

/**
 * Register a callback for when the connection is lost.
 * Returns an unsubscribe function.
 */
export function onDisconnected(callback: DisconnectedCallback): () => void {
  disconnectedCallbacks.add(callback)
  return () => {
    disconnectedCallbacks.delete(callback)
  }
}

/**
 * Check if currently connected.
 */
export function isConnected(): boolean {
  return connected
}

/**
 * Update the stored character info so reconnection preserves the selection.
 * Call this whenever the player changes their character in the lobby.
 */
export function setCharacterInfo(characterId: string | null, characterName: string | null): void {
  lastCharacterId = characterId
  lastCharacterName = characterName
}

// --- Heartbeat ---

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatInterval = setInterval(() => {
    if (connected) {
      try {
        sendMessage({ type: 'ping', payload: {} })
      } catch {
        // Ignore send errors for heartbeat
      }
    }
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// --- Internal helpers ---

async function attemptConnection(
  inviteCode: string,
  characterId: string | null = null,
  characterName: string | null = null
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    createPeer()
      .then((peer) => {
        logger.debug('[ClientManager] Connecting to host:', inviteCode)

        const conn = peer.connect(inviteCode, {
          reliable: true,
          serialization: 'raw'
        })

        // Connection timeout
        const timeout = setTimeout(() => {
          conn.close()
          reject(new Error('Connection to host timed out'))
        }, CONNECTION_TIMEOUT_MS)

        conn.on('open', () => {
          clearTimeout(timeout)
          connection = conn
          connected = true
          retryCount = 0
          lastHostSequence = -1 // Reset sequence tracking on each (re)connect

          logger.debug('[ClientManager] Connected to host')

          sendMessage({
            type: 'player:join',
            payload: {
              displayName,
              characterId,
              characterName
            }
          })

          startHeartbeat()
          resolve()
        })

        conn.on('data', (raw) => {
          let message: NetworkMessage
          try {
            message = typeof raw === 'string' ? JSON.parse(raw) : (raw as NetworkMessage)
          } catch (e) {
            logger.warn('[ClientManager] Invalid message from host:', e)
            return
          }

          // Zod schema validation
          const zodResult = validateNetworkMessage(message)
          if (!zodResult.success) {
            logger.warn('[ClientManager] Schema validation failed:', zodResult.error)
            return
          }

          if (!validateIncomingMessage(message)) {
            logger.warn('[ClientManager] Message failed validation:', (message as Record<string, unknown>)?.type)
            return
          }

          // Sequence gap detection — log if host sequence skipped (informational; WebRTC
          // reliable ordered channels should prevent this, but we track it for debugging)
          if (typeof message.sequence === 'number' && message.sequence >= 0) {
            if (lastHostSequence >= 0 && message.sequence > lastHostSequence + 1) {
              logger.warn(
                `[ClientManager] Sequence gap detected: expected ${lastHostSequence + 1}, got ${message.sequence} (type: ${message.type})`
              )
            }
            if (message.sequence > lastHostSequence) {
              lastHostSequence = message.sequence
            }
          }

          // Handle kick — do NOT retry reconnection
          if (message.type === 'dm:kick-player') {
            logger.debug('[ClientManager] Kicked from game')
            handleForcedDisconnection('You were kicked from the game')
            return
          }

          // Handle ban — do NOT retry reconnection
          if (message.type === 'dm:ban-player') {
            logger.debug('[ClientManager] Banned from game')
            handleForcedDisconnection('You were banned from the game')
            return
          }

          // Handle game end — do NOT retry reconnection
          if (message.type === 'dm:game-end') {
            logger.debug('[ClientManager] Game ended by host')
            handleForcedDisconnection('The game session has ended')
            return
          }

          // Handle ping — respond with pong immediately
          if (message.type === 'ping') {
            const pongPayload = (message.payload as { timestamp?: number })?.timestamp
              ? { timestamp: (message.payload as { timestamp: number }).timestamp }
              : {}
            sendMessage({ type: 'pong', payload: pongPayload })
            return
          }

          // Handle pong (keep-alive response) — forward to callbacks for latency tracking
          if (message.type === 'pong') {
            for (const cb of messageCallbacks) {
              try {
                cb(message)
              } catch {
                /* ignore */
              }
            }
            return
          }

          // Dispatch to callbacks
          for (const cb of messageCallbacks) {
            try {
              cb(message)
            } catch (e) {
              logger.error('[ClientManager] Error in message callback:', e)
            }
          }
        })

        conn.on('close', () => {
          clearTimeout(timeout)
          if (connected) {
            handleDisconnection('Connection closed')
          }
        })

        conn.on('error', (err) => {
          clearTimeout(timeout)
          logger.error('[ClientManager] Connection error:', err)
          if (!connected) {
            reject(new Error(`Failed to connect to host: ${err.message}`))
          } else {
            handleDisconnection(`Connection error: ${err.message}`)
          }
        })

        // Handle peer-level errors (e.g., peer-unavailable means wrong invite code)
        peer.on('error', (err) => {
          clearTimeout(timeout)
          if (err.type === 'peer-unavailable') {
            reject(new Error('Invalid invite code. No game found with that code.'))
          } else if (!connected) {
            reject(new Error(`Connection failed: ${err.message}`))
          }
        })
      })
      .catch(reject)
  })
}

function handleDisconnection(reason: string): void {
  const wasConnected = connected
  connected = false
  connection = null

  if (wasConnected && retryCount < MAX_RECONNECT_RETRIES && lastInviteCode && !isReconnecting) {
    isReconnecting = true
    retryCount++
    // Exponential backoff with jitter, minimum RECONNECT_DELAY_MS (capped at 30s)
    const delay = Math.max(RECONNECT_DELAY_MS, Math.min(BASE_RETRY_MS * 2 ** (retryCount - 1), MAX_RETRY_MS))
    const jitter = Math.floor(Math.random() * 500)
    const totalDelay = delay + jitter
    logger.debug(
      `[ClientManager] Connection lost. Retrying (${retryCount}/${MAX_RECONNECT_RETRIES}) in ${totalDelay}ms...`
    )

    // Destroy the old peer before retrying
    destroyPeer()

    retryTimeout = setTimeout(async () => {
      isReconnecting = false
      try {
        await attemptConnection(lastInviteCode!, lastCharacterId, lastCharacterName)
        logger.debug('[ClientManager] Reconnected successfully')
        retryCount = 0
      } catch (e) {
        logger.error('[ClientManager] Reconnection attempt failed:', e)
        if (retryCount >= MAX_RECONNECT_RETRIES) {
          notifyDisconnected(`Failed to reconnect after ${MAX_RECONNECT_RETRIES} attempts`)
        } else {
          handleDisconnection(reason)
        }
      }
    }, totalDelay)
  } else {
    destroyPeer()
    notifyDisconnected(reason)
  }
}

function handleForcedDisconnection(reason: string): void {
  connected = false
  connection = null
  lastInviteCode = null
  retryCount = MAX_RECONNECT_RETRIES // Prevent retries
  if (retryTimeout) {
    clearTimeout(retryTimeout)
    retryTimeout = null
  }
  destroyPeer()
  notifyDisconnected(reason)
}

function notifyDisconnected(reason: string): void {
  lastInviteCode = null
  retryCount = 0
  for (const cb of disconnectedCallbacks) {
    try {
      cb(reason)
    } catch (e) {
      logger.error('[ClientManager] Error in disconnected callback:', e)
    }
  }
}
