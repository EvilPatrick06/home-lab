/**
 * Registry of synced data domains. Each domain knows how to enumerate its local
 * entities, write a pulled entity back, delete one, and (de)serialize to bytes.
 * Everything routes through `window.api.*`, so the SAME registry drives sync on
 * both desktop (IPC → file storage) and web (IndexedDB).
 *
 * Covers the full user-data set: characters, campaigns, bastions, custom
 * creatures, homebrew, shop templates, maps, Global Settings (device-local /
 * secret fields stripped; theme + accessibility applied on pull), per-campaign
 * game-state / AI conversations / bans, per-book bookmarks+annotations, and the
 * binary image + audio libraries (packed container; bytes cached across cycles).
 * Also synced: custom book PDFs (the `book-files` domain) + their config.
 * NOT synced: core-book installs (device-local) and the
 * secret/device-local settings fields (turnServers, bmoApiKey, bmoPiBaseUrl, …).
 */

import { SETTINGS_KEYS } from '../../constants'
import {
  type ColorblindMode,
  type FontStyle,
  type KeyCombo,
  useAccessibilityStore
} from '../../stores/use-accessibility-store'
import { getTheme, setTheme, type ThemeName } from '../theme-manager'

export interface SyncDomain {
  name: string
  // Optional cheap change-key (cfrom list metadata): when provided and
  // unchanged since the last reconcile, the engine reuses the cached hash
  // and skips re-serialize + re-hash (manifest-diff). See sync-engine.
  listEntities(): Promise<Array<{ id: string; entity: unknown; changeKey?: string }>>
  putEntity(id: string, entity: unknown): Promise<void>
  removeEntity(id: string): Promise<void>
  serialize(entity: unknown): ArrayBuffer
  deserialize(bytes: ArrayBuffer): unknown
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function jsonSerialize(entity: unknown): ArrayBuffer {
  const u8 = enc.encode(JSON.stringify(entity ?? null))
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

function jsonDeserialize(bytes: ArrayBuffer): unknown {
  return JSON.parse(dec.decode(new Uint8Array(bytes)))
}

function idOf(entity: unknown): string | undefined {
  return (entity as { id?: string } | null)?.id
}

/** Normalize a list response: a plain array on web, `{success,data:[...]}` on desktop. */
function asArray(x: unknown): unknown[] {
  if (Array.isArray(x)) return x
  const d = (x as { data?: unknown } | null)?.data
  return Array.isArray(d) ? d : []
}

/** Normalize a get response: the entity on web, `{success,data}` on desktop. */
function asEntity(x: unknown): unknown | null {
  if (x == null) return null
  if (typeof x === 'object' && 'success' in (x as object) && 'data' in (x as object)) {
    return (x as { data?: unknown }).data ?? null
  }
  return x
}

/** Campaign ids, for the per-campaign domains (game-state, ai-conversations, bans, audio). */
async function campaignIds(): Promise<string[]> {
  const list = (await window.api.loadCampaigns()) as Array<{ id?: string }> | null
  return (list ?? []).map((c) => c?.id).filter((x): x is string => !!x)
}

// ── Binary container: [4-byte metaLen][meta JSON][raw bytes] ──────────
function packBinary(meta: Record<string, unknown>, bytes: ArrayBuffer): ArrayBuffer {
  const metaJson = enc.encode(JSON.stringify(meta))
  const out = new Uint8Array(4 + metaJson.length + bytes.byteLength)
  new DataView(out.buffer).setUint32(0, metaJson.length)
  out.set(metaJson, 4)
  out.set(new Uint8Array(bytes), 4 + metaJson.length)
  return out.buffer
}
function unpackBinary(blob: ArrayBuffer): { meta: Record<string, unknown>; bytes: ArrayBuffer } {
  const view = new DataView(blob)
  const metaLen = view.getUint32(0)
  const meta = JSON.parse(dec.decode(new Uint8Array(blob, 4, metaLen))) as Record<string, unknown>
  return { meta, bytes: blob.slice(4 + metaLen) }
}
function binarySerialize(entity: unknown): ArrayBuffer {
  const { bytes, ...meta } = entity as { bytes?: ArrayBuffer } & Record<string, unknown>
  return packBinary(meta, bytes ?? new ArrayBuffer(0))
}
function binaryDeserialize(blob: ArrayBuffer): unknown {
  const { meta, bytes } = unpackBinary(blob)
  return { ...meta, bytes }
}

/** Read raw bytes from a data:/blob:/http URL (fetch) or a filesystem path
 * (desktop → main readFileBinary). Returns null on failure. */
async function fetchBytes(urlOrPath: string): Promise<ArrayBuffer | null> {
  try {
    if (/^(blob:|data:|https?:)/.test(urlOrPath)) {
      return await (await fetch(urlOrPath)).arrayBuffer()
    }
    const r: unknown = await window.api.readFileBinary(urlOrPath)
    if (r instanceof ArrayBuffer) return r
    return ((r as { data?: ArrayBuffer } | null)?.data as ArrayBuffer) ?? null
  } catch {
    return null
  }
}

// Cache binary bytes across reconciles so we don't re-read media every cycle;
// keyed by id + a cheap change-key (image savedAt; audio filename is immutable).
const _binaryCache = new Map<string, { changeKey: string; bytes: ArrayBuffer }>()
async function cachedBytes(
  cacheId: string,
  changeKey: string,
  load: () => Promise<ArrayBuffer | null>
): Promise<ArrayBuffer | null> {
  const hit = _binaryCache.get(cacheId)
  if (hit && hit.changeKey === changeKey) return hit.bytes
  const bytes = await load()
  if (bytes) _binaryCache.set(cacheId, { changeKey, bytes })
  return bytes
}

// Settings: only real cross-device prefs sync; device-local/secret fields stay put.
const SETTINGS_SYNC_FIELDS = [
  'userProfile',
  'language',
  'autoCheckUpdates',
  'autoDownloadUpdates',
  'autoInstallSilent',
  'autoRestartAfterUpdate',
  'autoBackupOnLaunch'
] as const
function stripSettings(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of SETTINGS_SYNC_FIELDS) if (k in s) out[k] = s[k]
  return out
}

/** A plain id-keyed JSON domain backed by `load`/`save`/`del` window.api calls. */
function jsonDomain(
  name: string,
  load: () => Promise<unknown>,
  save: (entity: unknown) => Promise<unknown>,
  del: (id: string) => Promise<unknown>
): SyncDomain {
  return {
    name,
    async listEntities() {
      const list = (await load()) as unknown[] | null
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const e of list ?? []) {
        const id = idOf(e)
        if (id) out.push({ id, entity: e })
      }
      return out
    },
    async putEntity(_id, entity) {
      await save(entity)
    },
    async removeEntity(id) {
      await del(id)
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  }
}

export const DOMAINS: SyncDomain[] = [
  jsonDomain(
    'characters',
    () => window.api.loadCharacters(),
    (e) => window.api.saveCharacter(e as Record<string, unknown>),
    (id) => window.api.deleteCharacter(id)
  ),
  jsonDomain(
    'campaigns',
    () => window.api.loadCampaigns(),
    (e) => window.api.saveCampaign(e as Record<string, unknown>),
    (id) => window.api.deleteCampaign(id)
  ),
  jsonDomain(
    'bastions',
    () => window.api.loadBastions(),
    (e) => window.api.saveBastion(e as Record<string, unknown>),
    (id) => window.api.deleteBastion(id)
  ),
  jsonDomain(
    'custom-creatures',
    () => window.api.loadCustomCreatures(),
    (e) => window.api.saveCustomCreature(e as Record<string, unknown>),
    (id) => window.api.deleteCustomCreature(id)
  ),
  {
    // list() returns summaries (no inventory) on desktop, so fetch full per id.
    name: 'shop-templates',
    async listEntities() {
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const s of asArray(await window.api.shopTemplates.list())) {
        const id = idOf(s)
        if (!id) continue
        const full = asEntity(await window.api.shopTemplates.get(id))
        if (full) out.push({ id, entity: full })
      }
      return out
    },
    async putEntity(_id, entity) {
      await window.api.shopTemplates.save(entity as { id: string; name: string; inventory: unknown[]; markup: number })
    },
    async removeEntity(id) {
      await window.api.shopTemplates.delete(id)
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // map-library's list() returns only summaries; fetch the full record per id.
    // (Desktop wraps as {success,data}; the web shim is plainer — normalized above.)
    name: 'map-library',
    async listEntities() {
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const m of asArray(await window.api.mapLibrary.list())) {
        const id = idOf(m)
        if (!id) continue
        const full = asEntity(await window.api.mapLibrary.get(id))
        if (full) out.push({ id, entity: full })
      }
      return out
    },
    async putEntity(_id, entity) {
      const e = entity as { id: string; name: string; data: Record<string, unknown> }
      await window.api.mapLibrary.save(e.id, e.name, e.data)
    },
    async removeEntity(id) {
      await window.api.mapLibrary.delete(id)
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // homebrew is keyed `<category>/<id>` locally; the sync key carries both.
    name: 'homebrew',
    async listEntities() {
      const all = (await window.api.loadAllHomebrew()) as Array<{ id?: string; category?: string }> | null
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const e of all ?? []) {
        if (!e?.id) continue
        out.push({ id: `${e.category ?? 'misc'}/${e.id}`, entity: e })
      }
      return out
    },
    async putEntity(_id, entity) {
      await window.api.saveHomebrew(entity as Record<string, unknown>)
    },
    async removeEntity(id) {
      const i = id.indexOf('/')
      const category = i >= 0 ? id.slice(0, i) : 'misc'
      const realId = i >= 0 ? id.slice(i + 1) : id
      await window.api.deleteHomebrew(category, realId)
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // Global Settings: file prefs (device-local/secret stripped) + theme +
    // accessibility (which live in localStorage / the a11y store, not settings.json).
    name: 'settings',
    async listEntities() {
      const file = stripSettings(((await window.api.loadSettings()) as Record<string, unknown>) ?? {})
      let theme: string | undefined
      let accessibility: Record<string, unknown> | undefined
      try {
        theme = getTheme()
      } catch {
        /* renderer-only */
      }
      try {
        const a = useAccessibilityStore.getState()
        accessibility = {
          uiScale: a.uiScale,
          colorblindMode: a.colorblindMode,
          reducedMotion: a.reducedMotion,
          screenReaderMode: a.screenReaderMode,
          tooltipsEnabled: a.tooltipsEnabled,
          fontStyle: a.fontStyle,
          customKeybindings: a.customKeybindings
        }
      } catch {
        /* store unavailable */
      }
      return [{ id: 'app', entity: { file, theme, accessibility } }]
    },
    async putEntity(_id, entity) {
      const b = entity as { file?: Record<string, unknown>; theme?: string; accessibility?: Record<string, unknown> }
      if (b.file) {
        const cur = ((await window.api.loadSettings()) as Record<string, unknown>) ?? {}
        await window.api.saveSettings({ ...cur, ...b.file }) // merge — keep device-local fields
      }
      if (b.theme) {
        try {
          setTheme(b.theme as ThemeName)
        } catch {
          /* invalid theme name */
        }
      }
      if (b.accessibility) {
        try {
          const a = b.accessibility
          const acc = {
            uiScale: typeof a.uiScale === 'number' ? a.uiScale : 100,
            colorblindMode: (a.colorblindMode as ColorblindMode) ?? 'none',
            reducedMotion: !!a.reducedMotion,
            screenReaderMode: !!a.screenReaderMode,
            tooltipsEnabled: a.tooltipsEnabled !== false,
            fontStyle: (a.fontStyle as FontStyle) ?? 'system',
            customKeybindings: (a.customKeybindings as Record<string, KeyCombo> | null) ?? null
          }
          try {
            localStorage.setItem(SETTINGS_KEYS.ACCESSIBILITY, JSON.stringify(acc))
          } catch {
            /* localStorage unavailable */
          }
          useAccessibilityStore.setState(acc) // live update
          useAccessibilityStore.getState().setReducedMotion(acc.reducedMotion) // re-apply .reduce-motion class
        } catch {
          /* ignore */
        }
      }
    },
    async removeEntity() {
      /* settings are never deleted */
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    name: 'game-state',
    async listEntities() {
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const cid of await campaignIds()) {
        const gs = asEntity(await window.api.loadGameState(cid))
        if (gs) out.push({ id: cid, entity: gs })
      }
      return out
    },
    async putEntity(id, entity) {
      await window.api.saveGameState(id, entity as Record<string, unknown>)
    },
    async removeEntity(id) {
      await window.api.deleteGameState(id)
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // AI DM conversation history (desktop wraps {success,data}; web persistence is a no-op).
    name: 'ai-conversations',
    async listEntities() {
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const cid of await campaignIds()) {
        const conv = asEntity(await window.api.ai.loadConversation(cid))
        if (conv) out.push({ id: cid, entity: conv })
      }
      return out
    },
    async putEntity(id, entity) {
      await window.api.ai.restoreConversation(id, entity as Record<string, unknown>)
    },
    async removeEntity(id) {
      await window.api.ai.deleteConversation(id)
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // Per-campaign ban lists (no delete API → tombstone clears them).
    name: 'bans',
    async listEntities() {
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const cid of await campaignIds()) {
        const bans = (await window.api.loadBans(cid)) as { peerIds?: string[]; names?: string[]; clients?: unknown[] }
        if (bans && (bans.peerIds?.length || bans.names?.length || bans.clients?.length)) {
          out.push({ id: cid, entity: bans })
        }
      }
      return out
    },
    async putEntity(id, entity) {
      await window.api.saveBans(id, entity as Parameters<typeof window.api.saveBans>[1])
    },
    async removeEntity(id) {
      await window.api.saveBans(id, { peerIds: [], names: [] })
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // Per-book bookmarks/annotations. Book CONFIG isn't synced (custom PDFs are
    // device-local); core books share stable ids so their notes travel.
    name: 'book-data',
    async listEntities() {
      const cfg: unknown = await window.api.books.loadConfig()
      const books = (Array.isArray(cfg) ? cfg : ((cfg as { books?: unknown[] })?.books ?? [])) as Array<{ id?: string }>
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const bk of books) {
        if (!bk?.id) continue
        const data = (await window.api.books.loadData(bk.id)) as { bookmarks?: unknown[]; annotations?: unknown[] }
        if (data && (data.bookmarks?.length || data.annotations?.length)) {
          out.push({ id: bk.id, entity: data })
        }
      }
      return out
    },
    async putEntity(id, entity) {
      await window.api.books.saveData(id, entity as Parameters<typeof window.api.books.saveData>[1])
    },
    async removeEntity(id) {
      await window.api.books.saveData(id, { bookmarks: [], annotations: [] })
    },
    serialize: jsonSerialize,
    deserialize: jsonDeserialize
  },
  {
    // Image library (binary). list() is summaries; bytes via readData (data:/blob: URL).
    name: 'image-library',
    async listEntities() {
      const metas = asArray(await window.api.imageLibrary.list())
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const m of metas) {
        const meta = m as { id?: string; name?: string; fileName?: string; extension?: string; savedAt?: string }
        if (!meta.id) continue
        const extension = meta.extension ?? (meta.fileName ? (meta.fileName.split('.').pop() ?? 'png') : 'png')
        const id = meta.id
        const bytes = await cachedBytes(`img:${id}`, `${meta.savedAt ?? ''}:${extension}`, async () => {
          const r: unknown = await window.api.imageLibrary.readData(id)
          const url = typeof r === 'string' ? r : (r as { data?: { dataUrl?: string } } | null)?.data?.dataUrl
          return url ? fetchBytes(url) : null
        })
        if (!bytes) continue
        out.push({
          id,
          entity: { id, name: meta.name ?? id, extension, bytes },
          changeKey: `${meta.savedAt ?? ''}:${extension}`
        })
      }
      return out
    },
    async putEntity(_id, entity) {
      const e = entity as { id: string; name: string; extension: string; bytes: ArrayBuffer }
      await window.api.imageLibrary.save(e.id, e.name, e.bytes, e.extension)
    },
    async removeEntity(id) {
      await window.api.imageLibrary.delete(id)
    },
    serialize: binarySerialize,
    deserialize: binaryDeserialize
  },
  {
    // Per-campaign custom audio (binary). Keyed `<campaignId>/<fileName>`.
    name: 'audio',
    async listEntities() {
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const cid of await campaignIds()) {
        for (const item of asArray(await window.api.audioListCustom(cid))) {
          const fileName = typeof item === 'string' ? item : (item as { fileName?: string })?.fileName
          if (!fileName) continue
          const meta = (typeof item === 'object' ? item : {}) as { displayName?: string; category?: string }
          const key = `${cid}/${fileName}`
          const bytes = await cachedBytes(`aud:${key}`, fileName, async () => {
            const r: unknown = await window.api.audioGetCustomPath(cid, fileName)
            const url = typeof r === 'string' ? r : (r as { data?: string } | null)?.data
            return url ? fetchBytes(url) : null
          })
          if (!bytes) continue
          out.push({
            id: key,
            entity: {
              campaignId: cid,
              fileName,
              displayName: meta.displayName ?? fileName,
              category: meta.category ?? 'custom',
              bytes
            },
            changeKey: fileName
          })
        }
      }
      return out
    },
    async putEntity(_id, entity) {
      const e = entity as {
        campaignId: string
        fileName: string
        displayName: string
        category: string
        bytes: ArrayBuffer
      }
      await window.api.audioUploadCustom(e.campaignId, e.fileName, e.bytes, e.displayName, e.category)
    },
    async removeEntity(id) {
      const i = id.indexOf('/')
      if (i < 0) return
      await window.api.audioDeleteCustom(id.slice(0, i), id.slice(i + 1))
    },
    serialize: binarySerialize,
    deserialize: binaryDeserialize
  },
  {
    // Custom book PDFs (binary). Core books are device-local installs; only
    // user-imported `custom` books travel. Pulling one writes the PDF AND its
    // config entry (saveBytes -> addBook), so book + notes arrive together.
    name: 'book-files',
    async listEntities() {
      const cfg: unknown = await window.api.books.loadConfig()
      const books = (Array.isArray(cfg) ? cfg : ((cfg as { books?: unknown[] })?.books ?? [])) as Array<{
        id?: string
        title?: string
        path?: string
        type?: string
      }>
      const out: Array<{ id: string; entity: unknown; changeKey?: string }> = []
      for (const bk of books) {
        if (!bk?.id || bk.type !== 'custom' || !bk.path) continue
        // PDF is immutable per id once imported -> changeKey = id (read+hash once).
        const bytes = await cachedBytes(`book:${bk.id}`, bk.id, () => fetchBytes(bk.path as string))
        if (!bytes) continue
        out.push({ id: bk.id, entity: { id: bk.id, title: bk.title ?? bk.id, ext: '.pdf', bytes }, changeKey: bk.id })
      }
      return out
    },
    async putEntity(_id, entity) {
      const e = entity as { id: string; title: string; ext: string; bytes: ArrayBuffer }
      await window.api.books.saveBytes(e.id, e.title, e.ext, e.bytes)
    },
    async removeEntity(id) {
      await window.api.books.remove(id)
    },
    serialize: binarySerialize,
    deserialize: binaryDeserialize
  }
]

export function domainByName(name: string): SyncDomain | undefined {
  return DOMAINS.find((d) => d.name === name)
}
