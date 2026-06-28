/**
 * Pi game-registry IPC handlers.
 *
 * Bridges the renderer's `window.api.registry.*` calls to the main-process
 * registry client (registry-bridge.ts), so the renderer makes ZERO direct
 * http(s) fetch/EventSource to the Pi for game discovery. The live feed is
 * main-process polling pushed back via REGISTRY_EVENT.
 */

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { logToFile } from '../log'
import {
  announceGame,
  deregisterGame,
  heartbeatGame,
  listGames,
  type RegistryAnnouncePayload,
  type RegistryGameEntryRaw,
  subscribeToRegistry,
  unsubscribeFromRegistry,
  updateGame
} from '../registry-bridge'
import { fetchTurnCredentials } from '../turn-bridge'
import { handle } from './_safe'

export function registerRegistryHandlers(): void {
  // PHASE-53B — mint an ephemeral coturn credential (main-process fetch).
  handle(IPC_CHANNELS.TURN_CREDENTIALS, async (_event, baseOverride?: string) => fetchTurnCredentials(baseOverride))

  handle(
    IPC_CHANNELS.REGISTRY_ANNOUNCE,
    async (_event, payload: RegistryAnnouncePayload, baseOverride?: string): Promise<{ ok: boolean; error?: string }> =>
      announceGame(payload, baseOverride)
  )

  handle(
    IPC_CHANNELS.REGISTRY_UPDATE,
    async (
      _event,
      inviteCode: string,
      patch: Partial<RegistryAnnouncePayload>,
      baseOverride?: string
    ): Promise<{ ok: boolean; error?: string }> => updateGame(inviteCode, patch, baseOverride)
  )

  handle(
    IPC_CHANNELS.REGISTRY_HEARTBEAT,
    async (_event, inviteCode: string, baseOverride?: string): Promise<{ ok: boolean }> =>
      heartbeatGame(inviteCode, baseOverride)
  )

  handle(
    IPC_CHANNELS.REGISTRY_DEREGISTER,
    async (_event, inviteCode: string, baseOverride?: string): Promise<{ ok: boolean }> =>
      deregisterGame(inviteCode, baseOverride)
  )

  // Returns the raw entries (renderer adds the `source: 'pi'` tag). On failure
  // the _safe wrapper turns a throw into `{ success: false, error }`, but the
  // renderer expects an array — so we catch here and surface the error in a
  // discriminated envelope the renderer unwraps.
  handle(
    IPC_CHANNELS.REGISTRY_LIST,
    async (
      _event,
      clientId: string | null,
      baseOverride?: string
    ): Promise<{ ok: true; games: RegistryGameEntryRaw[] } | { ok: false; error: string }> => {
      try {
        const games = await listGames(clientId, baseOverride)
        return { ok: true, games }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  handle(IPC_CHANNELS.REGISTRY_SUBSCRIBE, async (_event, subscriptionId: string, clientId: string | null) => {
    subscribeToRegistry(subscriptionId, clientId)
    return { ok: true }
  })

  handle(IPC_CHANNELS.REGISTRY_UNSUBSCRIBE, async (_event, subscriptionId: string) => {
    unsubscribeFromRegistry(subscriptionId)
    return { ok: true }
  })

  logToFile('INFO', 'Registry IPC handlers registered')
}
