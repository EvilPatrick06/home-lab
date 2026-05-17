/**
 * Per-client ring buffer of outgoing host messages, used for the
 * Phase 29h reconnect resync flow. (Phase 29h)
 *
 * The host pushes every outgoing broadcast onto each connected
 * client's buffer. When a client reconnects with the same stable
 * `clientId` and a `lastSequence` cursor, the buffer is replayed from
 * that point on. If the cursor falls outside the retained window
 * (default 500 entries) the caller falls back to a fresh
 * `game:state-full` snapshot.
 *
 * Storage is in-memory only and reset when hosting stops.
 */

import type { NetworkMessage } from './types'

const DEFAULT_CAPACITY = 500

interface ClientBuffer {
  capacity: number
  entries: NetworkMessage[]
}

const buffers = new Map<string, ClientBuffer>()

export function registerClientBuffer(clientId: string, capacity: number = DEFAULT_CAPACITY): void {
  if (!clientId) return
  if (!buffers.has(clientId)) {
    buffers.set(clientId, { capacity, entries: [] })
  }
}

export function unregisterClientBuffer(clientId: string): void {
  buffers.delete(clientId)
}

export function recordOutgoing(clientIds: Iterable<string>, msg: NetworkMessage): void {
  for (const clientId of clientIds) {
    const buf = buffers.get(clientId)
    if (!buf) continue
    buf.entries.push(msg)
    if (buf.entries.length > buf.capacity) {
      // O(1) amortized — drop the oldest. (Array.shift is O(n) but
      // 500 elements at <60Hz is fine; if it becomes a hotspot we
      // can move to a true circular index.)
      buf.entries.splice(0, buf.entries.length - buf.capacity)
    }
  }
}

export interface ReplaySegment {
  fromSequence: number
  toSequence: number
  fallback: boolean
  messages: NetworkMessage[]
}

export function replayAfter(clientId: string, lastSequence: number): ReplaySegment {
  const buf = buffers.get(clientId)
  if (!buf || buf.entries.length === 0) {
    return { fromSequence: lastSequence, toSequence: lastSequence, fallback: true, messages: [] }
  }
  const oldestSequence = buf.entries[0]?.sequence ?? Number.POSITIVE_INFINITY
  if (lastSequence < oldestSequence - 1) {
    // The requested cursor is older than what we still hold — caller
    // must re-bootstrap with the full state.
    return {
      fromSequence: lastSequence,
      toSequence: buf.entries[buf.entries.length - 1]?.sequence ?? lastSequence,
      fallback: true,
      messages: []
    }
  }
  const messages = buf.entries.filter((m) => m.sequence > lastSequence)
  return {
    fromSequence: lastSequence,
    toSequence: messages.length > 0 ? messages[messages.length - 1].sequence : lastSequence,
    fallback: false,
    messages
  }
}

export function resetReplayBuffers(): void {
  buffers.clear()
}

// Test helper — not exported through the network barrel.
export function _getBufferSizeForTests(clientId: string): number {
  return buffers.get(clientId)?.entries.length ?? 0
}
