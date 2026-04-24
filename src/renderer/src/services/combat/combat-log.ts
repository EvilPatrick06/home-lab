/**
 * Combat Logging & Broadcasting Helpers
 *
 * Shared utilities for logging combat events and broadcasting results
 * via the game store and network layer.
 */

import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import type { CombatLogEntry } from '../../types/game-state'

/** Add an entry to the combat log. */
export function logCombatEntry(entry: Omit<CombatLogEntry, 'id' | 'timestamp' | 'round'>): void {
  const gameStore = useGameStore.getState()
  gameStore.addCombatLogEntry({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    round: gameStore.round
  })
}

/** Broadcast a combat result as a system chat message and network message. */
export function broadcastCombatResult(summary: string, isSecret: boolean): void {
  if (isSecret) return

  const { addChatMessage } = useLobbyStore.getState()
  addChatMessage({
    id: `combat-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: 'system',
    senderName: 'Combat',
    content: summary,
    timestamp: Date.now(),
    isSystem: true
  })

  const { sendMessage } = useNetworkStore.getState()
  sendMessage('chat:message', { message: summary, isSystem: true })
}
