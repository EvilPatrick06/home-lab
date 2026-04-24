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

export async function loadPersistedBans(
  id: string,
  bannedPeers: Set<string>,
  bannedNames: Set<string>,
  bansLoadedRef: { value: boolean }
): Promise<void> {
  if (bansLoadedRef.value) return
  try {
    const bans = await window.api.loadBans(id)
    for (const peerId of bans.peerIds) {
      bannedPeers.add(peerId)
    }
    for (const name of bans.names) {
      bannedNames.add(name.toLowerCase())
    }
    if (bans.peerIds.length > 0 || bans.names.length > 0) {
      logger.debug(
        '[HostManager] Restored',
        bans.peerIds.length,
        'banned peers and',
        bans.names.length,
        'banned names for campaign'
      )
    }
    bansLoadedRef.value = true
  } catch (e) {
    logger.warn('[HostManager] Failed to load persisted bans:', e)
  }
}

export function persistBans(campaignId: string | null, bannedPeers: Set<string>, bannedNames: Set<string>): void {
  if (!campaignId) return
  window.api
    .saveBans(campaignId, {
      peerIds: Array.from(bannedPeers),
      names: Array.from(bannedNames)
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
