import type { DataConnection } from 'peerjs'
import {
  HEARTBEAT_REMOVE_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_GLOBAL_MESSAGES_PER_SECOND,
  MAX_MESSAGES_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS
} from '../constants'
import { logger } from '../utils/logger'
import { getPeerId } from './peer-manager'
import type { NetworkMessage, PeerInfo } from './types'

/** Shared state references needed by sync utilities */
export interface SyncStateAccessors {
  connections: Map<string, DataConnection>
  peerInfoMap: Map<string, PeerInfo>
  lastHeartbeat: Map<string, number>
  messageCallbacks: Set<(message: NetworkMessage, fromPeerId: string) => void>
  buildMessage: <T>(type: NetworkMessage['type'], payload: T) => NetworkMessage<T>
  handleDisconnection: (peerId: string) => void
}

// --- Heartbeat ---

let heartbeatCheckInterval: ReturnType<typeof setInterval> | null = null

export function startHeartbeatCheck(state: SyncStateAccessors): void {
  stopHeartbeatCheck()
  heartbeatCheckInterval = setInterval(() => {
    const now = Date.now()
    for (const [peerId, lastTime] of state.lastHeartbeat) {
      const elapsed = now - lastTime
      if (elapsed >= HEARTBEAT_REMOVE_MS) {
        logger.debug('[HostManager] Removing stale peer (no heartbeat for 2min):', peerId)
        const conn = state.connections.get(peerId)
        if (conn) {
          try {
            conn.close()
          } catch {
            /* ignore */
          }
        }
        state.handleDisconnection(peerId)
        state.lastHeartbeat.delete(peerId)
      } else if (elapsed >= HEARTBEAT_TIMEOUT_MS) {
        const peerInfo = state.peerInfoMap.get(peerId)
        if (peerInfo && !peerInfo.isDisconnected) {
          logger.debug('[HostManager] Peer heartbeat timeout:', peerId)
          // Mark as disconnected but keep in the list until HEARTBEAT_REMOVE_MS
          state.peerInfoMap.set(peerId, { ...peerInfo, isDisconnected: true })
          for (const cb of state.messageCallbacks) {
            try {
              cb(
                state.buildMessage('player:leave', { peerId, displayName: peerInfo.displayName, disconnected: true }),
                peerId
              )
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
  }, 10_000)
}

export function stopHeartbeatCheck(): void {
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval)
    heartbeatCheckInterval = null
  }
}

// --- Ban persistence ---

export interface BanClientEntry {
  clientId: string
  lastAlias: string
  bannedAt: number
}

export interface BanMigrationResult {
  /** True when the legacy ban file shape was found (peerIds present, clients absent). Host should surface a one-time DM alert about the soft-reset. */
  legacyMigrationSkipped: boolean
  /** Count of legacy peerId entries the host discarded (peerIds are ephemeral; name fallback in bannedNames preserves the practical block). */
  legacyPeerCount: number
}

export async function loadPersistedBans(
  id: string,
  bannedClients: Map<string, BanClientEntry>,
  bannedNames: Set<string>,
  bansLoadedRef: { value: boolean }
): Promise<BanMigrationResult> {
  if (bansLoadedRef.value) return { legacyMigrationSkipped: false, legacyPeerCount: 0 }
  try {
    const bans = await window.api.loadBans(id)
    for (const name of bans.names) {
      bannedNames.add(name.toLowerCase())
    }
    let legacyMigrationSkipped = false
    let legacyPeerCount = 0
    if (Array.isArray(bans.clients)) {
      for (const entry of bans.clients) {
        bannedClients.set(entry.clientId, entry)
      }
    } else if (bans.peerIds.length > 0) {
      legacyMigrationSkipped = true
      legacyPeerCount = bans.peerIds.length
    }
    if (bans.clients?.length || bans.peerIds.length > 0 || bans.names.length > 0) {
      logger.debug(
        '[HostManager] Restored',
        bannedClients.size,
        'clientId-keyed bans,',
        legacyPeerCount,
        'legacy peerId entries discarded,',
        bans.names.length,
        'banned names'
      )
    }
    bansLoadedRef.value = true
    return { legacyMigrationSkipped, legacyPeerCount }
  } catch (e) {
    logger.warn('[HostManager] Failed to load persisted bans:', e)
    return { legacyMigrationSkipped: false, legacyPeerCount: 0 }
  }
}

export function persistBans(
  campaignId: string | null,
  bannedClients: Map<string, BanClientEntry>,
  bannedNames: Set<string>
): void {
  if (!campaignId) return
  window.api
    .saveBans(campaignId, {
      peerIds: [],
      names: Array.from(bannedNames),
      clients: Array.from(bannedClients.values())
    })
    .catch((e) => {
      logger.warn('[HostManager] Failed to persist bans:', e)
    })
}

// --- Rate limiting ---

export function isRateLimited(peerId: string, messageRates: Map<string, number[]>): boolean {
  const now = Date.now()
  const timestamps = messageRates.get(peerId) ?? []
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  messageRates.set(peerId, recent)
  return recent.length > MAX_MESSAGES_PER_WINDOW
}

export function isGlobalRateLimited(globalMessageTimestampsRef: { value: number[] }): boolean {
  const now = Date.now()
  globalMessageTimestampsRef.value = globalMessageTimestampsRef.value.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  globalMessageTimestampsRef.value.push(now)
  return globalMessageTimestampsRef.value.length > MAX_GLOBAL_MESSAGES_PER_SECOND
}

// --- Message building ---

export function buildMessage<T>(
  type: NetworkMessage['type'],
  payload: T,
  displayName: string,
  sequenceCounterRef: { value: number }
): NetworkMessage<T> {
  const peerId = getPeerId()
  if (!peerId) {
    logger.warn('[HostManager] buildMessage called with no peer ID for type:', type)
  }
  return {
    type,
    payload,
    senderId: peerId ?? '',
    senderName: displayName,
    timestamp: Date.now(),
    sequence: sequenceCounterRef.value++
  }
}
