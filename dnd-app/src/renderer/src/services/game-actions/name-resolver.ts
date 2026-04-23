/**
 * Name resolution helpers — resolve entity names to tokens, maps, players, bastions.
 */

import type { Bastion } from '../../types/bastion'
import type { MapToken } from '../../types/map'
import type { StoreAccessors } from './types'

export function resolveTokenByLabel(tokens: MapToken[], label: string): MapToken | undefined {
  // Exact case-insensitive match first
  const exact = tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  if (exact) return exact
  // Partial match fallback (e.g., "Goblin" matches "Goblin 1")
  return tokens.find((t) => t.label.toLowerCase().startsWith(label.toLowerCase()))
}

export function resolveMapByName(
  maps: Array<{ id: string; name: string }>,
  name: string
): { id: string; name: string } | undefined {
  const exact = maps.find((m) => m.name.toLowerCase() === name.toLowerCase())
  if (exact) return exact
  return maps.find((m) => m.name.toLowerCase().includes(name.toLowerCase()))
}

export function findBastionByOwnerName(bastions: Bastion[], ownerName: string): Bastion | undefined {
  // Match by bastion name or owner name (bastion name often includes character name)
  return bastions.find(
    (b) => b.name.toLowerCase().includes(ownerName.toLowerCase()) || b.ownerId.toLowerCase() === ownerName.toLowerCase()
  )
}

export function resolvePlayerByName(playerName: string, stores: StoreAccessors): string | undefined {
  const players = stores.getLobbyStore().getState().players
  const match = players.find(
    (p) =>
      p.displayName.toLowerCase() === playerName.toLowerCase() ||
      (p.characterName && p.characterName.toLowerCase() === playerName.toLowerCase())
  )
  return match?.peerId
}
