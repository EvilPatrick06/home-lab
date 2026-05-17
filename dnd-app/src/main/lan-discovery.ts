/**
 * LAN game discovery via mDNS / Bonjour. (Phase 29g)
 *
 * The main process owns the raw UDP socket (renderer is sandboxed and
 * can't talk to multicast directly). Renderer drives publish/scan via
 * IPC; discovered peers are forwarded back as LAN_GAME_FOUND /
 * LAN_GAME_REMOVED events.
 *
 * Service type: `_dndvtt._tcp`. The TXT record carries the same fields
 * the Pi registry uses for its REST listing, so the renderer can merge
 * both sources into one GameCard render path.
 */

import { Bonjour, type BrowserConfig, type Service } from 'bonjour-service'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  LanGameFoundSchema,
  LanPublishSchema,
  type ValidatedLanGameFound,
  type ValidatedLanPublish
} from '../shared/ipc-schemas'
import { logToFile } from './log'

const SERVICE_TYPE = 'dndvtt'

let bonjour: Bonjour | null = null
let published: Service | null = null
let browser: ReturnType<Bonjour['find']> | null = null
const knownByFqdn = new Map<string, ValidatedLanGameFound>()

function getBonjour(): Bonjour {
  if (!bonjour) bonjour = new Bonjour()
  return bonjour
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

function txtFor(entry: ValidatedLanPublish): Record<string, string> {
  return {
    invite_code: entry.invite_code,
    name: entry.name,
    host_display_name: entry.host_display_name,
    host_client_id: entry.host_client_id,
    current_players: String(entry.current_players),
    max_players: String(entry.max_players),
    current_spectators: String(entry.current_spectators),
    max_spectators: String(entry.max_spectators),
    game_system: entry.game_system,
    is_private: entry.is_private ? '1' : '0',
    peer_id: entry.peer_id
  }
}

function parseTxt(service: Service): ValidatedLanGameFound | null {
  const raw = (service.txt ?? {}) as Record<string, unknown>
  if (!raw.invite_code || !raw.peer_id) return null
  const candidate = {
    source: 'lan' as const,
    invite_code: String(raw.invite_code),
    name: String(raw.name ?? 'Untitled Game'),
    host_display_name: String(raw.host_display_name ?? 'Host'),
    host_client_id: String(raw.host_client_id ?? ''),
    current_players: Number(raw.current_players ?? 0),
    max_players: Number(raw.max_players ?? 8),
    current_spectators: Number(raw.current_spectators ?? 0),
    max_spectators: Number(raw.max_spectators ?? 5),
    game_system: String(raw.game_system ?? 'dnd5e'),
    is_private: String(raw.is_private ?? '0') === '1',
    peer_id: String(raw.peer_id),
    port: service.port,
    host: service.host,
    addresses: service.addresses
  }
  const result = LanGameFoundSchema.safeParse(candidate)
  return result.success ? result.data : null
}

export function publishLan(input: unknown): { ok: boolean; error?: string } {
  const parsed = LanPublishSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid payload' }
  }
  unpublishLan()
  try {
    published = getBonjour().publish({
      name: `${parsed.data.host_display_name} — ${parsed.data.name} [${parsed.data.invite_code}]`,
      type: SERVICE_TYPE,
      port: parsed.data.port,
      txt: txtFor(parsed.data)
    })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logToFile('ERROR', `[lan-discovery] publish failed: ${message}`)
    published = null
    return { ok: false, error: message }
  }
}

export function unpublishLan(): void {
  if (!published) return
  try {
    const svc = published as Service & { stop?: (cb?: () => void) => void }
    svc.stop?.(() => undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logToFile('WARN', `[lan-discovery] unpublish failed: ${message}`)
  }
  published = null
}

export function startLanScan(): { ok: boolean } {
  if (browser) return { ok: true }
  const config: BrowserConfig = { type: SERVICE_TYPE }
  browser = getBonjour().find(config)
  browser.on('up', (service: Service) => {
    const parsed = parseTxt(service)
    if (!parsed) return
    knownByFqdn.set(service.fqdn, parsed)
    broadcast(IPC_CHANNELS.LAN_GAME_FOUND, parsed)
  })
  browser.on('down', (service: Service) => {
    const last = knownByFqdn.get(service.fqdn)
    knownByFqdn.delete(service.fqdn)
    broadcast(IPC_CHANNELS.LAN_GAME_REMOVED, {
      source: 'lan' as const,
      peer_id: last?.peer_id ?? '',
      invite_code: last?.invite_code
    })
  })
  return { ok: true }
}

export function stopLanScan(): void {
  if (!browser) return
  try {
    browser.stop()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logToFile('WARN', `[lan-discovery] stop scan failed: ${message}`)
  }
  browser = null
  knownByFqdn.clear()
}

export function teardownLanDiscovery(): void {
  unpublishLan()
  stopLanScan()
  if (bonjour) {
    try {
      bonjour.destroy()
    } catch {
      // best-effort — process is exiting
    }
    bonjour = null
  }
}
