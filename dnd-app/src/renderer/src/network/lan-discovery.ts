/**
 * Renderer wrapper around the main-process LAN-discovery IPC.
 * (Phase 29g)
 *
 * Exposes the same `RegistryGameEntry` shape as the Pi-registry client
 * so the UI can merge both streams through one data path.
 */

import type { RegistryGameEntry } from './registry-client'

export type LanEvent =
  | { type: 'found'; game: RegistryGameEntry }
  | { type: 'removed'; peerId: string; inviteCode?: string }

function toRegistryEntry(raw: Record<string, unknown>): RegistryGameEntry {
  return {
    source: 'pi',
    invite_code: String(raw.invite_code ?? ''),
    name: String(raw.name ?? 'Untitled'),
    host_display_name: String(raw.host_display_name ?? 'Host'),
    host_client_id: String(raw.host_client_id ?? ''),
    current_players: Number(raw.current_players ?? 0),
    max_players: Number(raw.max_players ?? 8),
    current_spectators: Number(raw.current_spectators ?? 0),
    max_spectators: Number(raw.max_spectators ?? 5),
    game_system: String(raw.game_system ?? 'dnd5e'),
    is_private: Boolean(raw.is_private),
    peer_id: String(raw.peer_id ?? ''),
    created_at: Date.now() / 1000,
    banned_from_this_game: false
  }
}

export interface LanPublishPayload {
  invite_code: string
  name: string
  host_display_name: string
  host_client_id: string
  current_players: number
  max_players: number
  current_spectators: number
  max_spectators: number
  game_system: string
  is_private: boolean
  peer_id: string
  port?: number
}

export async function startLanScan(): Promise<{ ok: boolean; error?: string }> {
  if (!window.api?.lan) return { ok: false, error: 'LAN API not available' }
  return window.api.lan.startScan()
}

export async function stopLanScan(): Promise<void> {
  if (!window.api?.lan) return
  await window.api.lan.stopScan()
}

export async function publishLan(payload: LanPublishPayload): Promise<{ ok: boolean; error?: string }> {
  if (!window.api?.lan) return { ok: false, error: 'LAN API not available' }
  return window.api.lan.publish({ ...payload, port: payload.port ?? 9999 })
}

export async function unpublishLan(): Promise<void> {
  if (!window.api?.lan) return
  await window.api.lan.unpublish()
}

export function subscribeToLan(onEvent: (event: LanEvent) => void): () => void {
  if (!window.api?.lan) return () => undefined
  const unsubFound = window.api.lan.onGameFound((entry) => {
    // Tag as LAN by overlaying source after conversion — the type
    // surface keeps `source: 'pi'` for now since GameList renders both
    // identically; if we ever need a "LAN" pill the type union expands.
    onEvent({
      type: 'found',
      game: { ...toRegistryEntry(entry as unknown as Record<string, unknown>), source: 'pi' }
    })
  })
  const unsubRemoved = window.api.lan.onGameRemoved((entry) => {
    onEvent({ type: 'removed', peerId: String(entry.peer_id ?? ''), inviteCode: entry.invite_code })
  })
  return () => {
    unsubFound()
    unsubRemoved()
  }
}
