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
import { setDiscoveredBmoUrl } from './bmo-config'
import { logToFile } from './log'

const SERVICE_TYPE = 'dndvtt'
const BMO_SERVICE_TYPE = 'bmo'

let bonjour: Bonjour | null = null
let published: Service | null = null
let browser: ReturnType<Bonjour['find']> | null = null
let bmoBrowser: ReturnType<Bonjour['find']> | null = null
const knownByFqdn = new Map<string, ValidatedLanGameFound>()
const knownBmoFqdns = new Set<string>()

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
  startBmoDiscovery()
  return { ok: true }
}

/**
 * Browse for the BMO Pi's `_bmo._tcp` service. The Pi advertises this
 * via its avahi configuration (see bmo/setup-bmo.sh). On discovery we
 * set the resolved URL in bmo-config + broadcast BMO_RESOLVED_URL to
 * the renderer so the registry-client can use it without the user
 * having to install Bonjour Print Services on Windows or type a URL
 * into Settings.
 */
function startBmoDiscovery(): void {
  if (bmoBrowser) return
  logToFile('INFO', '[lan-discovery] BMO discovery starting (browsing _bmo._tcp)')
  bmoBrowser = getBonjour().find({ type: BMO_SERVICE_TYPE })
  bmoBrowser.on('up', (service: Service) => {
    // Prefer an IPv4 address — that's what Electron's fetch can use
    // without depending on the host OS's mDNS resolver.
    const ipv4 = (service.addresses ?? []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a))
    const host = ipv4 ?? service.host ?? service.fqdn
    if (!host) return
    const url = `http://${host}:${service.port ?? 5000}`
    knownBmoFqdns.add(service.fqdn)
    setDiscoveredBmoUrl(url)
    broadcast(IPC_CHANNELS.BMO_RESOLVED_URL, { url })
    logToFile('INFO', `[lan-discovery] BMO Pi discovered at ${url} (via _bmo._tcp)`)
  })
  bmoBrowser.on('down', (service: Service) => {
    knownBmoFqdns.delete(service.fqdn)
    if (knownBmoFqdns.size === 0) {
      setDiscoveredBmoUrl(null)
      broadcast(IPC_CHANNELS.BMO_RESOLVED_URL, { url: null })
      logToFile('INFO', '[lan-discovery] BMO Pi went away')
    }
  })

  // v2.1.16 fallback: bonjour-service browse depends on inbound UDP
  // 5353 being unblocked by Windows Firewall + the OS's mDNS responder
  // surfacing the service. On environments where that fails (firewall
  // prompt dismissed, corp WiFi blocking multicast, etc.) the user
  // never sees the Pi. After 3 seconds with no mDNS hit, fall back to
  // a direct HTTP probe of the default `bmo.local:5000` — if it
  // responds, register that URL ourselves so the renderer's
  // registry-client can use it.
  setTimeout(() => {
    if (knownBmoFqdns.size > 0) return
    probeDefaultBmoLocal().catch((err) => logToFile('WARN', '[lan-discovery] default-host probe failed:', String(err)))
  }, 3_000)
}

async function probeDefaultBmoLocal(): Promise<void> {
  const candidates = [
    'http://bmo.local:5000',
    'http://bmo:5000' // Some OSes resolve bare hostname via NetBIOS / netbridge.
  ]
  for (const url of candidates) {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 2_000)
      const resp = await fetch(`${url}/health`, { signal: controller.signal })
      clearTimeout(t)
      if (!resp.ok) continue
      logToFile('INFO', `[lan-discovery] BMO Pi reachable via direct probe at ${url}`)
      setDiscoveredBmoUrl(url)
      broadcast(IPC_CHANNELS.BMO_RESOLVED_URL, { url })
      return
    } catch {
      // candidate unreachable — try the next one
    }
  }
  logToFile('WARN', '[lan-discovery] BMO Pi not found via mDNS or direct probe')
}

function stopBmoDiscovery(): void {
  if (!bmoBrowser) return
  try {
    bmoBrowser.stop()
  } catch {
    // best-effort
  }
  bmoBrowser = null
  knownBmoFqdns.clear()
  setDiscoveredBmoUrl(null)
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
  stopBmoDiscovery()
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
