/**
 * WEB build implementation of `window.api` — the browser counterpart to the
 * Electron preload bridge (`src/preload/index.ts`). The desktop renderer reaches
 * every native/main-process capability through `window.api.*`; in the browser
 * there is no preload, so this module recreates the SAME object shape, routing:
 *
 *   - storage / settings / per-entity content  → IndexedDB (see `idb.ts`)
 *   - bundled 5e game data (`game.load*`)       → fetch from the static bundle
 *   - library / sounds / registry / cloud / bmo → the BMO Pi backend (same-origin
 *     when served from the Cloudflare tunnel; CORS-allowed prefixes otherwise)
 *   - file dialogs / fs                         → File System Access + download
 *   - desktop-only (updater, LAN mDNS, Ollama)  → safe no-ops (capability-gated)
 *
 * Keeping the shape identical to the preload means the 127 renderer call sites
 * need zero changes. Methods not yet bridged resolve to conservative defaults so
 * the UI degrades gracefully instead of throwing.
 */

// Browser-pure apply core — SAME logic the desktop main process uses, so an
// approved AI-DM stat change mutates the persisted character identically on web.
import { applyChangesToCharacter, buildLongRestChanges, buildShortRestChanges } from '../main/ai/stat-mutations-core'
import type { StatChange } from '../main/ai/types'
import type { Character5eV3 } from '../shared/types/character-5e'
import { parseAiMutations } from './ai-mutations'
import { idbDelete, idbGet, idbGetAll, idbKeys, idbSet, idbWipeAll, type StoreName } from './idb'

// ── Backend base URL ────────────────────────────────────────────────
// Served same-origin behind the Cloudflare tunnel in production ('' → /api/*).
// For `dev:web` (localhost) point at the public tunnel via VITE_BMO_BASE.
const BMO_BASE: string = (import.meta.env.VITE_BMO_BASE as string | undefined) ?? ''
// Static asset base (Vite `base`, e.g. /TableOnline/). Bundled 5e JSON lives here.
const ASSET_BASE: string = import.meta.env.BASE_URL ?? '/'

async function bmoFetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // Default Content-Type for JSON bodies — Flask's request.get_json() returns None
  // (→ fields read as missing) unless the mimetype is application/json. The registry
  // mutations (/api/games announce/patch) post a JSON body with no header otherwise.
  const headers =
    init?.body != null
      ? { 'Content-Type': 'application/json', ...((init.headers as Record<string, string> | undefined) ?? {}) }
      : init?.headers
  const res = await fetch(`${BMO_BASE}${path}`, { credentials: 'include', ...init, headers })
  if (!res.ok) throw new Error(`BMO ${path} → ${res.status}`)
  return (await res.json()) as T
}

// ── Lightweight main→renderer event bus (replaces ipcRenderer.on) ────
const busListeners = new Map<string, Set<(data: unknown) => void>>()

// In-flight AI streams, so cancelStream can abort the underlying fetch.
const aiAborters = new Map<string, AbortController>()

// Per-campaign DM conversation history (bounded) for multi-turn continuity.
const dmHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()

function busOn(channel: string, cb: (data: unknown) => void): () => void {
  let set = busListeners.get(channel)
  if (!set) {
    set = new Set()
    busListeners.set(channel, set)
  }
  set.add(cb)
  return () => set?.delete(cb)
}

function busClear(channel: string): void {
  busListeners.get(channel)?.clear()
}

/** Emit a synthetic main→renderer event (used by bridged backend streams). */
export function webEmit(channel: string, data: unknown): void {
  for (const cb of busListeners.get(channel) ?? []) cb(data)
}

// ── Helpers ─────────────────────────────────────────────────────────
function genId(): string {
  return (crypto as Crypto).randomUUID()
}

type Dict = Record<string, unknown>
const ok = { success: true } as const

// ── Account session (web): bearer token persisted in IndexedDB `kv` ──
const WEB_TOKEN_KEY = 'account:session'
async function getWebToken(): Promise<string | null> {
  return ((await idbGet<string>('kv', WEB_TOKEN_KEY)) as string | undefined) ?? null
}
async function setWebToken(token: string): Promise<void> {
  await idbSet('kv', WEB_TOKEN_KEY, token)
}
async function clearWebToken(): Promise<void> {
  await idbDelete('kv', WEB_TOKEN_KEY)
}

/**
 * On boot, capture an account bearer token handed back by the Pi's OAuth
 * callback. Production (served from the tunnel host) delivers it in the URL
 * fragment (`#token=`); dev:web (localhost loopback) gets it as a `?token=`
 * query. Persists it and strips it from the URL. Called by install-web-api.
 */
export async function captureWebAuthToken(): Promise<void> {
  try {
    const fromHash = new URLSearchParams((location.hash || '').replace(/^#/, ''))
    const fromQuery = new URLSearchParams(location.search || '')
    const token = fromHash.get('token') || fromQuery.get('token')
    if (token) {
      await setWebToken(token)
      history.replaceState(null, '', location.pathname)
    } else if ((location.hash || '').includes('error=')) {
      history.replaceState(null, '', location.pathname)
    }
  } catch {
    /* ignore — login simply won't be captured */
  }
}

async function saveEntity(store: StoreName, entity: Dict): Promise<Dict> {
  const id = (entity.id as string | undefined) ?? genId()
  const withId = { ...entity, id }
  await idbSet(store, id, withId)
  // PHASE-47 F1 — return the desktop `{ success: true }` StorageResult contract
  // (plus the id/entity for callers that read it). The persisted record
  // (`withId`) is unchanged — `success` lives only on the return value. Without
  // it, a store guard like `if (result && !result.success)` (bastion-store) saw
  // `success === undefined`, bailed before `set()`, and the UI went stale until
  // a reload.
  return { ...withId, success: true }
}

async function loadJson<T = unknown>(path: string): Promise<T | null> {
  const clean = path.replace(/^\.\//, '').replace(/^\//, '')
  try {
    const res = await fetch(`${ASSET_BASE}${clean}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function pickFile(accept = ''): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

// ── AI DM tool context builders (web bridge → Pi public endpoints) ───
function buildMapDescription(gameState: Record<string, unknown>): string {
  const maps = (gameState.maps as Array<Record<string, unknown>> | undefined) ?? []
  const activeId = gameState.activeMapId as string | undefined
  const map = maps.find((m) => m.id === activeId) ?? maps[0]
  if (!map) return ''
  const tokens = (map.tokens as Array<Record<string, unknown>> | undefined) ?? []
  const lines = [
    `Map: "${map.name ?? 'Unnamed'}" (${map.gridWidth ?? '?'}x${map.gridHeight ?? '?'} grid)`,
    '',
    'Token positions:'
  ]
  for (const t of tokens) {
    let line = `  - ${t.label ?? 'token'} (${t.entityType ?? 'unknown'}) at (${t.gridX ?? 0}, ${t.gridY ?? 0})`
    if (t.currentHP != null && t.maxHP != null) line += ` HP: ${t.currentHP}/${t.maxHP}`
    if (t.ac != null) line += ` AC: ${t.ac}`
    const conds = t.conditions as string[] | undefined
    if (conds?.length) line += ` Conditions: ${conds.join(', ')}`
    lines.push(line)
  }
  if (tokens.length === 0) lines.push('  (no tokens on map)')
  return lines.join('\n')
}

/** Assemble recap/Q&A context from what the web client has: the in-memory DM
 * conversation + the campaign record. (Desktop has richer RAG/memory.) */
async function buildRecapContext(campaignId: string): Promise<string> {
  const parts: string[] = []
  const history = dmHistory.get(campaignId) ?? []
  if (history.length > 0) {
    parts.push(
      `[CONVERSATION]\n${history
        .map((m) => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.content}`)
        .join('\n')
        .slice(0, 6000)}`
    )
  }
  try {
    const camp = await idbGet<Record<string, unknown>>('campaigns', campaignId)
    if (camp) {
      const bits: string[] = []
      if (camp.name) bits.push(`Name: ${String(camp.name)}`)
      if (camp.description) bits.push(`Description: ${String(camp.description).slice(0, 1500)}`)
      const journal = (camp.journal as Array<{ content?: string; text?: string }> | undefined) ?? []
      if (journal.length > 0) {
        bits.push(
          `Journal:\n${journal
            .slice(-10)
            .map((j) => `- ${String(j.content ?? j.text ?? '').slice(0, 300)}`)
            .join('\n')}`
        )
      }
      if (bits.length > 0) parts.push(`[CAMPAIGN]\n${bits.join('\n')}`)
    }
  } catch {
    /* campaign not in idb */
  }
  return parts.join('\n\n')
}

// ── The api object — mirrors src/preload/index.ts exactly ────────────
export function createWebApi() {
  const api = {
    // Character storage
    saveCharacter: (character: Dict) => saveEntity('characters', character),
    loadCharacters: () => idbGetAll('characters'),
    loadCharacter: (id: string) => idbGet('characters', id),
    deleteCharacter: async (id: string) => {
      await idbDelete('characters', id)
      return ok
    },
    wipeAllData: async () => {
      await idbWipeAll()
      return ok
    },
    // WEB-API-1 (PHASE-60) — the web build has no `.versions/` snapshot store
    // (those come from the Electron main process, which the web build does not
    // run), so version history is empty and restore has nothing to restore.
    // Return the `{ success, data }` StorageResult envelope the call sites
    // destructure (NOT a bare `[]`/`null`, which throws on `.success`), so the
    // panels degrade cleanly to an empty state instead of erroring.
    listCharacterVersions: (_id: string) => Promise.resolve({ success: true, data: [] as unknown[] }),
    restoreCharacterVersion: (_id: string, _fileName: string) => Promise.resolve({ success: false }),

    // Campaign storage
    saveCampaign: (campaign: Dict) => saveEntity('campaigns', campaign),
    loadCampaigns: () => idbGetAll('campaigns'),
    loadCampaign: (id: string) => idbGet('campaigns', id),
    deleteCampaign: async (id: string) => {
      await idbDelete('campaigns', id)
      return ok
    },
    // WEB-API-1 (PHASE-60) — campaign-version parity stubs, same rationale as the
    // character-version stubs above. The panel itself is gated off on web
    // (CampaignDetailPage), so these are a defensive parity floor: any code that
    // reaches them gets a clean empty-history / restore-unavailable envelope
    // instead of a `TypeError: window.api.listCampaignVersions is not a function`.
    listCampaignVersions: (_id: string) => Promise.resolve({ success: true, data: [] as unknown[] }),
    restoreCampaignVersion: (_id: string, _fileName: string) => Promise.resolve({ success: false }),

    // Bastion storage
    saveBastion: (bastion: Dict) => saveEntity('bastions', bastion),
    loadBastions: () => idbGetAll('bastions'),
    loadBastion: (id: string) => idbGet('bastions', id),
    deleteBastion: async (id: string) => {
      await idbDelete('bastions', id)
      return ok
    },

    // Custom creature storage
    saveCustomCreature: (creature: Dict) => saveEntity('custom-creatures', creature),
    loadCustomCreatures: () => idbGetAll('custom-creatures'),
    loadCustomCreature: (id: string) => idbGet('custom-creatures', id),
    deleteCustomCreature: async (id: string) => {
      await idbDelete('custom-creatures', id)
      return ok
    },

    // Homebrew storage (keyed `<category>/<id>`)
    saveHomebrew: async (entry: Dict) => {
      const id = (entry.id as string | undefined) ?? genId()
      const category = (entry.category as string | undefined) ?? 'misc'
      const withId = { ...entry, id, category }
      await idbSet('homebrew', `${category}/${id}`, withId)
      return withId
    },
    loadHomebrewByCategory: async (category: string) => {
      const all = (await idbGetAll<Dict>('homebrew')) ?? []
      return all.filter((e) => e.category === category)
    },
    loadAllHomebrew: () => idbGetAll('homebrew'),
    deleteHomebrew: async (category: string, id: string) => {
      await idbDelete('homebrew', `${category}/${id}`)
      return ok
    },

    // File dialogs → File System Access / download-upload
    showSaveDialog: (options: { title: string; defaultPath?: string }) =>
      Promise.resolve({ canceled: false, filePath: options.defaultPath ?? 'export.json' }),
    showOpenDialog: async (_options: { title: string }) => {
      const file = await pickFile()
      return file ? { canceled: false, filePaths: [file.name], __file: file } : { canceled: true, filePaths: [] }
    },

    // Game state storage (keyed by campaignId)
    saveGameState: async (campaignId: string, state: Dict) => {
      await idbSet('game-state', campaignId, state)
      return ok
    },
    loadGameState: (campaignId: string) => idbGet('game-state', campaignId),
    deleteGameState: async (campaignId: string) => {
      await idbDelete('game-state', campaignId)
      return ok
    },

    // Ban storage
    loadBans: async (campaignId: string) =>
      (await idbGet('bans', campaignId)) ?? { peerIds: [], names: [], clients: [] },
    saveBans: async (campaignId: string, banData: Dict) => {
      await idbSet('bans', campaignId, banData)
      return ok
    },

    // File I/O → IndexedDB-backed virtual fs
    readFile: (path: string) => idbGet('kv', `fs:${path}`),
    readFileBinary: (path: string) => idbGet('kv', `fsb:${path}`),
    writeFile: async (path: string, content: string) => {
      await idbSet('kv', `fs:${path}`, content)
      return ok
    },
    writeFileBinary: async (path: string, buffer: ArrayBuffer) => {
      await idbSet('kv', `fsb:${path}`, buffer)
      return ok
    },

    // Window controls → Fullscreen API
    toggleFullscreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen().catch(() => undefined)
      return !!document.fullscreenElement
    },
    isFullscreen: () => Promise.resolve(!!document.fullscreenElement),
    openDevTools: () => Promise.resolve(),

    // AI DM — bridged to the Pi where wired; conservative stubs otherwise.
    ai: createAiStub(),

    // AI image generation (opt-in) — stubbed for web MVP.
    aiImage: {
      getConfig: () => Promise.resolve({ enabled: false, provider: 'none' }),
      configure: (config: Dict) => idbSet('kv', 'ai-image-config', config).then(() => ok),
      checkProviders: () => Promise.resolve({ available: [] as string[] }),
      generate: (_request: Dict) => Promise.reject(new Error('AI image generation is not available in the web build')),
      onProgress: (_cb: (d: { progress: number; etaSeconds: number }) => void) => undefined,
      removeProgressListener: () => undefined
    },

    // App updates → replaced by deploy-on-release; no-ops in the web build.
    update: {
      checkForUpdates: () => Promise.resolve({ state: 'web', message: 'Web build auto-updates on deploy' }),
      downloadUpdate: () => Promise.resolve(),
      installUpdate: () => Promise.resolve(),
      onStatus: (_cb: (s: Dict) => void) => () => undefined,
      removeStatusListener: () => undefined
    },

    // LAN discovery (mDNS) — not available in browsers; off-LAN uses the Pi.
    lan: {
      startScan: () => Promise.resolve(ok),
      stopScan: () => Promise.resolve(ok),
      publish: (_entry: Dict) => Promise.resolve(ok),
      unpublish: () => Promise.resolve(ok),
      onGameFound: (_cb: (e: Dict) => void) => () => undefined,
      onGameRemoved: (_cb: (e: Dict) => void) => () => undefined,
      onBmoResolvedUrl: (_cb: (p: { url: string | null }) => void) => () => undefined,
      // PHASE-45 F5 — wire the signaling status through the bus so the
      // settings badge reaches a TERMINAL state instead of sitting on
      // "Checking…". The store subscribes here at import; probeSignaling()
      // (called on mount) emits a single { reachable: null } → the badge
      // renders "Not applicable" (the off-LAN/tunnel default).
      onBmoSignalingStatus: (cb: (p: { reachable: boolean | null; host: string; port: number }) => void) =>
        busOn('lan:signaling-status', cb as (d: unknown) => void),
      probeSignaling: () => {
        webEmit('lan:signaling-status', { reachable: null, host: '', port: 0 })
        return Promise.resolve({ reachable: null })
      }
    },

    // Settings → IndexedDB
    saveSettings: async (settings: Dict) => {
      await idbSet('settings', 'app', settings)
      return ok
    },
    loadSettings: async () => (await idbGet('settings', 'app')) ?? {},

    // Audio custom tracks → IndexedDB blobs + object URLs
    audioUploadCustom: async (
      campaignId: string,
      fileName: string,
      buffer: ArrayBuffer,
      displayName: string,
      category: string
    ) => {
      await idbSet('audio', `${campaignId}/${fileName}`, { buffer, displayName, category, fileName })
      return ok
    },
    audioListCustom: async (campaignId: string) => {
      const keys = await idbKeys('audio')
      const mine = keys.filter((k) => k.startsWith(`${campaignId}/`))
      return Promise.all(
        mine.map(async (k) => {
          const rec = (await idbGet<Dict>('audio', k)) ?? {}
          return { fileName: rec.fileName, displayName: rec.displayName, category: rec.category }
        })
      )
    },
    audioDeleteCustom: async (campaignId: string, fileName: string) => {
      await idbDelete('audio', `${campaignId}/${fileName}`)
      return ok
    },
    audioGetCustomPath: async (campaignId: string, fileName: string) => {
      const rec = await idbGet<Dict>('audio', `${campaignId}/${fileName}`)
      if (!rec?.buffer) return null
      return URL.createObjectURL(new Blob([rec.buffer as ArrayBuffer]))
    },
    audioPickFile: async () => {
      const file = await pickFile('audio/*')
      if (!file) return { canceled: true }
      return { canceled: false, fileName: file.name, buffer: await file.arrayBuffer() }
    },

    // App info
    getVersion: () => Promise.resolve(__APP_VERSION__),

    // App log — the browser build has no main-process log file.
    log: {
      openFolder: () => Promise.resolve({ ok: false, path: '' }),
      getPath: () => Promise.resolve('')
    },

    // Security audit → console (no main-process log in the browser)
    logSecurityEvent: (event: string, details?: Dict) => {
      console.info('[security]', event, details ?? {})
      return Promise.resolve(ok)
    },

    // Game data — bundled 5e JSON fetched from the static bundle
    game: createGameApi(),

    // Map Library → IndexedDB
    mapLibrary: {
      save: async (id: string, name: string, data: Dict) => {
        await idbSet('map-library', id, { id, name, data })
        return ok
      },
      list: async () => ((await idbGetAll<Dict>('map-library')) ?? []).map((m) => ({ id: m.id, name: m.name })),
      get: (id: string) => idbGet('map-library', id),
      delete: async (id: string) => {
        await idbDelete('map-library', id)
        return ok
      }
    },

    // Shop Templates → IndexedDB
    shopTemplates: {
      save: async (template: Dict) => {
        await idbSet('shop-templates', template.id as string, template)
        return ok
      },
      list: () => idbGetAll('shop-templates'),
      get: (id: string) => idbGet('shop-templates', id),
      delete: async (id: string) => {
        await idbDelete('shop-templates', id)
        return ok
      }
    },

    // Image Library → IndexedDB blobs
    imageLibrary: {
      save: async (id: string, name: string, buffer: ArrayBuffer, extension: string) => {
        await idbSet('image-library', id, { id, name, buffer, extension })
        return ok
      },
      list: async () =>
        ((await idbGetAll<Dict>('image-library')) ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          extension: i.extension
        })),
      get: (id: string) => idbGet('image-library', id),
      readData: async (id: string) => {
        const rec = await idbGet<Dict>('image-library', id)
        if (!rec?.buffer) return null
        return URL.createObjectURL(new Blob([rec.buffer as ArrayBuffer]))
      },
      delete: async (id: string) => {
        await idbDelete('image-library', id)
        return ok
      }
    },

    // Books → IndexedDB (config + per-book data)
    books: {
      loadConfig: async () => (await idbGet('kv', 'books-config')) ?? { books: [] },
      add: async (config: Dict) => {
        const cfg = ((await idbGet<{ books: Dict[] }>('kv', 'books-config')) ?? { books: [] }) as { books: Dict[] }
        cfg.books.push(config)
        await idbSet('kv', 'books-config', cfg)
        return ok
      },
      remove: async (bookId: string) => {
        const cfg = ((await idbGet<{ books: Dict[] }>('kv', 'books-config')) ?? { books: [] }) as { books: Dict[] }
        cfg.books = cfg.books.filter((b) => b.id !== bookId)
        await idbSet('kv', 'books-config', cfg)
        return ok
      },
      import: (_sourcePath: string, _title: string, _bookId: string) =>
        Promise.reject(new Error('Book import is not available in the web build')),
      readFile: (filePath: string) => idbGet('book-data', `file:${filePath}`),
      loadData: async (bookId: string) => (await idbGet('book-data', bookId)) ?? { bookmarks: [], annotations: [] },
      saveData: async (bookId: string, data: Dict) => {
        await idbSet('book-data', bookId, data)
        return ok
      }
    },

    // Plugins → IndexedDB (filesystem scan/install degrade to no-op)
    plugins: {
      scan: () => Promise.resolve([] as unknown[]),
      enable: async (pluginId: string) => {
        await idbSet('plugins', `enabled:${pluginId}`, true)
        return ok
      },
      disable: async (pluginId: string) => {
        await idbDelete('plugins', `enabled:${pluginId}`)
        return ok
      },
      loadContent: (_pluginId: string, _manifest: Dict) => Promise.resolve(null),
      getEnabled: async () => {
        const keys = await idbKeys('plugins')
        return keys.filter((k) => k.startsWith('enabled:')).map((k) => k.slice('enabled:'.length))
      },
      install: () => Promise.reject(new Error('Plugin install is not available in the web build')),
      uninstall: async (pluginId: string) => {
        await idbDelete('plugins', `enabled:${pluginId}`)
        return ok
      },
      storageGet: (pluginId: string, key: string) => idbGet('plugin-storage', `${pluginId}/${key}`),
      storageSet: async (pluginId: string, key: string, value: unknown) => {
        await idbSet('plugin-storage', `${pluginId}/${key}`, value)
        return ok
      },
      storageDelete: async (pluginId: string, key: string) => {
        await idbDelete('plugin-storage', `${pluginId}/${key}`)
        return ok
      }
    },

    // BMO Pi Bridge — same-origin REST calls to the Pi (best-effort)
    bmoStartDm: (campaignId: string) =>
      bmoFetchJson('/api/dnd/start', { method: 'POST', body: JSON.stringify({ campaignId }) }).catch(() => ({
        ok: false
      })),
    bmoStopDm: () => bmoFetchJson('/api/dnd/stop', { method: 'POST' }).catch(() => ({ ok: false })),
    bmoNarrate: (payload: Dict) =>
      bmoFetchJson('/api/dnd/narrate', { method: 'POST', body: JSON.stringify(payload) }).catch(() => ({ ok: false })),
    bmoNarrateCancel: () => bmoFetchJson('/api/dnd/narrate/cancel', { method: 'POST' }).catch(() => ({ ok: false })),
    bmoDmStatus: () => bmoFetchJson('/api/dnd/status').catch(() => ({ running: false })),
    bmoDiscordRecap: (_mode?: 'live' | 'last') => Promise.resolve({ recap: '' }),
    bmoPbpStart: (p: Dict) =>
      bmoFetchJson('/api/dnd/pbp/start', { method: 'POST', body: JSON.stringify(p) }).catch(() => ({ ok: false })),
    bmoPbpAdvance: (p: Dict) =>
      bmoFetchJson('/api/dnd/pbp/advance', { method: 'POST', body: JSON.stringify(p) }).catch(() => ({ ok: false })),
    bmoPbpSkip: (p: Dict) =>
      bmoFetchJson('/api/dnd/pbp/skip', { method: 'POST', body: JSON.stringify(p) }).catch(() => ({ ok: false })),
    bmoPbpSetScene: (p: Dict) =>
      bmoFetchJson('/api/dnd/pbp/scene', { method: 'POST', body: JSON.stringify(p) }).catch(() => ({ ok: false })),
    bmoPbpStop: (p: Dict) =>
      bmoFetchJson('/api/dnd/pbp/stop', { method: 'POST', body: JSON.stringify(p) }).catch(() => ({ ok: false })),
    bmoPbpStatus: (_p: Dict) => bmoFetchJson('/api/dnd/pbp/status').catch(() => ({ running: false })),
    bmoSetNarrationEnabled: (_enabled: boolean) => Promise.resolve(ok),
    bmoSetBargeInEnabled: (_enabled: boolean) => Promise.resolve(ok),
    bmoVoiceCastGet: (_campaignId: string) => Promise.resolve({ cast: {} }),
    bmoVoiceCastSet: (_payload: Dict) => Promise.resolve(ok),
    bmoVoiceCastReset: (_campaignId: string, _speaker: string) => Promise.resolve(ok),
    onBmoNarrationStatus: (cb: (status: unknown) => void) => busOn('bmo:narration-status', cb),
    bmoSyncInitiative: (_initiative: Dict) => Promise.resolve(ok),
    bmoSyncGameState: (_state: Dict) => Promise.resolve(ok),
    onBmoSyncEvent: (cb: (e: unknown) => void) => busOn('bmo:sync-event', cb),
    onBmoSyncInitiative: (cb: (e: unknown) => void) => busOn('bmo:sync-initiative-event', cb),

    // Discord Integration → Pi
    discord: {
      getConfig: async () => (await idbGet('kv', 'discord-config')) ?? { enabled: false },
      saveConfig: async (config: Dict) => {
        await idbSet('kv', 'discord-config', config)
        return ok
      },
      testConnection: () => Promise.resolve({ ok: false, message: 'Configure on the desktop app' }),
      sendMessage: (_text: string, _campaignName?: string) => Promise.resolve(ok)
    },

    // Cloud Sync (Google Drive via Rclone on the Pi)
    cloudSync: {
      getStatus: () => bmoFetchJson('/api/rclone/status').catch(() => ({ available: false })),
      backupCampaign: (campaignId: string, campaignName: string) =>
        bmoFetchJson('/api/rclone/backup', {
          method: 'POST',
          body: JSON.stringify({ campaignId, campaignName })
        }).catch(() => ({ ok: false })),
      checkCampaignStatus: (campaignId: string) =>
        bmoFetchJson(`/api/rclone/status?campaignId=${encodeURIComponent(campaignId)}`).catch(() => ({
          exists: false
        })),
      listRemoteCampaigns: () => bmoFetchJson('/api/rclone/list').catch(() => ({ campaigns: [] })),
      restoreCampaign: (campaignId: string) =>
        bmoFetchJson(`/api/rclone/restore?campaignId=${encodeURIComponent(campaignId)}`).catch(() => ({ ok: false }))
    },

    // Account (Discord OAuth login + cloud-sync session). The browser carries the
    // bearer token itself (IndexedDB); login is a same-origin redirect, the token
    // comes back in the URL on return (captured by captureWebAuthToken).
    account: {
      getStatus: async () => {
        const configured = await bmoFetchJson<{ configured: boolean }>('/api/auth/status')
          .then((r) => !!r.configured)
          .catch(() => false)
        const token = await getWebToken()
        if (!token) return { configured, signedIn: false, user: null }
        try {
          const res = await fetch(`${BMO_BASE}/api/account/me`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.status === 401) {
            await clearWebToken()
            return { configured, signedIn: false, user: null }
          }
          if (!res.ok) return { configured, signedIn: true, user: null }
          return { configured, signedIn: true, user: await res.json() }
        } catch {
          return { configured, signedIn: true, user: null }
        }
      },
      login: async () => {
        const returnTo = `${location.origin}${location.pathname}`
        location.href = `${BMO_BASE}/api/auth/discord/start?return_to=${encodeURIComponent(returnTo)}`
        return { ok: true }
      },
      logout: async () => {
        const token = await getWebToken()
        if (token) {
          try {
            await fetch(`${BMO_BASE}/api/auth/logout`, {
              method: 'POST',
              credentials: 'include',
              headers: { Authorization: `Bearer ${token}` }
            })
          } catch {
            /* ignore — clear locally regardless */
          }
        }
        await clearWebToken()
        return { ok: true }
      },
      getToken: () => getWebToken()
    },

    // Cloud sync engine — per-user, per-entity. The browser carries the bearer
    // token itself (same-origin behind the tunnel).
    sync: {
      manifest: async () => {
        const token = await getWebToken()
        if (!token) return { ok: false, objects: [] as unknown[] }
        try {
          const res = await fetch(`${BMO_BASE}/api/sync/manifest`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${token}` }
          })
          if (!res.ok) return { ok: false, objects: [] as unknown[] }
          const body = (await res.json()) as { objects?: unknown[] }
          return { ok: true, objects: body.objects ?? [] }
        } catch {
          return { ok: false, objects: [] as unknown[] }
        }
      },
      getObject: async (domain: string, id: string): Promise<ArrayBuffer | null> => {
        const token = await getWebToken()
        if (!token) return null
        try {
          const res = await fetch(
            `${BMO_BASE}/api/sync/object?domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}`,
            { credentials: 'include', headers: { Authorization: `Bearer ${token}` } }
          )
          if (!res.ok) return null
          return await res.arrayBuffer()
        } catch {
          return null
        }
      },
      putObject: async (
        domain: string,
        id: string,
        version: number,
        mtime: number,
        hash: string | null,
        bytes: ArrayBuffer
      ) => {
        const token = await getWebToken()
        if (!token) return { accepted: false }
        try {
          const form = new FormData()
          form.set('domain', domain)
          form.set('id', id)
          form.set('version', String(version))
          form.set('mtime', String(mtime))
          form.set('hash', hash ?? '')
          form.set('blob', new Blob([bytes]), 'blob.bin')
          const res = await fetch(`${BMO_BASE}/api/sync/object`, {
            method: 'POST',
            credentials: 'include',
            headers: { Authorization: `Bearer ${token}` },
            body: form
          })
          if (!res.ok) return { accepted: false }
          return await res.json()
        } catch {
          return { accepted: false }
        }
      },
      deleteObject: async (domain: string, id: string, version: number) => {
        const token = await getWebToken()
        if (!token) return { accepted: false }
        try {
          const res = await fetch(
            `${BMO_BASE}/api/sync/object?domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}&version=${version}`,
            { method: 'DELETE', credentials: 'include', headers: { Authorization: `Bearer ${token}` } }
          )
          if (!res.ok) return { accepted: false }
          return await res.json()
        } catch {
          return { accepted: false }
        }
      }
    },

    // Pi game registry → /api/games*. PHASE-46: every mutation honors the
    // desktop `{ ok: boolean; error? }` contract — a failure NEVER resolves to
    // bare `null` (which made the renderer's `if (result.ok)` null-deref). The
    // Pi already returns `{ ok: true, … }` on success (POST 201, PATCH/DELETE/
    // heartbeat 200), so success passes through; only the catch shape changed.
    registry: {
      announce: (payload: Dict, _baseOverride?: string) =>
        bmoFetchJson('/api/games', { method: 'POST', body: JSON.stringify(payload) }).catch((e) => ({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        })),
      update: (inviteCode: string, patch: Dict, _baseOverride?: string) =>
        bmoFetchJson(`/api/games/${encodeURIComponent(inviteCode)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch)
        }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) })),
      heartbeat: (inviteCode: string, _baseOverride?: string) =>
        bmoFetchJson(`/api/games/${encodeURIComponent(inviteCode)}/heartbeat`, { method: 'POST' }).catch((e) => ({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        })),
      deregister: (inviteCode: string, _baseOverride?: string) =>
        bmoFetchJson(`/api/games/${encodeURIComponent(inviteCode)}`, { method: 'DELETE' }).catch((e) => ({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        })),
      // GET /api/games returns `{ games }` with NO `ok` field, but
      // registry-client.listGames does `if (!result.ok) throw` — so wrap to the
      // `{ ok, games }` contract and degrade to an empty list on failure so a
      // web list NEVER throws.
      list: (clientId: string | null, _baseOverride?: string) =>
        bmoFetchJson<{ games?: unknown[] }>(`/api/games${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`)
          .then((r) => ({ ok: true, games: r?.games ?? [] }))
          .catch(() => ({ ok: true, games: [] })),
      subscribe: (_subscriptionId: string, _clientId: string | null) => Promise.resolve(ok),
      unsubscribe: (_subscriptionId: string) => Promise.resolve(ok),
      onEvent: (cb: (p: { subscriptionId: string; event: Dict }) => void) =>
        busOn('registry:event', cb as (d: unknown) => void)
    },

    // Pi 5e library → /api/library*
    library: {
      manifest: () => bmoFetchJson('/api/library/manifest').catch(() => null),
      file: (rel: string) => bmoFetchJson(`/api/library/file?path=${encodeURIComponent(rel)}`).catch(() => null)
    },

    // Sound cache → return a direct Pi URL the renderer can play
    sounds: {
      cacheGet: (rel: string): Promise<string | null> =>
        Promise.resolve(`${BMO_BASE}/api/sounds/file?path=${encodeURIComponent(rel)}`),
      prewarm: (): Promise<{ ok: boolean }> => Promise.resolve({ ok: true })
    }
  }
  return api
}

// ── AI DM stub — full shape, conservative defaults ───────────────────
function createAiStub() {
  const noopUnsub = () => () => undefined
  const notWired = (): Promise<never> =>
    Promise.reject(new Error('The AI DM backend is not yet bridged in the web build'))
  return {
    configure: (config: Record<string, unknown>) => idbSet('kv', 'ai-config', config).then(() => ({ success: true })),
    getConfig: async () => (await idbGet('kv', 'ai-config')) ?? { provider: 'none', configured: false },
    checkProviders: () => Promise.resolve({ available: [] as string[] }),
    buildIndex: () => Promise.resolve({ chunkCount: 0 }),
    loadIndex: () => Promise.resolve({ loaded: false }),
    getChunkCount: () => Promise.resolve(0),
    getEmbedIndexStatus: () => Promise.resolve({ ready: false, count: 0 }),
    rebuildEmbedIndex: () => Promise.resolve({ ready: false }),
    prepareScene: (_c: string, _ids: string[]) => Promise.resolve({ ok: false }),
    getSceneStatus: (_c: string) => Promise.resolve({ status: 'idle' }),
    cancelScene: (_c: string) => Promise.resolve({ ok: true }),
    // Bridge to the Pi (POST /api/dnd/public/dm -- the one anonymous-reachable
    // route, same-origin behind the tunnel via a path-scoped Cloudflare Access
    // bypass, so no Access cookie is required). The server OWNS the DM system
    // prompt + model and runs the LLM; we stream the returned narration back.
    // Structured mutations (statChanges/dmActions) ARE produced on web: the
    // server-owned DM prompt makes the narration carry the same
    // [STAT_CHANGES]/[DM_ACTIONS] tags, which parseAiMutations harvests below
    // and emits on ai:stream-done -- parity with the desktop tag path.
    chatStream: async (request: Record<string, unknown>) => {
      const streamId = genId()
      const playerMessage = String((request?.message as string | undefined) ?? '')
      const campaignId = String((request?.campaignId as string | undefined) ?? 'default')
      const actingName = (request?.senderName as string | undefined) || undefined
      // System prompt + model are SERVER-owned on the public endpoint; the client
      // sends only the player message, bounded history, and game context. The
      // server treats `context` as untrusted in-fiction data.
      const context = {
        gameState: request?.gameState,
        activeCreatures: request?.activeCreatures,
        actingCharacterName: actingName
      }
      const history = dmHistory.get(campaignId) ?? []
      const controller = new AbortController()
      aiAborters.set(streamId, controller)
      void (async () => {
        try {
          // Dedicated DM endpoint: the Pi runs the LLM with OUR system prompt
          // (role + action-tag contract + live state), so tag emission is reliable.
          const res = await fetch(`${BMO_BASE}/api/dnd/public/dm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({ message: playerMessage, history, context })
          })
          if (!res.ok) throw new Error(`AI backend returned ${res.status}`)
          const data = (await res.json()) as { text?: string }
          const text = String(data?.text ?? '')
          // Harvest structured mutations the model embedded as tags, mirroring the
          // desktop main-process tag path; the renderer applies them on stream-done.
          const { statChanges, dmActions, displayText } = parseAiMutations(text)
          for (let i = 0; i < displayText.length; i += 64) {
            if (controller.signal.aborted) return
            webEmit('ai:stream-chunk', { streamId, text: displayText.slice(i, i + 64) })
            await new Promise((r) => setTimeout(r, 18))
          }
          // Remember the exchange (clean prose) for multi-turn continuity.
          dmHistory.set(
            campaignId,
            [
              ...history,
              { role: 'user' as const, content: playerMessage },
              { role: 'assistant' as const, content: displayText }
            ].slice(-12)
          )
          webEmit('ai:stream-done', {
            streamId,
            fullText: text,
            displayText,
            statChanges,
            dmActions,
            ruleCitations: []
          })
        } catch (e) {
          if (!controller.signal.aborted) {
            webEmit('ai:stream-error', { streamId, error: e instanceof Error ? e.message : String(e) })
          }
        } finally {
          aiAborters.delete(streamId)
        }
      })()
      return { success: true, streamId }
    },
    cancelStream: (streamId: string) => {
      aiAborters.get(streamId)?.abort()
      aiAborters.delete(streamId)
      return Promise.resolve({ ok: true })
    },
    xCardRewind: (_c: string) => Promise.resolve({ ok: true }),
    // Apply AI-DM stat mutations to the persisted character (IndexedDB) using the
    // SAME browser-pure core the desktop main process uses — so an approved (or
    // auto-approved) mutation actually changes HP / conditions / resources on web,
    // not just narrates. Returns the desktop MutationResult shape so the renderer's
    // rejected-mutation alerting works identically.
    applyMutations: async (id: string, changes: unknown[]) => {
      const stored = await idbGet<Record<string, unknown>>('characters', id)
      if (!stored) {
        return {
          applied: [],
          rejected: (changes as StatChange[]).map((c) => ({ change: c, reason: 'Character not found' }))
        }
      }
      const char = stored as unknown as Character5eV3
      const out = applyChangesToCharacter(char, changes as StatChange[])
      if (out.applied.length > 0) {
        await idbSet('characters', id, char as unknown as Record<string, unknown>)
      }
      return out
    },
    // Long/short rest recovery applied to the persisted character (IndexedDB) via
    // the SAME shared core the desktop main process uses — Warlock slots, class
    // resources, HP, hit dice, exhaustion recover identically on web.
    longRest: async (id: string) => {
      const stored = await idbGet<Record<string, unknown>>('characters', id)
      if (!stored) {
        return {
          applied: [],
          rejected: [{ change: { type: 'reset_death_saves', reason: 'long rest' }, reason: 'Character not found' }]
        }
      }
      const char = stored as unknown as Character5eV3
      const changes = buildLongRestChanges(char)
      if (changes.length === 0) return { applied: [], rejected: [] }
      const out = applyChangesToCharacter(char, changes)
      if (out.applied.length > 0) {
        await idbSet('characters', id, char as unknown as Record<string, unknown>)
      }
      return out
    },
    shortRest: async (id: string) => {
      const stored = await idbGet<Record<string, unknown>>('characters', id)
      if (!stored) return { applied: [], rejected: [] }
      const char = stored as unknown as Character5eV3
      const changes = buildShortRestChanges(char)
      if (changes.length === 0) return { applied: [], rejected: [] }
      const out = applyChangesToCharacter(char, changes)
      if (out.applied.length > 0) {
        await idbSet('characters', id, char as unknown as Record<string, unknown>)
      }
      return out
    },
    saveConversation: (_c: string) => Promise.resolve({ ok: true }),
    restoreConversation: (_c: string, _d: Record<string, unknown>) => Promise.resolve({ ok: true }),
    loadConversation: (_c: string) => Promise.resolve(null),
    peekConversation: (_c: string) => Promise.resolve(null),
    deleteConversation: (_c: string) => Promise.resolve({ ok: true }),
    generateEndOfSessionRecap: async (campaignId: string) => {
      const context = await buildRecapContext(campaignId)
      if (!context) return { success: false, error: 'No session history to recap.' }
      try {
        const res = await bmoFetchJson<{ success: boolean; text?: string; error?: string }>('/api/dnd/public/recap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'end', context })
        })
        if (!res.success || !res.text) return { success: false, error: res.error ?? 'Recap failed' }
        return { success: true, data: res.text }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Recap failed (web)' }
      }
    },
    generateSessionStartRecap: async (campaignId: string, _force?: boolean) => {
      const context = await buildRecapContext(campaignId)
      if (!context) return { success: false, error: 'No campaign history yet to recap.' }
      try {
        const res = await bmoFetchJson<{ success: boolean; text?: string; error?: string }>('/api/dnd/public/recap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'start', context })
        })
        if (!res.success || !res.text) return { success: false, error: res.error ?? 'Recap failed' }
        return { success: true, data: { text: res.text, generatedAt: new Date().toISOString(), cached: false } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Recap failed (web)' }
      }
    },
    campaignQaAsk: async (campaignId: string, question: string) => {
      const context = await buildRecapContext(campaignId)
      try {
        const res = await bmoFetchJson<{ success: boolean; answer?: string; error?: string }>('/api/dnd/public/qa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, context })
        })
        if (!res.success || !res.answer) return { success: false, error: res.error ?? 'Q&A failed' }
        return { success: true, data: { answer: res.answer, askedAt: new Date().toISOString() } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Q&A failed (web)' }
      }
    },
    campaignQaHistory: (_c: string) => Promise.resolve([] as unknown[]),
    campaignQaClear: (_c: string) => Promise.resolve({ ok: true }),
    generateBattlemap: async (request: Record<string, unknown>) => {
      try {
        return await bmoFetchJson<{ success: boolean; spec?: unknown; warnings?: string[]; error?: string }>(
          '/api/dnd/public/battlemap',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: request.prompt,
              theme: request.theme,
              widthCells: request.widthCells,
              heightCells: request.heightCells,
              campaignId: request.campaignId
            })
          }
        )
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Battlemap generation failed (web)' }
      }
    },
    listCloudModels: (_p: string, _k?: string) => Promise.resolve({ models: [] }),
    validateApiKey: (_p: string, _k: string) => Promise.resolve({ valid: false }),
    detectOllama: () => Promise.resolve({ installed: false, running: false }),
    getVram: () => Promise.resolve({ totalMb: 0 }),
    downloadOllama: () => notWired(),
    installOllama: (_p: string) => notWired(),
    startOllama: () => notWired(),
    pullModel: (_m: string) => notWired(),
    getCuratedModels: () => Promise.resolve([] as unknown[]),
    listInstalledModels: () => Promise.resolve([] as unknown[]),
    listInstalledModelsDetailed: () => Promise.resolve([] as unknown[]),
    checkOllamaUpdate: () => Promise.resolve({ updateAvailable: false }),
    updateOllama: () => notWired(),
    deleteModel: (_m: string) => Promise.resolve({ ok: true }),
    getTokenBudget: (_c?: string) => Promise.resolve({ used: 0, max: 0 }),
    getContextInspector: (_c: string) => Promise.resolve({ sections: [] }),
    getConnectionStatus: () => Promise.resolve({ status: 'disconnected', consecutiveFailures: 0 }),
    getTokenMeter: () => Promise.resolve({ used: 0, max: 0 }),
    previewTokenBudget: (_c: string, _ids: string[]) => Promise.resolve({ used: 0, max: 0 }),
    syncWorldState: (_c: string, _s: Record<string, unknown>) => Promise.resolve({ ok: true }),
    syncCombatState: (_c: string, _s: Record<string, unknown>) => Promise.resolve({ ok: true }),
    sceneMemoryGet: (_c: string) => Promise.resolve({ enabled: false, scenes: [] }),
    sceneMemorySetEnabled: (_c: string, _e: boolean) => Promise.resolve({ ok: true }),
    endScene: (_c: string, _l?: string) => Promise.resolve({ ok: true }),
    logNpcInteraction: (_c: string, _n: string, _s: string, _a: string) => Promise.resolve({ ok: true }),
    setNpcRelationship: (_c: string, _n: string, _t: string, _r: string, _d: string) => Promise.resolve({ ok: true }),
    setNpcFields: (_c: string, _n: string, _f: Record<string, unknown>) => Promise.resolve({ ok: true }),
    updateQuestLog: (_c: string, _o: string, _n: string, _d?: string, _ch?: boolean) => Promise.resolve({ ok: true }),
    adjustFactionStanding: (_c: string, _f: string, _d: number) => Promise.resolve({ ok: true }),
    getQuestLog: (_c: string) => Promise.resolve({ quests: [] }),
    updateQuestObjective: (_c: string, _p: unknown) => Promise.resolve({ ok: true }),
    advanceChapter: (_c: string, _p: unknown) => Promise.resolve({ ok: true }),
    seedQuests: (_c: string, _q: unknown[]) => Promise.resolve({ ok: true }),
    oracleFateCheck: (_c: string, _p: unknown) => Promise.resolve({ result: 'unknown' }),
    oracleSetChaos: (_c: string, _p: unknown) => Promise.resolve({ ok: true }),
    getEntities: (_c: string) => Promise.resolve({ entities: [] }),
    upsertEntity: (_c: string, _p: unknown) => Promise.resolve({ ok: true }),
    deleteEntity: (_c: string, _i: string) => Promise.resolve({ ok: true }),
    setEntitiesConfig: (_c: string, _p: unknown) => Promise.resolve({ ok: true }),
    getWorldState: (_c: string) => Promise.resolve({ enabled: false, state: {} }),
    setWorldStateEnabled: (_c: string, _e: boolean) => Promise.resolve({ ok: true }),
    applyWorldDelta: (_c: string, _d: unknown) => Promise.resolve({ ok: true }),
    listMemoryFiles: (_c: string) => Promise.resolve([] as unknown[]),
    readMemoryFile: (_c: string, _f: string) => Promise.resolve(''),
    clearMemory: (_c: string) => Promise.resolve({ ok: true }),
    analyzeMap: async (gameState: Record<string, unknown>) => {
      const mapDescription = buildMapDescription(gameState)
      if (!mapDescription) return { success: false, error: 'No active map to analyze' }
      try {
        return await bmoFetchJson<{ success: boolean; analysis?: string; error?: string }>(
          '/api/dnd/public/analyze-map',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapDescription }) }
        )
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Map analysis failed (web)' }
      }
    },
    triggerStateUpdate: (_s: Record<string, unknown>) => Promise.resolve({ ok: true }),
    setTriggerObserverEnabled: (_e: boolean) => Promise.resolve({ ok: true }),
    getTriggerObserverEnabled: () => Promise.resolve(false),
    onTriggerFired: (_cb: (d: unknown) => void) => undefined,
    removeTriggerListener: () => busClear('ai:trigger-fired'),
    onStreamChunk: (cb: (d: { streamId: string; text: string }) => void) =>
      busOn('ai:stream-chunk', cb as (d: unknown) => void),
    onStreamDone: (cb: (d: unknown) => void) => busOn('ai:stream-done', cb),
    onStreamError: (cb: (d: { streamId: string; error: string }) => void) =>
      busOn('ai:stream-error', cb as (d: unknown) => void),
    onQuestStateChanged: (cb: (d: unknown) => void) => busOn('ai:quest-state-changed', cb),
    onIndexProgress: (cb: (d: { percent: number; stage: string }) => void) =>
      busOn('ai:index-progress', cb as (d: unknown) => void),
    onEmbedIndexProgress: (cb: (d: { percent: number }) => void) =>
      busOn('ai:embed-index-progress', cb as (d: unknown) => void),
    onOllamaProgress: (cb: (d: { type: string; percent: number }) => void) =>
      busOn('ai:ollama-progress', cb as (d: unknown) => void),
    onStreamFileRead: (cb: (d: unknown) => void) => busOn('ai:stream-file-read', cb),
    onStreamWebSearch: (cb: (d: unknown) => void) => busOn('ai:stream-web-search', cb),
    onStreamStatus: (cb: (d: unknown) => void) => busOn('ai:stream-status', cb),
    onConnectionStatus: (cb: (d: unknown) => void) => busOn('ai:connection-status-changed', cb),
    approveWebSearch: (_id: string, _approved: boolean) => Promise.resolve({ ok: true }),
    removeAllAiListeners: () => {
      for (const ch of [
        'ai:stream-chunk',
        'ai:stream-done',
        'ai:stream-error',
        'ai:index-progress',
        'ai:ollama-progress',
        'ai:stream-file-read',
        'ai:stream-web-search',
        'ai:stream-status',
        'ai:connection-status-changed'
      ])
        busClear(ch)
      void noopUnsub
    }
  }
}

// ── Game data API — every bundled 5e JSON path from the preload ──────
function createGameApi() {
  const j = (p: string) => loadJson(p)
  return {
    loadJson: (path: string) => loadJson(path.replace(/^\.\//, '')),
    loadSpecies: () => j('data/5e/character/species.json'),
    loadSpeciesTraits: () => j('data/5e/character/species-traits.json'),
    loadClasses: () => j('data/5e/character/classes.json'),
    loadBackgrounds: () => j('data/5e/character/backgrounds.json'),
    loadClassFeatures: () => j('data/5e/character/class-features.json'),
    loadFeats: () => j('data/5e/character/feats.json'),
    loadSubclasses: () => j('data/5e/character/subclasses.json'),
    loadStartingEquipment: () => j('data/5e/character/starting-equipment.json'),
    loadSpeciesSpells: () => j('data/5e/character/species-spells.json'),
    loadAbilityScoreConfig: () => j('data/5e/character/ability-score-config.json'),
    loadPresetIcons: () => j('data/5e/character/preset-icons.json'),
    loadLanguageD12Table: () => j('data/5e/character/language-d12-table.json'),
    loadSpells: () => j('data/5e/spells/spells.json'),
    loadEquipment: () => j('data/5e/equipment/equipment.json'),
    loadLightSources: () => j('data/5e/equipment/light-sources.json'),
    loadMagicItems: () => j('data/5e/equipment/magic-items.json'),
    loadMounts: () => j('data/5e/equipment/mounts.json'),
    loadSentientItems: () => j('data/5e/equipment/sentient-items.json'),
    loadTrinkets: () => j('data/5e/equipment/trinkets.json'),
    loadVariantItems: () => j('data/5e/equipment/variant-items.json'),
    loadWearableItems: () => j('data/5e/equipment/wearable-items.json'),
    loadCurrencyConfig: () => j('data/5e/equipment/currency-config.json'),
    loadMonsters: () => j('data/5e/dm/npcs/monsters.json'),
    loadNpcs: () => j('data/5e/dm/npcs/npcs.json'),
    loadCreatures: () => j('data/5e/dm/npcs/creatures.json'),
    loadCreatureTypes: () => j('data/5e/dm/npcs/creature-types.json'),
    loadNpcNames: () => j('data/5e/dm/npcs/generation-tables/npc-names.json'),
    loadNpcAppearance: () => j('data/5e/dm/npcs/generation-tables/npc-appearance.json'),
    loadNpcMannerisms: () => j('data/5e/dm/npcs/generation-tables/npc-mannerisms.json'),
    loadAlignmentDescriptions: () => j('data/5e/dm/npcs/generation-tables/alignment-descriptions.json'),
    loadPersonalityTables: () => j('data/5e/dm/npcs/generation-tables/personality-tables.json'),
    loadChaseTables: () => j('data/5e/encounters/chase-tables.json'),
    loadEncounterBudgets: () => j('data/5e/encounters/encounter-budgets.json'),
    loadEncounterPresets: () => j('data/5e/encounters/encounter-presets.json'),
    loadRandomTables: () => j('data/5e/encounters/random-tables.json'),
    loadConditions: () => j('data/5e/hazards/conditions.json'),
    loadCurses: () => j('data/5e/hazards/curses.json'),
    loadDiseases: () => j('data/5e/hazards/diseases.json'),
    loadEnvironmentalEffects: () => j('data/5e/hazards/environmental-effects.json'),
    loadHazards: () => j('data/5e/hazards/hazards.json'),
    loadPoisons: () => j('data/5e/hazards/poisons.json'),
    loadTraps: () => j('data/5e/hazards/traps.json'),
    loadSupernaturalGifts: () => j('data/5e/hazards/supernatural-gifts.json'),
    loadBastionEvents: () => j('data/5e/bastions/bastion-events.json'),
    loadBastionFacilities: () => j('data/5e/bastions/bastion-facilities.json'),
    loadCalendarPresets: () => j('data/5e/world/calendar-presets.json'),
    loadCraftingTools: () => j('data/5e/world/crafting.json'),
    loadDowntime: () => j('data/5e/world/downtime.json'),
    loadSettlements: () => j('data/5e/world/settlements.json'),
    loadSiegeEquipment: () => j('data/5e/world/siege-equipment.json'),
    loadTreasureTables: () => j('data/5e/world/treasure-tables.json'),
    loadWeatherGeneration: () => j('data/5e/world/weather-generation.json'),
    loadBuiltInMaps: () => j('data/5e/world/built-in-maps.json'),
    loadSessionZeroConfig: () => j('data/5e/world/session-zero-config.json'),
    loadAdventureSeeds: () => j('data/5e/world/adventure-seeds.json'),
    loadEffectDefinitions: () => j('data/5e/game/mechanics/effect-definitions.json'),
    loadFightingStyles: () => j('data/5e/game/mechanics/fighting-styles.json'),
    loadLanguages: () => j('data/5e/game/mechanics/languages.json'),
    loadSkills: () => j('data/5e/game/mechanics/skills.json'),
    loadSpellSlots: () => j('data/5e/game/mechanics/spell-slots.json'),
    loadWeaponMastery: () => j('data/5e/game/mechanics/weapon-mastery.json'),
    loadXpThresholds: () => j('data/5e/game/mechanics/xp-thresholds.json'),
    loadClassResources: () => j('data/5e/game/mechanics/class-resources.json'),
    loadSpeciesResources: () => j('data/5e/game/mechanics/species-resources.json'),
    loadDiceTypes: () => j('data/5e/game/mechanics/dice-types.json'),
    loadLightingTravel: () => j('data/5e/game/mechanics/lighting-travel.json'),
    loadSoundEvents: () => j('data/audio/sound-events.json'),
    loadAmbientTracks: () => j('data/audio/ambient-tracks.json'),
    loadKeyboardShortcuts: () => j('data/ui/keyboard-shortcuts.json'),
    loadThemes: () => j('data/ui/themes.json'),
    loadDiceColors: () => j('data/ui/dice-colors.json'),
    loadDmTabs: () => j('data/ui/dm-tabs.json'),
    loadNotificationTemplates: () => j('data/ui/notification-templates.json'),
    loadRarityOptions: () => j('data/ui/rarity-options.json'),
    loadModeration: () => j('data/5e/game/ai/moderation.json')
  }
}
