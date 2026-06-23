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

import { lookup } from 'node:dns/promises'
import Bonjour, { type BrowserConfig, type Service } from 'bonjour-service'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  LanGameFoundSchema,
  LanPublishSchema,
  type ValidatedLanGameFound,
  type ValidatedLanPublish
} from '../shared/ipc-schemas'
import { getBmoBaseUrl, setDiscoveredBmoUrl } from './bmo-config'
import { logToFile } from './log'

// bonjour-service@1.4.1 exposes `Service` and `BrowserConfig` as named exports
// (the default export is the `Bonjour` class). Import the types directly rather
// than deriving them off the class surface.

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
export function startBmoDiscovery(): void {
  if (bmoBrowser) return
  logToFile('INFO', '[lan-discovery] BMO discovery starting (browsing _bmo._tcp)')
  bmoBrowser = getBonjour().find({ type: BMO_SERVICE_TYPE })
  bmoBrowser.on('up', (service: Service) => {
    // Prefer a literal IPv4 — that's what Electron's fetch (main AND renderer)
    // can reach without the host OS resolving `bmo.local`, which Windows can't
    // do without Bonjour Print Services. `addresses` is sometimes empty or
    // IPv6-only; bonjour-service still exposes the responder's source IPv4 on
    // `referer.address`, so fall back to that before the (often unresolvable)
    // mDNS hostname. Using the hostname is why Cloud Backup + the signaling
    // probe reported "could not reach the Pi" on LAN.
    const ipv4 = (service.addresses ?? []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a))
    const refererAddr = (service as { referer?: { address?: string } }).referer?.address
    const refererIpv4 = refererAddr && /^\d+\.\d+\.\d+\.\d+$/.test(refererAddr) ? refererAddr : undefined
    const host = ipv4 ?? refererIpv4 ?? service.host ?? service.fqdn
    if (!host) return
    const url = `http://${host}:${service.port ?? 5000}`
    // VERIFY the advertised address is actually reachable from THIS machine
    // before adopting it. mDNS can surface a Pi that direct TCP can't reach —
    // client/AP isolation on the Wi-Fi, a different subnet, or a stale advert —
    // and adopting an unreachable IP made Cloud Backup + the game registry hang
    // on it (ERR_CONNECTION_TIMED_OUT) instead of falling back to the tunnel
    // default. Only add to knownBmoFqdns + adopt on a successful /health probe;
    // if it's not reachable, leave discoveredBmoUrl unset (→ tunnel default) and
    // don't block the 3s fallback probes (which may find a reachable address).
    void (async () => {
      if (await probeUrl(url)) {
        knownBmoFqdns.add(service.fqdn)
        await registerDiscoveredBmoUrl(url, 'mDNS _bmo._tcp')
        // Re-probe signaling now that we have a reachable LAN target.
        probeSignalingServer().catch(() => {})
      } else {
        logToFile(
          'INFO',
          `[lan-discovery] ${url} advertised via mDNS but not reachable from here — keeping tunnel default`
        )
      }
    })()
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

  startSignalingProbe()
}

// ── WebRTC signaling (bmo-peerjs :9000) health probe ───────────────────
// The P2P transport signals through the Pi's PeerServer at `host:9000/myapp`
// (peer-manager.ts). This periodic probe surfaces whether that signaling
// server is reachable so the UI can warn when P2P games would fail to
// connect. It only runs against an http (LAN) Pi target — the off-LAN tunnel
// default does not expose :9000, so probing it would false-alarm "down".

const SIGNALING_PORT = 9000
const SIGNALING_PATH = '/myapp/peerjs/id'
let signalingProbeTimer: ReturnType<typeof setInterval> | null = null

export async function probeSignalingServer(): Promise<void> {
  let host = ''
  let applicable = false
  try {
    const u = new URL(getBmoBaseUrl())
    host = u.hostname
    // Only meaningful for a LAN/http Pi — the https tunnel default does not
    // proxy the raw :9000 PeerServer, so treat that as "not applicable".
    applicable = u.protocol === 'http:'
  } catch {
    applicable = false
  }

  if (!applicable) {
    broadcast(IPC_CHANNELS.BMO_SIGNALING_STATUS, { reachable: null, host, port: SIGNALING_PORT })
    return
  }

  let reachable = false
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1_500)
    // PeerServer's id endpoint returns a fresh peer id with 200 — a cheap liveness ping.
    const resp = await fetch(`http://${host}:${SIGNALING_PORT}${SIGNALING_PATH}`, { signal: controller.signal })
    clearTimeout(t)
    reachable = resp.ok
  } catch {
    reachable = false
  }
  broadcast(IPC_CHANNELS.BMO_SIGNALING_STATUS, { reachable, host, port: SIGNALING_PORT })
}

function startSignalingProbe(): void {
  if (signalingProbeTimer) return
  // Probe shortly after startup (let URL resolution settle), then on a slow
  // cadence — signaling reachability rarely flaps.
  setTimeout(() => probeSignalingServer().catch(() => {}), 4_000)
  signalingProbeTimer = setInterval(() => probeSignalingServer().catch(() => {}), 30_000)
}

async function probeDefaultBmoLocal(): Promise<void> {
  // 1) Hostname-based probes — works when the OS resolver (Bonjour
  //    Print Services on Windows, nss-mdns on Linux) is available.
  const hostnameCandidates = ['http://bmo.local:5000', 'http://bmo:5000']
  for (const url of hostnameCandidates) {
    if (await probeUrl(url)) {
      await registerDiscoveredBmoUrl(url, 'hostname probe')
      return
    }
  }

  // 2) Direct mDNS A-record query via multicast-dns. Bypasses the OS
  //    resolver entirely — works on Windows even without Bonjour
  //    Print Services as long as Windows Firewall lets UDP 5353
  //    inbound through (the firewall prompt usually fires on the
  //    first run of bonjour-service from this app and is remembered).
  const ip = await resolveBmoLocalViaMdns()
  if (ip) {
    const url = `http://${ip}:5000`
    if (await probeUrl(url)) {
      await registerDiscoveredBmoUrl(url, 'mDNS A-record')
      return
    }
  }

  // 3) Last-ditch LAN sweep. Walk the local /24 looking for an HTTP
  //    server at :5000/health that smells like BMO. Only the gateway
  //    + a handful of common Pi-default-ish IPs to keep this fast.
  const lanCandidates = buildLanCandidates()
  for (const ipCandidate of lanCandidates) {
    const url = `http://${ipCandidate}:5000`
    if (await probeUrl(url)) {
      await registerDiscoveredBmoUrl(url, `LAN sweep (${ipCandidate})`)
      return
    }
  }

  logToFile('WARN', '[lan-discovery] BMO Pi not found via mDNS, hostname probe, or LAN sweep')
}

/** Resolve a hostname to a literal IPv4 so the renderer's network service can
 * reach it without its own mDNS/NetBIOS resolver. Returns null if unresolvable;
 * passes a literal IP straight through. */
async function resolveHostToIpv4(host: string): Promise<string | null> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host
  try {
    const { address } = await lookup(host, { family: 4 })
    return /^\d+\.\d+\.\d+\.\d+$/.test(address) ? address : null
  } catch {
    return null
  }
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1_500)
    const resp = await fetch(`${url}/health`, { signal: controller.signal })
    clearTimeout(t)
    return resp.ok
  } catch {
    return false
  }
}

async function registerDiscoveredBmoUrl(url: string, via: string): Promise<void> {
  // The renderer's sandboxed network service (PeerJS signaling WS + WebRTC ICE/
  // STUN) can't resolve a bare hostname like `bmo` even when main's fetch can —
  // the user's P2P games failed with "Failed to resolve address for bmo." (-105),
  // both for the signaling WS (`ws://bmo:9000`) AND the derived `stun:bmo:3478`
  // ICE entry. Register the RESOLVED numeric IPv4 so EVERY consumer of this base —
  // registry/library fetches, Cloud Backup, AND the renderer's signaling/ICE host
  // (configureForP2P derives both from this URL's hostname) — gets a literal IP.
  // resolveHostToIpv4 passes an already-numeric host straight through, so the mDNS
  // A-record / LAN-sweep branches (already IPs) are untouched; only the hostname
  // branches (`bmo`/`bmo.local`) get rewritten.
  const u = new URL(url)
  const ip = await resolveHostToIpv4(u.hostname)
  const finalUrl =
    ip && ip !== u.hostname
      ? `${u.protocol}//${ip}${u.port ? `:${u.port}` : ''}${u.pathname === '/' ? '' : u.pathname}`
      : url
  const suffix = finalUrl !== url ? ` → resolved ${u.hostname} → ${ip}` : ''
  logToFile('INFO', `[lan-discovery] BMO Pi reachable at ${finalUrl} (${via}${suffix})`)
  setDiscoveredBmoUrl(finalUrl)
  broadcast(IPC_CHANNELS.BMO_RESOLVED_URL, { url: finalUrl })
}

/**
 * Query an mDNS A record for `bmo.local` directly via multicast-dns,
 * sidestepping the OS resolver. Works on Windows without Bonjour
 * Print Services when bonjour-service's UDP socket is reachable.
 */
interface MdnsInstance {
  query: (q: { questions: Array<{ name: string; type: string }> }) => void
  on: (event: string, cb: (response: unknown) => void) => void
  destroy: () => void
}

async function resolveBmoLocalViaMdns(): Promise<string | null> {
  let mdns: MdnsInstance
  try {
    const factory = require('multicast-dns') as () => MdnsInstance
    mdns = factory()
  } catch (err) {
    logToFile('WARN', '[lan-discovery] multicast-dns require failed:', String(err))
    return null
  }

  return new Promise<string | null>((resolve) => {
    let settled = false
    const finish = (ip: string | null): void => {
      if (settled) return
      settled = true
      try {
        mdns.destroy()
      } catch {
        // best-effort
      }
      resolve(ip)
    }

    mdns.on('response', (response: unknown) => {
      const answers = (response as { answers?: Array<{ name: string; type: string; data: string }> }).answers ?? []
      for (const a of answers) {
        if (a.name?.toLowerCase() === 'bmo.local' && a.type === 'A' && a.data) {
          finish(a.data)
          return
        }
      }
    })

    mdns.query({ questions: [{ name: 'bmo.local', type: 'A' }] })
    setTimeout(() => finish(null), 2_000)
  })
}

/**
 * Build a small list of likely Pi IPs by looking at our own network
 * interfaces. We probe the gateway-adjacent IPs in our subnet — slow
 * scans across /24 are too noisy, so we stick to the handful of
 * addresses a Pi tends to land on (router DHCP-pool head + tail +
 * a couple common static reservations).
 */
function buildLanCandidates(): string[] {
  // Lazy require so the module's tree-shake stays clean for tests.
  const os = require('node:os') as typeof import('node:os')
  const interfaces = os.networkInterfaces()
  const candidates = new Set<string>()
  for (const list of Object.values(interfaces)) {
    for (const iface of list ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      // address e.g. 192.168.1.42; cidr e.g. 192.168.1.42/24
      const match = iface.address.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/)
      if (!match) continue
      const prefix = `${match[1]}.${match[2]}.${match[3]}.`
      // Most likely-to-host-the-Pi IPs in a typical /24
      for (const last of [1, 2, 50, 100, 101, 102, 200, 254]) {
        candidates.add(`${prefix}${last}`)
      }
    }
  }
  return Array.from(candidates)
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
