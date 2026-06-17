/**
 * PHASE-27 27A — engine-owned, schema-validated per-campaign world state.
 *
 * The LLM never owns this truth: it emits small flat deltas (27E verbs) that deterministic
 * main-process code clamps/resolves/applies here through ONE serialized write queue. The
 * context receives a bounded, relevance-sliced view (27F `buildContextBlock`) instead of the
 * all-or-nothing memory dump. Opt-in per campaign (`enabled`, default false); when off, no
 * AI-facing behavior changes.
 *
 * Storage + locking mirror the PHASE-25 entity-store / MemoryManager conventions: a per-file
 * promise-chain lock, atomic tmp+rename writes, a module factory cache, and a slug-id scheme
 * shared with `npcMemoryFromAttitude` (so PHASE-28 can join NPCs across stores).
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'

const WorldExitSchema = z.object({ toLocationId: z.string(), label: z.string().max(60) })
const WorldLocationSchema = z.object({
  id: z.string(), // slugified name — ids ARE names (Intra postmortem; see Research notes)
  name: z.string().max(120),
  type: z.string().max(40).default(''),
  description: z.string().max(500).default(''),
  exits: z.array(WorldExitSchema).max(12).default([]),
  visited: z.boolean().default(false),
  firstVisited: z.string().nullable().default(null),
  lastVisited: z.string().nullable().default(null)
})
const NpcOpinionSchema = z.object({
  characterName: z.string().max(120),
  characterId: z.string().nullable().default(null),
  score: z.number().int().min(-100).max(100),
  summary: z.string().max(300).default(''),
  updatedAt: z.string()
})
const WorldNpcStateSchema = z.object({
  id: z.string(), // slugified name, same derivation as npcMemoryFromAttitude
  name: z.string().max(120),
  locationId: z.string().nullable().default(null),
  opinions: z.array(NpcOpinionSchema).max(12).default([])
})
const WorldFactSchema = z.object({
  id: z.string(),
  text: z.string().max(300),
  tags: z.array(z.string().max(40)).max(6).default([]),
  createdAt: z.string()
})
export const WorldStoreSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean().default(false),
  partyLocationId: z.string().nullable().default(null),
  locations: z.array(WorldLocationSchema).max(300).default([]),
  npcs: z.array(WorldNpcStateSchema).max(300).default([]),
  facts: z.array(WorldFactSchema).max(200).default([]),
  updatedAt: z.string()
})

export type WorldExit = z.infer<typeof WorldExitSchema>
export type WorldLocation = z.infer<typeof WorldLocationSchema>
export type NpcOpinion = z.infer<typeof NpcOpinionSchema>
export type WorldNpcState = z.infer<typeof WorldNpcStateSchema>
export type WorldFact = z.infer<typeof WorldFactSchema>
export type WorldStore = z.infer<typeof WorldStoreSchema>

const MAX_FACTS = 200

/** Slug derivation identical to npcMemoryFromAttitude (memory-manager.ts:65-69) so the world
 *  store and the legacy NPC memory share ids; PHASE-28 joins on it. */
export function slugifyId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function emptyStore(): WorldStore {
  return {
    version: 1,
    enabled: false,
    partyLocationId: null,
    locations: [],
    npcs: [],
    facts: [],
    updatedAt: new Date().toISOString()
  }
}

// Module-level enabled-flag cache so 27F's per-turn isEnabled() doesn't re-read disk.
const enabledCache = new Map<string, boolean>()

export class WorldStateStore {
  private campaignId: string
  private basePath: string
  private filePath: string
  private queue: Promise<unknown> = Promise.resolve()

  constructor(campaignId: string) {
    this.campaignId = campaignId
    this.basePath = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')
    this.filePath = path.join(this.basePath, 'world-store.json')
  }

  /** Read + safeParse; corrupt/absent → empty store seeded from the legacy memory files. */
  private async readStore(): Promise<WorldStore> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = WorldStoreSchema.safeParse(JSON.parse(raw))
      if (parsed.success) {
        enabledCache.set(this.campaignId, parsed.data.enabled)
        return parsed.data
      }
    } catch {
      // missing/corrupt → fall through to a freshly-seeded empty store
    }
    const store = emptyStore()
    await this.seedFromLegacy(store)
    enabledCache.set(this.campaignId, store.enabled)
    return store
  }

  private async writeAtomic(store: WorldStore): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8')
    await fs.rename(tmp, this.filePath)
  }

  /** Serialized read → mutate → atomic write (mirrors entity-store/MemoryManager). */
  private async withLock<T>(mutate: (store: WorldStore) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const store = await this.readStore()
      const result = await mutate(store)
      store.updatedAt = new Date().toISOString()
      enabledCache.set(this.campaignId, store.enabled)
      await this.writeAtomic(store)
      return result
    })
    this.queue = run.catch(() => {})
    return run
  }

  async getSnapshot(): Promise<WorldStore> {
    return this.readStore()
  }

  async isEnabled(): Promise<boolean> {
    const cached = enabledCache.get(this.campaignId)
    if (cached !== undefined) return cached
    return (await this.readStore()).enabled
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.withLock((store) => {
      store.enabled = enabled
    })
  }

  // ── Mutators (27E). Resolve names case-insensitively, then by slug. Never throw on rejection. ──

  private findLocation(store: WorldStore, name: string): WorldLocation | undefined {
    const lc = name.trim().toLowerCase()
    const slug = slugifyId(name)
    return store.locations.find((l) => l.name.toLowerCase() === lc || l.id === slug)
  }

  private ensureLocation(store: WorldStore, name: string): WorldLocation {
    let loc = this.findLocation(store, name)
    if (!loc) {
      loc = WorldLocationSchema.parse({ id: slugifyId(name), name: name.trim().slice(0, 120) })
      store.locations.push(loc)
    }
    return loc
  }

  private addExit(from: WorldLocation, toId: string, label: string): void {
    if (from.id === toId) return
    if (!from.exits.some((e) => e.toLocationId === toId)) {
      if (from.exits.length < 12) from.exits.push({ toLocationId: toId, label: label.slice(0, 60) })
    }
  }

  async discoverLocation(input: {
    name: string
    type?: string
    description?: string
    connectsFromId?: string
    exitLabel?: string
  }): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((store) => {
      const existed = !!this.findLocation(store, input.name)
      const loc = this.ensureLocation(store, input.name)
      if (input.type) loc.type = input.type.slice(0, 40)
      if (input.description && !loc.description) loc.description = input.description.slice(0, 500)
      if (input.connectsFromId) {
        const from = store.locations.find((l) => l.id === input.connectsFromId)
        if (from) {
          this.addExit(from, loc.id, input.exitLabel ?? loc.name)
          this.addExit(loc, from.id, input.exitLabel ?? from.name)
        }
      }
      return { applied: true, detail: existed ? 'updated location' : 'discovered location' }
    })
  }

  async movePartyTo(name: string): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((store) => {
      const prevId = store.partyLocationId
      const loc = this.ensureLocation(store, name) // lenient: auto-stub unknown destinations
      const now = new Date().toISOString()
      if (!loc.visited) {
        loc.visited = true
        loc.firstVisited = loc.firstVisited ?? now
      }
      loc.lastVisited = now
      // Link from the previous location so backtracking stays consistent.
      if (prevId && prevId !== loc.id) {
        const prev = store.locations.find((l) => l.id === prevId)
        if (prev) {
          this.addExit(prev, loc.id, loc.name)
          this.addExit(loc, prev.id, prev.name)
        }
      }
      store.partyLocationId = loc.id
      return { applied: true, detail: `party at ${loc.name}` }
    })
  }

  async linkLocations(fromName: string, toName: string, label?: string): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((store) => {
      const from = this.ensureLocation(store, fromName)
      const to = this.ensureLocation(store, toName)
      if (from.id === to.id) return { applied: false, detail: 'cannot link a location to itself' }
      this.addExit(from, to.id, label ?? to.name)
      this.addExit(to, from.id, label ?? from.name)
      return { applied: true, detail: `linked ${from.name} ↔ ${to.name}` }
    })
  }

  private findNpc(store: WorldStore, name: string): WorldNpcState | undefined {
    const lc = name.trim().toLowerCase()
    const slug = slugifyId(name)
    return store.npcs.find((n) => n.name.toLowerCase() === lc || n.id === slug)
  }

  private ensureNpc(store: WorldStore, name: string): WorldNpcState {
    let npc = this.findNpc(store, name)
    if (!npc) {
      npc = WorldNpcStateSchema.parse({ id: slugifyId(name), name: name.trim().slice(0, 120) })
      store.npcs.push(npc)
    }
    return npc
  }

  async setNpcOpinion(input: {
    npcName: string
    characterName: string
    delta?: number
    score?: number
    summary?: string
  }): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((store) => {
      const npc = this.ensureNpc(store, input.npcName)
      const lc = input.characterName.trim().toLowerCase()
      let op = npc.opinions.find((o) => o.characterName.toLowerCase() === lc)
      if (!op) {
        op = {
          characterName: input.characterName.trim().slice(0, 120),
          characterId: null,
          score: 0,
          summary: '',
          updatedAt: ''
        }
        if (npc.opinions.length < 12) npc.opinions.push(op)
      }
      // `score` (absolute) wins over `delta` (relative) when both are present.
      if (input.score !== undefined) op.score = input.score
      else if (input.delta !== undefined) op.score = op.score + input.delta
      op.score = Math.max(-100, Math.min(100, Math.round(op.score)))
      if (input.summary) op.summary = input.summary.slice(0, 300)
      op.updatedAt = new Date().toISOString()
      return { applied: true, detail: `${npc.name}'s opinion of ${op.characterName}: ${op.score}` }
    })
  }

  async setNpcLocation(npcName: string, locationName: string): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((store) => {
      const npc = this.ensureNpc(store, npcName)
      const loc = this.ensureLocation(store, locationName)
      npc.locationId = loc.id
      return { applied: true, detail: `${npc.name} at ${loc.name}` }
    })
  }

  async recordFact(text: string, tags?: string[]): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((store) => {
      const trimmed = text.trim().slice(0, 300)
      if (!trimmed) return { applied: false, detail: 'empty fact' }
      if (store.facts.some((f) => f.text.toLowerCase() === trimmed.toLowerCase())) {
        return { applied: false, detail: 'duplicate fact' }
      }
      store.facts.push({
        id: crypto.randomUUID(),
        text: trimmed,
        tags: (tags ?? []).slice(0, 6).map((t) => t.slice(0, 40)),
        createdAt: new Date().toISOString()
      })
      if (store.facts.length > MAX_FACTS) store.facts.splice(0, store.facts.length - MAX_FACTS) // FIFO
      return { applied: true, detail: 'fact recorded' }
    })
  }

  /** One-time seed from the legacy flat-file memory (read-only). Best-effort; failures seed nothing. */
  private async seedFromLegacy(store: WorldStore): Promise<void> {
    try {
      const raw = await fs.readFile(path.join(this.basePath, 'npc-personalities.json'), 'utf-8')
      const personalities = JSON.parse(raw) as Array<{ name?: unknown; location?: unknown }>
      if (Array.isArray(personalities)) {
        for (const p of personalities) {
          if (typeof p.name !== 'string' || !p.name.trim()) continue
          if (this.findNpc(store, p.name)) continue
          const npc = WorldNpcStateSchema.parse({ id: slugifyId(p.name), name: p.name.trim().slice(0, 120) })
          if (typeof p.location === 'string' && p.location.trim()) npc.locationId = slugifyId(p.location)
          store.npcs.push(npc)
        }
      }
    } catch {
      // no legacy NPC data
    }
    try {
      const raw = await fs.readFile(path.join(this.basePath, 'world-state-summary.json'), 'utf-8')
      const summary = JSON.parse(raw) as { currentLocation?: unknown }
      if (
        typeof summary.currentLocation === 'string' &&
        summary.currentLocation.trim() &&
        summary.currentLocation !== 'Unknown'
      ) {
        const loc = this.ensureLocation(store, summary.currentLocation)
        loc.visited = true
        loc.firstVisited = loc.firstVisited ?? new Date().toISOString()
        store.partyLocationId = loc.id
      }
    } catch {
      // no legacy summary
    }
  }

  /** PHASE-27 27F — bounded, relevance-sliced context view. Empty store → ''. */
  async buildContextBlock(): Promise<string> {
    const store = await this.readStore()
    if (store.locations.length === 0 && store.npcs.length === 0 && store.facts.length === 0) return ''
    const byId = new Map(store.locations.map((l) => [l.id, l]))
    const lines: string[] = ['[WORLD STATE]']

    const party = store.partyLocationId ? byId.get(store.partyLocationId) : undefined
    if (party) {
      lines.push(
        `Party location: ${party.name}${party.type ? ` (${party.type})` : ''}.${party.description ? ` ${party.description}` : ''}`
      )
      const exits = party.exits
        .slice(0, 12)
        .map((e) => `${e.label} → ${byId.get(e.toLocationId)?.name ?? e.toLocationId}`)
      if (exits.length) lines.push(`Exits: ${exits.join('; ')}`)
      const here = store.npcs.filter((n) => n.locationId === party.id).slice(0, 8)
      for (const n of here) {
        const ops = n.opinions
          .slice(0, 4)
          .map(
            (o) =>
              `opinion of ${o.characterName}: ${o.score >= 0 ? '+' : ''}${o.score}${o.summary ? ` (${o.summary})` : ''}`
          )
        lines.push(`NPC here: ${n.name}${ops.length ? ` — ${ops.join('; ')}` : ''}`)
      }
    }
    const others = store.locations
      .filter((l) => l.id !== store.partyLocationId)
      .slice(0, 15)
      .map((l) => `${l.name} (${l.visited ? 'visited' : 'unvisited'})`)
    if (others.length) lines.push(`Other known locations: ${others.join(', ')}`)
    if (store.facts.length) {
      lines.push(
        `Established facts: ${store.facts
          .slice(-8)
          .map((f) => f.text)
          .join(' · ')}`
      )
    }
    lines.push('[/WORLD STATE]')
    return lines.join('\n')
  }
}

// Factory cache — one store per campaign (mirror getMemoryManager / getEntityStore).
const stores = new Map<string, WorldStateStore>()

export function getWorldStateStore(campaignId: string): WorldStateStore {
  let store = stores.get(campaignId)
  if (!store) {
    store = new WorldStateStore(campaignId)
    stores.set(campaignId, store)
  }
  return store
}

/** Test/cascade helper: drop the factory + enabled caches. */
export function _resetWorldStateStoreCaches(): void {
  stores.clear()
  enabledCache.clear()
}
