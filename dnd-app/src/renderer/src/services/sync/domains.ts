/**
 * Registry of synced data domains. Each domain knows how to enumerate its local
 * entities, write a pulled entity back, delete one, and (de)serialize to bytes.
 * Everything routes through `window.api.*`, so the SAME registry drives sync on
 * both desktop (IPC → file storage) and web (IndexedDB).
 *
 * First cut covers the core id-keyed JSON content. Deferred (logged for a
 * follow-up): binary stores (image-library, audio), campaign-scoped state
 * (game-state, ai-conversations, bans), books, and settings (device-local
 * fields make it a merge, not an overwrite).
 */

export interface SyncDomain {
  name: string
  listEntities(): Promise<Array<{ id: string; entity: unknown }>>
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
      const out: Array<{ id: string; entity: unknown }> = []
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
      const out: Array<{ id: string; entity: unknown }> = []
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
      const out: Array<{ id: string; entity: unknown }> = []
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
      const out: Array<{ id: string; entity: unknown }> = []
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
  }
]

export function domainByName(name: string): SyncDomain | undefined {
  return DOMAINS.find((d) => d.name === name)
}
