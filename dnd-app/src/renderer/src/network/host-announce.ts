/**
 * Host-side announce lifecycle: publish a hosted dnd-app game to the
 * Pi registry (if public) and to LAN mDNS (always), with a 30s
 * heartbeat keeping the Pi entry alive. (Phase 29g)
 *
 * Owns its own state — call `startHostAnnounce(payload)` after the
 * host's PeerJS session is up, and `stopHostAnnounce()` on teardown.
 * `updateHostAnnounce(patch)` PATCHes the Pi entry when player counts
 * change.
 */

import { type LanPublishPayload, publishLan, unpublishLan } from './lan-discovery'
import {
  announceGame,
  deregisterGame,
  type RegistryAnnouncePayload,
  startHeartbeat,
  updateGame
} from './registry-client'

export interface HostAnnouncePayload extends RegistryAnnouncePayload {
  port?: number
}

interface ActiveAnnounce {
  inviteCode: string
  isPrivate: boolean
  stopHeartbeat: () => void
}

let active: ActiveAnnounce | null = null

export async function startHostAnnounce(payload: HostAnnouncePayload): Promise<void> {
  await stopHostAnnounce()

  const lanPayload: LanPublishPayload = {
    invite_code: payload.invite_code,
    name: payload.name,
    host_display_name: payload.host_display_name,
    host_client_id: payload.host_client_id,
    current_players: payload.current_players,
    max_players: payload.max_players,
    current_spectators: payload.current_spectators,
    max_spectators: payload.max_spectators,
    game_system: payload.game_system,
    is_private: payload.is_private,
    peer_id: payload.peer_id,
    port: payload.port ?? 9999
  }
  await publishLan(lanPayload).catch(() => undefined)

  let stopHeartbeat = (): void => undefined

  if (!payload.is_private) {
    const result = await announceGame(payload).catch((err) => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }))
    if (result.ok) {
      stopHeartbeat = startHeartbeat(payload.invite_code)
    }
    // If the announce failed (Pi unreachable / not configured), we
    // intentionally proceed — LAN discovery still gives same-subnet
    // peers a way in.
  }

  active = { inviteCode: payload.invite_code, isPrivate: payload.is_private, stopHeartbeat }
}

export async function updateHostAnnounce(patch: Partial<RegistryAnnouncePayload>): Promise<void> {
  if (!active) return
  // Update LAN by republishing with the merged data — bonjour TXT records
  // can't be patched in place. Only do it when fields the TXT cares about
  // change.
  // (Caller is expected to pass a complete payload via startHostAnnounce
  // when something material changes; this patch is for the Pi side only.)
  if (active.isPrivate) return
  await updateGame(active.inviteCode, patch).catch(() => undefined)
}

export async function stopHostAnnounce(): Promise<void> {
  if (!active) return
  const current = active
  active = null
  current.stopHeartbeat()
  await unpublishLan().catch(() => undefined)
  if (!current.isPrivate) {
    await deregisterGame(current.inviteCode).catch(() => undefined)
  }
}

export function isHostAnnouncing(): boolean {
  return active !== null
}
