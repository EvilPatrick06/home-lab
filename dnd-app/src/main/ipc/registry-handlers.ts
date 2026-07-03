/**
 * Pi game-registry IPC handlers.
 *
 * Bridges the renderer's `window.api.registry.*` calls to the main-process
 * registry client (registry-bridge.ts), so the renderer makes ZERO direct
 * http(s) fetch/EventSource to the Pi for game discovery. The live feed is
 * main-process polling pushed back via REGISTRY_EVENT.
 */

import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { sanitizeRendererBaseOverride } from '../bmo-config'
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
import { logSecurityEvent } from '../security-log'
import { fetchTurnCredentials } from '../turn-bridge'
import { handle, withArgsSchema } from './_safe'

// ── Renderer baseOverride hardening (SECURITY 2026-07-02) ──────────────────
// The optional `baseOverride` arg used to flow verbatim from the renderer into
// a credentialed main-process fetch (token-leak / SSRF — the secret-trust gate
// checked the RESOLVED base, not the override). Now every handler (a) zod-
// validates the argument tuple, and (b) narrows the override to the KNOWN Pi
// bases via sanitizeRendererBaseOverride — an unknown/invalid override is
// dropped (fetch falls back to the resolved base) and logged.

// Absent/empty means "no override". A present value must look like a URL;
// sanitizeRendererBaseOverride then enforces the known-Pi-base allowlist.
const BaseOverrideSchema = z.union([z.undefined(), z.null(), z.literal(''), z.string().url().max(2048)]).optional()
type RawBaseOverride = z.infer<typeof BaseOverrideSchema>

const InviteCodeSchema = z.string().min(1).max(64)

function effectiveBaseOverride(channel: string, raw: RawBaseOverride): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const sanitized = sanitizeRendererBaseOverride(raw)
  if (!sanitized) {
    logSecurityEvent('registry.base_override.rejected', { channel, override: raw.slice(0, 256) })
  }
  return sanitized
}

export function registerRegistryHandlers(): void {
  // PHASE-53B — mint an ephemeral coturn credential (main-process fetch).
  handle(
    IPC_CHANNELS.TURN_CREDENTIALS,
    withArgsSchema(IPC_CHANNELS.TURN_CREDENTIALS, z.tuple([BaseOverrideSchema]), async (_event, baseOverride) =>
      fetchTurnCredentials(effectiveBaseOverride(IPC_CHANNELS.TURN_CREDENTIALS, baseOverride))
    )
  )

  handle(
    IPC_CHANNELS.REGISTRY_ANNOUNCE,
    withArgsSchema(
      IPC_CHANNELS.REGISTRY_ANNOUNCE,
      z.tuple([z.record(z.string(), z.unknown()), BaseOverrideSchema]),
      async (_event, payload, baseOverride): Promise<{ ok: boolean; error?: string }> =>
        announceGame(
          payload as unknown as RegistryAnnouncePayload,
          effectiveBaseOverride(IPC_CHANNELS.REGISTRY_ANNOUNCE, baseOverride)
        )
    )
  )

  handle(
    IPC_CHANNELS.REGISTRY_UPDATE,
    withArgsSchema(
      IPC_CHANNELS.REGISTRY_UPDATE,
      z.tuple([InviteCodeSchema, z.record(z.string(), z.unknown()), BaseOverrideSchema]),
      async (_event, inviteCode, patch, baseOverride): Promise<{ ok: boolean; error?: string }> =>
        updateGame(
          inviteCode,
          patch as Partial<RegistryAnnouncePayload>,
          effectiveBaseOverride(IPC_CHANNELS.REGISTRY_UPDATE, baseOverride)
        )
    )
  )

  handle(
    IPC_CHANNELS.REGISTRY_HEARTBEAT,
    withArgsSchema(
      IPC_CHANNELS.REGISTRY_HEARTBEAT,
      z.tuple([InviteCodeSchema, BaseOverrideSchema]),
      async (_event, inviteCode, baseOverride): Promise<{ ok: boolean }> =>
        heartbeatGame(inviteCode, effectiveBaseOverride(IPC_CHANNELS.REGISTRY_HEARTBEAT, baseOverride))
    )
  )

  handle(
    IPC_CHANNELS.REGISTRY_DEREGISTER,
    withArgsSchema(
      IPC_CHANNELS.REGISTRY_DEREGISTER,
      z.tuple([InviteCodeSchema, BaseOverrideSchema]),
      async (_event, inviteCode, baseOverride): Promise<{ ok: boolean }> =>
        deregisterGame(inviteCode, effectiveBaseOverride(IPC_CHANNELS.REGISTRY_DEREGISTER, baseOverride))
    )
  )

  // Returns the raw entries (renderer adds the `source: 'pi'` tag). On failure
  // the _safe wrapper turns a throw into `{ success: false, error }`, but the
  // renderer expects an array — so we catch here and surface the error in a
  // discriminated envelope the renderer unwraps.
  handle(
    IPC_CHANNELS.REGISTRY_LIST,
    withArgsSchema(
      IPC_CHANNELS.REGISTRY_LIST,
      z.tuple([z.string().max(128).nullable(), BaseOverrideSchema]),
      async (
        _event,
        clientId,
        baseOverride
      ): Promise<{ ok: true; games: RegistryGameEntryRaw[] } | { ok: false; error: string }> => {
        try {
          const games = await listGames(clientId, effectiveBaseOverride(IPC_CHANNELS.REGISTRY_LIST, baseOverride))
          return { ok: true, games }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
    )
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
