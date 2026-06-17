import { beforeEach, describe, expect, it, vi } from 'vitest'

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
let uuidN = 0
vi.stubGlobal('crypto', { randomUUID: () => `uuid-${uuidN++}` })

import { WorldDeltaSchema } from '../../shared/ipc-schemas'
import { _resetWorldStateStoreCaches, getWorldStateStore, slugifyId, WorldStoreSchema } from './world-state-store'

const DIR = '/tmp/test/campaigns/c1/ai-context'

beforeEach(() => {
  mockState.files.clear()
  vi.clearAllMocks()
  _resetWorldStateStoreCaches()
  uuidN = 0
})

describe('WorldStoreSchema', () => {
  it('applies defaults', () => {
    const s = WorldStoreSchema.parse({ version: 1, updatedAt: 't' })
    expect(s.enabled).toBe(false)
    expect(s.locations).toEqual([])
    expect(s.partyLocationId).toBeNull()
  })
})

describe('slugifyId', () => {
  it('matches the npc slug derivation', () => {
    expect(slugifyId('Market Row')).toBe('market-row')
    expect(slugifyId("  Smugglers' Tunnel!! ")).toBe('smugglers-tunnel')
  })
})

describe('WorldStateStore', () => {
  it('corrupt file → empty store (no throw)', async () => {
    mockState.files.set(`${DIR}/world-store.json`, 'not json{{{')
    const snap = await getWorldStateStore('c1').getSnapshot()
    expect(snap.locations).toEqual([])
    expect(snap.enabled).toBe(false)
  })

  it('serializes 10 concurrent recordFact → exactly 10 facts', async () => {
    const store = getWorldStateStore('c1')
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.recordFact(`fact ${i}`)))
    expect((await store.getSnapshot()).facts).toHaveLength(10)
  })

  it('dedupes facts case-insensitively', async () => {
    const store = getWorldStateStore('c1')
    await store.recordFact('The bridge is out')
    const r = await store.recordFact('the BRIDGE is out')
    expect(r.applied).toBe(false)
    expect((await store.getSnapshot()).facts).toHaveLength(1)
  })

  it('FIFO-evicts facts past the cap (200)', async () => {
    const store = getWorldStateStore('c1')
    for (let i = 0; i < 205; i++) await store.recordFact(`fact ${i}`)
    const facts = (await store.getSnapshot()).facts
    expect(facts).toHaveLength(200)
    expect(facts[0].text).toBe('fact 5') // first 5 evicted
  })

  it('clamps opinion to [-100, 100]; score wins over delta', async () => {
    const store = getWorldStateStore('c1')
    await store.setNpcOpinion({ npcName: 'Ama', characterName: 'Brovic', score: 200 })
    let npc = (await store.getSnapshot()).npcs.find((n) => n.name === 'Ama')
    expect(npc?.opinions[0].score).toBe(100)
    await store.setNpcOpinion({ npcName: 'Ama', characterName: 'Brovic', delta: -300, score: 50 })
    npc = (await store.getSnapshot()).npcs.find((n) => n.name === 'Ama')
    expect(npc?.opinions[0].score).toBe(50) // score overrides delta
  })

  it('discoverLocation is idempotent by case-insensitive name', async () => {
    const store = getWorldStateStore('c1')
    await store.discoverLocation({ name: 'Market Row' })
    await store.discoverLocation({ name: 'market row', type: 'market' })
    const locs = (await store.getSnapshot()).locations
    expect(locs).toHaveLength(1)
    expect(locs[0].type).toBe('market')
  })

  it('movePartyTo auto-stubs an unknown destination, marks visited, links from previous', async () => {
    const store = getWorldStateStore('c1')
    await store.movePartyTo('Tavern')
    await store.movePartyTo('Cellar') // unknown → auto-stub + link from Tavern
    const snap = await store.getSnapshot()
    expect(snap.partyLocationId).toBe(slugifyId('Cellar'))
    const cellar = snap.locations.find((l) => l.id === slugifyId('Cellar'))
    expect(cellar?.visited).toBe(true)
    expect(cellar?.exits.some((e) => e.toLocationId === slugifyId('Tavern'))).toBe(true)
  })

  it('linkLocations is bidirectional + idempotent', async () => {
    const store = getWorldStateStore('c1')
    await store.linkLocations('A', 'B', 'door')
    await store.linkLocations('B', 'A') // idempotent
    const snap = await store.getSnapshot()
    const a = snap.locations.find((l) => l.id === 'a')
    const b = snap.locations.find((l) => l.id === 'b')
    expect(a?.exits).toHaveLength(1)
    expect(b?.exits).toHaveLength(1)
  })

  it('setEnabled persists + isEnabled reflects it', async () => {
    const store = getWorldStateStore('c1')
    await store.setEnabled(true)
    expect(await store.isEnabled()).toBe(true)
  })

  it('seedFromLegacy seeds NPCs + party location from the legacy files', async () => {
    mockState.files.set(`${DIR}/npc-personalities.json`, JSON.stringify([{ name: 'Ama', location: 'Tavern' }]))
    mockState.files.set(`${DIR}/world-state-summary.json`, JSON.stringify({ currentLocation: 'Brindlemark' }))
    const snap = await getWorldStateStore('c1').getSnapshot()
    expect(snap.npcs.find((n) => n.name === 'Ama')?.locationId).toBe('tavern')
    expect(snap.partyLocationId).toBe('brindlemark')
    expect(snap.locations.find((l) => l.id === 'brindlemark')?.visited).toBe(true)
  })

  it('seedFromLegacy is a no-op when legacy files are absent', async () => {
    const snap = await getWorldStateStore('c1').getSnapshot()
    expect(snap.npcs).toEqual([])
    expect(snap.partyLocationId).toBeNull()
  })

  it('buildContextBlock renders party location, exits, NPC opinions, facts', async () => {
    const store = getWorldStateStore('c1')
    await store.discoverLocation({ name: 'Market Row' })
    await store.movePartyTo('Tavern')
    await store.linkLocations('Tavern', 'Market Row', 'north gate')
    await store.setNpcLocation('Ama', 'Tavern')
    await store.setNpcOpinion({ npcName: 'Ama', characterName: 'Brovic', score: 40, summary: 'grateful' })
    await store.recordFact('The Zhentarim watch the docks')
    const block = await store.buildContextBlock()
    expect(block).toContain('[WORLD STATE]')
    expect(block).toContain('Party location: Tavern')
    expect(block).toContain('north gate → Market Row')
    expect(block).toContain('NPC here: Ama')
    expect(block).toContain('opinion of Brovic: +40 (grateful)')
    expect(block).toContain('The Zhentarim watch the docks')
    expect(block).toContain('[/WORLD STATE]')
  })

  it('buildContextBlock is empty for a fresh store', async () => {
    expect(await getWorldStateStore('c1').buildContextBlock()).toBe('')
  })
})

describe('PHASE-27 integration (27H)', () => {
  it('full delta path: validate → apply → snapshot + context block reflect all', async () => {
    _resetWorldStateStoreCaches()
    const store = getWorldStateStore('intg')
    // The handler path: each delta is WorldDeltaSchema-validated, then applied via a store mutator.
    expect(WorldDeltaSchema.parse({ op: 'discover_location', name: 'Market Row', type: 'market' }).op).toBe(
      'discover_location'
    )
    await store.discoverLocation({ name: 'Market Row', type: 'market' })
    expect(WorldDeltaSchema.parse({ op: 'move_party', locationName: 'Tavern' }).op).toBe('move_party')
    await store.movePartyTo('Tavern')
    WorldDeltaSchema.parse({
      op: 'set_npc_opinion',
      npcName: 'Ama',
      characterName: 'Brovic',
      score: 40,
      summary: 'grateful'
    })
    await store.setNpcLocation('Ama', 'Tavern')
    await store.setNpcOpinion({ npcName: 'Ama', characterName: 'Brovic', score: 40, summary: 'grateful' })
    WorldDeltaSchema.parse({ op: 'record_fact', text: 'The Zhentarim watch the docks' })
    await store.recordFact('The Zhentarim watch the docks')

    const snap = await store.getSnapshot()
    expect(snap.partyLocationId).toBe(slugifyId('Tavern'))
    expect(snap.locations.some((l) => l.id === slugifyId('Market Row'))).toBe(true)
    expect(snap.npcs.find((n) => n.name === 'Ama')?.opinions[0].score).toBe(40)
    expect(snap.facts.some((f) => f.text.includes('Zhentarim'))).toBe(true)

    const block = await store.buildContextBlock()
    expect(block).toContain('Party location: Tavern')
    expect(block).toContain('opinion of Brovic: +40')
    expect(block).toContain('Zhentarim')
  })

  it('WorldDeltaSchema rejects malformed deltas', () => {
    expect(WorldDeltaSchema.safeParse({ op: 'move_party' }).success).toBe(false) // missing locationName
    expect(
      WorldDeltaSchema.safeParse({ op: 'set_npc_opinion', npcName: 'X', characterName: 'Y', score: 200 }).success
    ).toBe(false) // out of range
    expect(WorldDeltaSchema.safeParse({ op: 'unknown_op' }).success).toBe(false)
  })
})
