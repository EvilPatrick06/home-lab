import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SeedPackSchema } from './seed-pack-schema'

vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const PACK_DIR = resolve(__dirname, '../../../public/data/5e/seed-packs')
const MONSTERS = resolve(__dirname, '../../../public/data/5e/dm/npcs/monsters.json')

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(resolve(PACK_DIR, file), 'utf-8'))
}

const index = readJson('index.json') as { packs: Array<{ id: string; file: string }> }
const monsterIds = new Set((JSON.parse(readFileSync(MONSTERS, 'utf-8')) as Array<{ id: string }>).map((m) => m.id))

describe('built-in seed packs (PHASE-37 37C)', () => {
  it('index is well-formed: files exist, bare filenames, ids match + unique', () => {
    expect(index.packs.length).toBe(3)
    const ids = new Set<string>()
    for (const entry of index.packs) {
      expect(entry.file.includes('/')).toBe(false)
      const pack = readJson(entry.file) as { id: string }
      expect(pack.id).toBe(entry.id) // index id matches pack id
      expect(ids.has(entry.id)).toBe(false)
      ids.add(entry.id)
    }
  })

  for (const entry of (readJson('index.json') as { packs: Array<{ id: string; file: string }> }).packs) {
    describe(entry.id, () => {
      const raw = readJson(entry.file)

      it('validates against SeedPackSchema', () => {
        const r = SeedPackSchema.safeParse(raw)
        expect(r.success).toBe(true)
      })

      it('every monsterId/statBlockId exists in the monster index', () => {
        const pack = SeedPackSchema.parse(raw)
        for (const npc of pack.npcs ?? []) {
          if (npc.statBlockId)
            expect(monsterIds.has(npc.statBlockId), `npc ${npc.name} → ${npc.statBlockId}`).toBe(true)
        }
        for (const enc of pack.encounters ?? []) {
          for (const m of enc.monsters) expect(monsterIds.has(m.monsterId), m.monsterId).toBe(true)
        }
      })

      it('encounter tables have contiguous, gap-free bands from 1 to the die max', () => {
        const pack = SeedPackSchema.parse(raw)
        for (const table of pack.encounterTables ?? []) {
          const dieMax = Number.parseInt(table.diceFormula.match(/d(\d+)/)?.[1] ?? '0', 10)
          expect(dieMax).toBeGreaterThan(0)
          const sorted = [...table.entries].sort((a, b) => a.min - b.min)
          expect(sorted[0].min).toBe(1)
          expect(sorted[sorted.length - 1].max).toBe(dieMax)
          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].min).toBe(sorted[i - 1].max + 1) // no gap, no overlap
          }
        }
      })

      it('meets the content bar', () => {
        const pack = SeedPackSchema.parse(raw)
        expect((pack.lore ?? []).length).toBeGreaterThanOrEqual(6)
        expect((pack.npcs ?? []).length).toBeGreaterThanOrEqual(5)
        expect((pack.quests ?? []).length).toBeGreaterThanOrEqual(3)
        expect((pack.quests ?? []).filter((q) => q.chapterQuest).length).toBe(1) // exactly one
        expect((pack.encounterTables ?? []).length).toBeGreaterThanOrEqual(2)
        expect(pack.toneInstructions?.trim()).toBeTruthy()
        expect(pack.openingScene?.readAloud.trim()).toBeTruthy()
      })
    })
  }
})

describe('loadBuiltInSeedPacks (PHASE-37 37C)', () => {
  it('returns the valid packs and skips an invalid one', async () => {
    vi.resetModules()
    vi.doMock('../data-provider', () => ({
      loadJson: vi.fn(async (path: string) => {
        if (path.endsWith('index.json')) {
          return { packs: [...index.packs, { id: 'bad', file: 'bad.json' }] }
        }
        if (path.endsWith('bad.json')) return { format: 'nope' } // invalid → skipped
        const file = path.split('/').pop() as string
        return readJson(file)
      })
    }))
    const { loadBuiltInSeedPacks } = await import('./built-in-packs')
    const packs = await loadBuiltInSeedPacks()
    expect(packs.map((p) => p.id).sort()).toEqual(['hollowmere', 'ivory-court', 'sunderspire-frontier'])
  })
})
