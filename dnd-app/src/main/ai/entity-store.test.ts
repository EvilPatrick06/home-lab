import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stateful in-memory fs so read-after-write works (upsert/lock/merge tests need it).
const mockState = vi.hoisted(() => ({ files: new Map<string, string>() }))
const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async (p: string) => {
    const c = mockState.files.get(p)
    if (c === undefined) {
      const e = new Error('ENOENT') as NodeJS.ErrnoException
      e.code = 'ENOENT'
      throw e
    }
    return c
  }),
  writeFile: vi.fn(async (p: string, data: string) => {
    mockState.files.set(p, data)
  }),
  rename: vi.fn(async (from: string, to: string) => {
    const c = mockState.files.get(from)
    if (c !== undefined) {
      mockState.files.set(to, c)
      mockState.files.delete(from)
    }
  })
}))

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }))
vi.mock('fs', () => ({ promises: mockFs }))

import { EntityUpsertPayloadSchema } from '../../shared/ipc-schemas'
import { validateDmAction } from './ai-schemas'
import {
  _resetEntityStoreCaches,
  type EntityRecord,
  EntityRecordSchema,
  EntityStoreFileSchema,
  enforceCaps,
  formatEntityBlock,
  getEntityStore,
  matchesKey,
  pickEntities,
  slugifyId
} from './entity-store'
import { buildLoreBlock, selectLore } from './lore-injection'
import { npcMemoryFromAttitude } from './memory-manager'

const ENTITIES_PATH = '/tmp/test/campaigns/c1/ai-context/entities.json'

function mkRec(partial: Partial<EntityRecord> & { name: string }): EntityRecord {
  return {
    id: slugifyId(partial.name),
    name: partial.name,
    kind: partial.kind ?? 'npc',
    summary: partial.summary ?? `about ${partial.name}`,
    details: partial.details ?? '',
    aliases: partial.aliases ?? [],
    keywords: partial.keywords ?? [],
    injection: partial.injection ?? 'auto',
    source: partial.source ?? 'ai',
    locked: partial.locked ?? false,
    mentions: partial.mentions ?? 1,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    lastSeenAt: partial.lastSeenAt ?? '2026-01-01T00:00:00.000Z'
  }
}

beforeEach(() => {
  mockState.files.clear()
  vi.clearAllMocks()
  _resetEntityStoreCaches()
})

describe('schemas', () => {
  it('applies record defaults', () => {
    const r = EntityRecordSchema.parse({
      id: 'goblin',
      name: 'Goblin',
      kind: 'npc',
      source: 'ai',
      createdAt: 't',
      updatedAt: 't',
      lastSeenAt: 't'
    })
    expect(r.summary).toBe('')
    expect(r.aliases).toEqual([])
    expect(r.injection).toBe('auto')
    expect(r.locked).toBe(false)
    expect(r.mentions).toBe(0)
  })

  it('applies file + config defaults (disabled, loreMode all)', () => {
    const f = EntityStoreFileSchema.parse({ version: 1, updatedAt: 't' })
    expect(f.config).toEqual({ enabled: false, autoExtract: false, loreMode: 'all' })
    expect(f.records).toEqual([])
  })
})

describe('slugifyId', () => {
  it('matches the documented derivation', () => {
    expect(slugifyId('Ama Tilen')).toBe('ama-tilen')
    expect(slugifyId('  The Ashen Veil!! ')).toBe('the-ashen-veil')
    expect(slugifyId("Volo's Guide")).toBe('volo-s-guide')
  })
  it('is byte-identical to npcMemoryFromAttitude id derivation (parity)', () => {
    for (const name of ['Ama Tilen', 'Brindlemark', "Volo's Guide", '  Weird   Name  ']) {
      expect(slugifyId(name)).toBe(npcMemoryFromAttitude(name, 'neutral', '').id)
    }
  })
})

describe('matchesKey (whole-word, case-insensitive)', () => {
  it('matches whole words only', () => {
    expect(matchesKey('the rose bloomed', 'rose')).toBe(true)
    expect(matchesKey('a rosewood chest', 'rose')).toBe(false) // not a substring match
  })
  it('is case-insensitive and edge-aware', () => {
    expect(matchesKey('Long live the KING', 'king')).toBe(true)
    expect(matchesKey('liking it', 'king')).toBe(false)
    expect(matchesKey('Veil.', 'veil')).toBe(true)
  })
})

describe('pickEntities', () => {
  const recs = [
    mkRec({ name: 'Ama Tilen', keywords: ['herbalist'], lastSeenAt: '2026-01-03T00:00:00Z' }),
    mkRec({ name: 'Brindlemark', kind: 'location', lastSeenAt: '2026-01-05T00:00:00Z' }),
    mkRec({ name: 'Ashen Veil', kind: 'faction', injection: 'always', lastSeenAt: '2026-01-01T00:00:00Z' }),
    mkRec({ name: 'Secret', injection: 'never', keywords: ['secret'] })
  ]
  it('includes always, excludes never, matches keyword whole-word', () => {
    const out = pickEntities(recs, 'we visited Brindlemark and met the herbalist; secret stuff')
    const names = out.map((r) => r.name)
    expect(names).toContain('Ama Tilen') // keyword "herbalist"
    expect(names).toContain('Brindlemark') // name match
    expect(names).toContain('Ashen Veil') // injection: always
    expect(names).not.toContain('Secret') // injection: never (even though "secret" appears)
  })
  it('ranks by lastSeenAt desc and caps', () => {
    const out = pickEntities(recs, 'Brindlemark Ama Tilen Ashen Veil', { maxRecords: 2 })
    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('Brindlemark') // most recent
  })
})

describe('enforceCaps', () => {
  it('never evicts locked or dm-sourced records; evicts oldest ai first', () => {
    const recs = [
      mkRec({ name: 'A', source: 'ai', lastSeenAt: '2026-01-01T00:00:00Z' }),
      mkRec({ name: 'B', source: 'ai', lastSeenAt: '2026-01-02T00:00:00Z' }),
      mkRec({ name: 'C', source: 'dm', locked: true, lastSeenAt: '2026-01-01T00:00:00Z' }),
      mkRec({ name: 'D', source: 'extraction', lastSeenAt: '2026-01-03T00:00:00Z' })
    ]
    const out = enforceCaps(recs, 2)
    const names = out.map((r) => r.name).sort()
    expect(out).toHaveLength(2)
    expect(names).toContain('C') // dm/locked protected
    expect(names).toContain('D') // newest unlocked survives over A/B
    expect(names).not.toContain('A') // oldest ai evicted first
  })
})

describe('formatEntityBlock', () => {
  it('groups by kind, shows aliases, caps details lines', () => {
    const block = formatEntityBlock([
      mkRec({ name: 'Ama Tilen', aliases: ['the herbalist'], summary: 'a healer', details: 'knows poisons' }),
      mkRec({ name: 'Brindlemark', kind: 'location', summary: 'a village' })
    ])
    expect(block).toContain('[ENTITY RECORDS]')
    expect(block).toContain('NPC — Ama Tilen (aka "the herbalist"): a healer')
    expect(block).toContain('  knows poisons')
    expect(block).toContain('LOCATION — Brindlemark: a village')
    expect(block).toContain('[/ENTITY RECORDS]')
  })
  it('returns empty string for no records', () => {
    expect(formatEntityBlock([])).toBe('')
  })
})

describe('EntityStore IO', () => {
  it('corrupt file → empty store with default config', async () => {
    mockState.files.set(ENTITIES_PATH, 'not json{{{')
    const snap = await getEntityStore('c1').getSnapshot()
    expect(snap.records).toEqual([])
    expect(snap.config.enabled).toBe(false)
  })

  it('10 concurrent upserts of the same new name → exactly one record (lock)', async () => {
    const store = getEntityStore('c1')
    await Promise.all(
      Array.from({ length: 10 }, () => store.upsertEntity({ name: 'Goblin King', kind: 'npc', source: 'ai' }))
    )
    const snap = await store.getSnapshot()
    expect(snap.records).toHaveLength(1)
    expect(snap.records[0].mentions).toBe(10)
  })

  it('DM upsert locks the record; a later AI upsert is a no-op except lastSeenAt/mentions', async () => {
    const store = getEntityStore('c1')
    await store.upsertEntity({ name: 'Volo', kind: 'npc', summary: 'a barkeep', source: 'dm' })
    const ai = await store.upsertEntity({ name: 'Volo', kind: 'npc', summary: 'a spy', source: 'ai' })
    expect(ai.applied).toBe(false)
    expect(ai.detail).toBe('locked by DM edit')
    const rec = (await store.getSnapshot()).records[0]
    expect(rec.locked).toBe(true)
    expect(rec.summary).toBe('a barkeep') // unchanged
    expect(rec.mentions).toBe(2) // still bumped
  })

  it('resolves an upsert by alias (no duplicate record)', async () => {
    const store = getEntityStore('c1')
    await store.upsertEntity({
      name: 'Ama Tilen',
      kind: 'npc',
      summary: 'herbalist',
      aliases: ['the herbalist'],
      source: 'dm'
    })
    await store.upsertEntity({ name: 'the herbalist', kind: 'npc', source: 'ai' })
    expect((await store.getSnapshot()).records).toHaveLength(1)
  })

  it('AI upsert fills only blank fields and union-merges keywords', async () => {
    const store = getEntityStore('c1')
    await store.upsertEntity({ name: 'Brindlemark', kind: 'location', source: 'ai', keywords: ['village'] })
    await store.upsertEntity({
      name: 'Brindlemark',
      kind: 'location',
      source: 'ai',
      summary: 'a fishing village',
      keywords: ['port']
    })
    const rec = (await store.getSnapshot()).records[0]
    expect(rec.summary).toBe('a fishing village') // filled blank
    expect(rec.keywords.sort()).toEqual(['port', 'village']) // union
  })

  it('setConfig persists + getConfig reads through the cache', async () => {
    const store = getEntityStore('c1')
    const cfg = await store.setConfig({ enabled: true, loreMode: 'triggered' })
    expect(cfg).toEqual({ enabled: true, autoExtract: false, loreMode: 'triggered' })
    expect(await store.getConfig()).toEqual(cfg)
  })

  it('deleteEntity by name removes the record', async () => {
    const store = getEntityStore('c1')
    await store.upsertEntity({ name: 'Goblin', kind: 'npc', source: 'ai' })
    expect(await store.deleteEntity('Goblin')).toBe(true)
    expect((await store.getSnapshot()).records).toHaveLength(0)
  })

  it('buildEntityContextBlock reflects stored records for a matching scan', async () => {
    const store = getEntityStore('c1')
    await store.upsertEntity({
      name: 'Ashen Veil',
      kind: 'faction',
      summary: 'a cult',
      injection: 'always',
      source: 'dm'
    })
    const block = await store.buildEntityContextBlock('anything')
    expect(block).toContain('FACTION — Ashen Veil: a cult')
  })
})

describe('PHASE-25 integration (25G)', () => {
  it('record_entity → upsert → DM lock → AI rejected → block reflects DM; lore triggered-mode', async () => {
    _resetEntityStoreCaches()
    // 1. The AI emits record_entity and it validates through the DM-action gate.
    expect(validateDmAction({ action: 'record_entity', kind: 'npc', name: 'Volo', summary: 'a barkeep' }).success).toBe(
      true
    )
    // 2. The IPC boundary parses the payload (source defaults to 'ai').
    const payload = EntityUpsertPayloadSchema.parse({ kind: 'npc', name: 'Volo', summary: 'a barkeep' })
    const store = getEntityStore('intg')
    await store.upsertEntity(payload)
    // 3. A DM edit locks the record; 4. a later AI write is rejected (content unchanged).
    await store.upsertEntity({ kind: 'npc', name: 'Volo', summary: 'a Zhentarim spy', source: 'dm' })
    const reup = await store.upsertEntity({ kind: 'npc', name: 'Volo', summary: 'just a barkeep', source: 'ai' })
    expect(reup.applied).toBe(false)
    // 5. The injected block reflects the DM's authoritative text.
    const block = await store.buildEntityContextBlock('Volo')
    expect(block).toContain('a Zhentarim spy')
    expect(block).not.toContain('just a barkeep')
    // 6. Triggered-mode lore selection over a fabricated transcript: keyword match + constant.
    const lore = [
      { title: 'Ashen Veil', content: 'a cult', keywords: ['veil'] },
      { title: 'Constant Lore', content: 'always present' }
    ]
    const block2 = buildLoreBlock(selectLore(lore, 'triggered', 'the veil rises over the city'))
    expect(block2).toContain('Ashen Veil') // keyword match
    expect(block2).toContain('Constant Lore') // keyword-less ⇒ always included
  })
})
