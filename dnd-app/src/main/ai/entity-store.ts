/**
 * PHASE-25 25A — per-campaign entity-record store (npc / location / item / faction).
 *
 * Durable, DM-correctable descriptive memory: discrete records auto-written by the AI
 * (the `record_entity` verb, 25B) or an opt-in post-turn extraction pass (25C), viewable
 * and EDITABLE in a DM panel (25F). A DM edit `locked`s a record so AI/extraction writes
 * can no longer clobber it (the Friends & Fables "Franz" drift-correction pattern).
 * Injected as a labeled `[ENTITY RECORDS]` block (25E) only when `config.enabled`.
 *
 * Storage mirrors MemoryManager (memory-manager.ts): per-file promise-chain write lock,
 * a 1 MB per-file cap, and a module-level factory cache. File lives at
 * `userData/campaigns/{id}/ai-context/entities.json`; campaignId is sanitized at the IPC
 * boundary (25B), same trust model as MemoryManager.
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'

const MAX_ENTITY_FILE_SIZE = 1 * 1024 * 1024 // 1 MB per entities.json (mirrors memory-manager.ts:8)
const MAX_RECORDS = 400 // hard schema cap
const ALIAS_CAP = 6
const KEYWORD_CAP = 8
const SELECT_CAP = 12 // default max records injected per turn
const DETAILS_LINE_CAP = 4 // only the first N selected records emit a details line

// ── Schemas (strict, bounded) ────────────────────────────────────────────────

export const EntityKindSchema = z.enum(['npc', 'location', 'item', 'faction'])
export type EntityKind = z.infer<typeof EntityKindSchema>

export const EntityRecordSchema = z.object({
  id: z.string(), // slugifyId(name) — ids ARE names (Intra / PHASE-27 convention)
  name: z.string().min(1).max(120),
  kind: EntityKindSchema,
  summary: z.string().max(400).default(''), // one-paragraph "who/what this is"
  details: z.string().max(1200).default(''), // optional longer notes
  aliases: z.array(z.string().max(60)).max(ALIAS_CAP).default([]),
  keywords: z.array(z.string().max(40)).max(KEYWORD_CAP).default([]),
  injection: z.enum(['auto', 'always', 'never']).default('auto'),
  source: z.enum(['ai', 'extraction', 'dm']),
  locked: z.boolean().default(false), // true once a DM edits — AI/extraction then bump only lastSeenAt/mentions
  mentions: z.number().int().min(0).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSeenAt: z.string()
})
export type EntityRecord = z.infer<typeof EntityRecordSchema>

export const EntityStoreConfigSchema = z.object({
  enabled: z.boolean().default(false), // master flag: context block + verb docs + extraction
  autoExtract: z.boolean().default(false), // post-turn extraction call (25C); requires enabled
  loreMode: z.enum(['all', 'triggered']).default('all') // lore injection mode (25E)
})
export type EntityStoreConfig = z.infer<typeof EntityStoreConfigSchema>

export const EntityStoreFileSchema = z.object({
  version: z.literal(1),
  // .default re-parses an empty object so the per-field config defaults are applied
  // (zod's .default(value) does NOT re-validate the literal — a bare {} would skip them).
  config: EntityStoreConfigSchema.default(() => EntityStoreConfigSchema.parse({})),
  records: z.array(EntityRecordSchema).max(MAX_RECORDS).default([]),
  updatedAt: z.string()
})
export type EntityStoreFile = z.infer<typeof EntityStoreFileSchema>

export interface EntityUpsertInput {
  name: string
  kind: EntityKind
  summary?: string
  details?: string
  aliases?: string[]
  keywords?: string[]
  injection?: 'auto' | 'always' | 'never'
  source: 'ai' | 'extraction' | 'dm'
}

// ── Pure helpers (exported; testable without IO) ──────────────────────────────

/** Slug derivation byte-identical to npcMemoryFromAttitude (memory-manager.ts:65-69);
 *  PHASE-27 may import this instead of redefining it. */
export function slugifyId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Case-insensitive WHOLE-WORD match (SillyTavern's default), shared by entity selection
 *  (here) and lore keyword injection (lore-injection.ts imports this — one implementation). */
export function matchesKey(scanText: string, key: string): boolean {
  const k = key.trim()
  if (!k) return false
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(k.toLowerCase())}(?:[^a-z0-9]|$)`)
  return re.test(scanText.toLowerCase())
}

/** Deterministic record selection for a scan text. Pure — no IO. */
export function pickEntities(
  records: EntityRecord[],
  scanText: string,
  caps?: { maxRecords?: number }
): EntityRecord[] {
  const max = caps?.maxRecords ?? SELECT_CAP
  const candidates = records.filter((r) => {
    if (r.injection === 'never') return false
    if (r.injection === 'always') return true
    // 'auto': include when name / any alias / any keyword whole-word-matches the scan text
    if (matchesKey(scanText, r.name)) return true
    if (r.aliases.some((a) => matchesKey(scanText, a))) return true
    if (r.keywords.some((k) => matchesKey(scanText, k))) return true
    return false
  })
  candidates.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)) // recency desc
  return candidates.slice(0, max)
}

const KIND_DISPLAY_ORDER: EntityKind[] = ['npc', 'location', 'faction', 'item']

/** Build the bounded `[ENTITY RECORDS]` block from already-selected records.
 *  Empty input → '' (the builder PHASE-31 consumes). */
export function formatEntityBlock(selected: EntityRecord[]): string {
  if (selected.length === 0) return ''
  const lines: string[] = ['[ENTITY RECORDS]']
  let detailsShown = 0
  for (const kind of KIND_DISPLAY_ORDER) {
    for (const r of selected.filter((s) => s.kind === kind)) {
      const aka = r.aliases.length ? ` (aka ${r.aliases.map((a) => `"${a}"`).join(', ')})` : ''
      lines.push(`${kind.toUpperCase()} — ${r.name}${aka}: ${r.summary}`)
      if (r.details && detailsShown < DETAILS_LINE_CAP) {
        lines.push(`  ${r.details}`)
        detailsShown++
      }
    }
  }
  lines.push('[/ENTITY RECORDS]')
  return lines.join('\n')
}

function unionCap(existing: string[], incoming: string[], cap: number): string[] {
  const out = [...existing]
  const seen = new Set(existing.map((s) => s.toLowerCase()))
  for (const item of incoming) {
    const lc = item.toLowerCase()
    if (!seen.has(lc)) {
      seen.add(lc)
      out.push(item)
    }
  }
  return out.slice(0, cap)
}

/** Enforce the per-file byte cap + record-count cap. Eviction priority: oldest `lastSeenAt`
 *  among UNLOCKED `ai`/`extraction` records first; never evicts `locked` or `source:'dm'`. Pure. */
export function enforceCaps(
  records: EntityRecord[],
  maxRecords = MAX_RECORDS,
  maxBytes = MAX_ENTITY_FILE_SIZE
): EntityRecord[] {
  const result = [...records]
  const protect = (r: EntityRecord): boolean => r.locked || r.source === 'dm'
  const evictOne = (): boolean => {
    let victim = -1
    for (let i = 0; i < result.length; i++) {
      if (protect(result[i])) continue
      if (victim === -1 || result[i].lastSeenAt.localeCompare(result[victim].lastSeenAt) < 0) victim = i
    }
    if (victim === -1) return false // nothing evictable (all locked/dm)
    result.splice(victim, 1)
    return true
  }
  while (result.length > maxRecords) {
    if (!evictOne()) break
  }
  while (result.length > 0 && Buffer.byteLength(JSON.stringify(result), 'utf-8') > maxBytes) {
    if (!evictOne()) break
  }
  return result
}

// ── Store ─────────────────────────────────────────────────────────────────────

function defaultFile(): EntityStoreFile {
  return { version: 1, config: EntityStoreConfigSchema.parse({}), records: [], updatedAt: new Date().toISOString() }
}

// Module-level config cache so 25E's per-turn hot path doesn't hit disk twice
// (refreshed on every read/write; invalidated by setConfig). Keyed by campaignId.
const configCache = new Map<string, EntityStoreConfig>()

export class EntityStore {
  private basePath: string
  private filePath: string
  private campaignId: string
  // Single serialized mutation queue (mirrors memory-manager.ts:167-179).
  private lock: Promise<unknown> = Promise.resolve()

  constructor(campaignId: string) {
    this.campaignId = campaignId
    this.basePath = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')
    this.filePath = path.join(this.basePath, 'entities.json')
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true })
  }

  /** Read + safeParse the file; corrupt/absent → empty store with default config. Refreshes the config cache. */
  private async readFile(): Promise<EntityStoreFile> {
    let file: EntityStoreFile
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = EntityStoreFileSchema.safeParse(JSON.parse(raw))
      file = parsed.success ? parsed.data : defaultFile()
    } catch {
      file = defaultFile()
    }
    configCache.set(this.campaignId, file.config)
    return file
  }

  private async writeAtomic(file: EntityStoreFile): Promise<void> {
    await this.ensureDir()
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(file, null, 2), 'utf-8')
    await fs.rename(tmp, this.filePath)
  }

  /** Serialized read → mutate → cap → atomic-write. The mutator's return value is the result. */
  private async withLock<T>(mutate: (file: EntityStoreFile) => T): Promise<T> {
    const run = this.lock.then(async () => {
      const file = await this.readFile()
      const result = mutate(file)
      file.records = enforceCaps(file.records)
      file.updatedAt = new Date().toISOString()
      configCache.set(this.campaignId, file.config)
      await this.writeAtomic(file)
      return result
    })
    // Keep the chain alive even if one task throws (mirror memory-manager.ts:173-177).
    this.lock = run.catch(() => {})
    return run
  }

  /** Read-only snapshot (may read outside the lock). */
  async getSnapshot(): Promise<{ config: EntityStoreConfig; records: EntityRecord[] }> {
    const file = await this.readFile()
    return { config: file.config, records: file.records }
  }

  async getConfig(): Promise<EntityStoreConfig> {
    const cached = configCache.get(this.campaignId)
    if (cached) return cached
    return (await this.readFile()).config
  }

  async setConfig(partial: Partial<EntityStoreConfig>): Promise<EntityStoreConfig> {
    return this.withLock((file) => {
      file.config = { ...file.config, ...partial }
      return file.config
    })
  }

  private findRecord(file: EntityStoreFile, nameOrId: string): EntityRecord | undefined {
    const lc = nameOrId.trim().toLowerCase()
    const slug = slugifyId(nameOrId)
    return file.records.find(
      (r) =>
        r.name.toLowerCase() === lc ||
        r.aliases.some((a) => a.toLowerCase() === lc) ||
        r.id === slug ||
        r.id === nameOrId
    )
  }

  /** Create or merge a record. Never throws on a semantic rejection (returns applied:false). */
  async upsertEntity(input: EntityUpsertInput): Promise<{ applied: boolean; detail: string }> {
    return this.withLock((file) => {
      const now = new Date().toISOString()
      const existing = this.findRecord(file, input.name)

      if (!existing) {
        file.records.push({
          id: slugifyId(input.name),
          name: input.name.trim().slice(0, 120),
          kind: input.kind,
          summary: (input.summary ?? '').slice(0, 400),
          details: (input.details ?? '').slice(0, 1200),
          aliases: (input.aliases ?? []).slice(0, ALIAS_CAP).map((a) => a.slice(0, 60)),
          keywords: (input.keywords ?? []).slice(0, KEYWORD_CAP).map((k) => k.slice(0, 40)),
          injection: input.injection ?? 'auto',
          source: input.source,
          locked: input.source === 'dm',
          mentions: 1,
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now
        })
        return { applied: true, detail: 'created' }
      }

      // Existing record: always bump recency + mention count.
      existing.lastSeenAt = now
      existing.mentions += 1

      // Locked + non-DM writer: bump only (no content change).
      if (existing.locked && input.source !== 'dm') {
        return { applied: false, detail: 'locked by DM edit' }
      }

      if (input.source === 'dm') {
        if (input.summary !== undefined) existing.summary = input.summary.slice(0, 400)
        if (input.details !== undefined) existing.details = input.details.slice(0, 1200)
        if (input.aliases !== undefined) existing.aliases = input.aliases.slice(0, ALIAS_CAP).map((a) => a.slice(0, 60))
        if (input.keywords !== undefined)
          existing.keywords = input.keywords.slice(0, KEYWORD_CAP).map((k) => k.slice(0, 40))
        if (input.injection !== undefined) existing.injection = input.injection
        existing.kind = input.kind
        existing.locked = true
        existing.source = 'dm'
        existing.updatedAt = now
        return { applied: true, detail: 'updated by DM' }
      }

      // AI/extraction onto an unlocked record: fill only blanks, union-merge alias/keyword sets.
      const wasStub = !existing.summary
      let changed = false
      if (!existing.summary && input.summary) {
        existing.summary = input.summary.slice(0, 400)
        changed = true
      }
      if (!existing.details && input.details) {
        existing.details = input.details.slice(0, 1200)
        changed = true
      }
      if (input.aliases?.length) {
        existing.aliases = unionCap(
          existing.aliases,
          input.aliases.map((a) => a.slice(0, 60)),
          ALIAS_CAP
        )
        changed = true
      }
      if (input.keywords?.length) {
        existing.keywords = unionCap(
          existing.keywords,
          input.keywords.map((k) => k.slice(0, 40)),
          KEYWORD_CAP
        )
        changed = true
      }
      if (wasStub) existing.kind = input.kind // re-type only a bare stub
      if (changed) existing.updatedAt = now
      return { applied: true, detail: changed ? 'merged' : 'bumped' }
    })
  }

  async deleteEntity(idOrName: string): Promise<boolean> {
    return this.withLock((file) => {
      const rec = this.findRecord(file, idOrName)
      if (!rec) return false
      file.records = file.records.filter((r) => r !== rec)
      return true
    })
  }

  /** Bump lastSeenAt/mentions for an existing record (extraction dedupe path); no-op if absent. */
  async touchEntity(name: string): Promise<void> {
    await this.withLock((file) => {
      const rec = this.findRecord(file, name)
      if (rec) {
        rec.lastSeenAt = new Date().toISOString()
        rec.mentions += 1
      }
    })
  }

  async selectEntities(scanText: string, caps?: { maxRecords?: number }): Promise<EntityRecord[]> {
    const { records } = await this.getSnapshot()
    return pickEntities(records, scanText, caps)
  }

  /** Deterministic, bounded `[ENTITY RECORDS]` block (PHASE-31 consumes this). */
  async buildEntityContextBlock(scanText: string): Promise<string> {
    return formatEntityBlock(await this.selectEntities(scanText))
  }
}

// Factory cache — one store per campaign (mirror getMemoryManager, memory-manager.ts:644-651).
const stores = new Map<string, EntityStore>()

export function getEntityStore(campaignId: string): EntityStore {
  let store = stores.get(campaignId)
  if (!store) {
    store = new EntityStore(campaignId)
    stores.set(campaignId, store)
  }
  return store
}

/** Test helper: drop the factory + config caches so each test starts clean. */
export function _resetEntityStoreCaches(): void {
  stores.clear()
  configCache.clear()
}
