import { describe, expect, it } from 'vitest'
import { parseSeedPack, SeedPackSchema } from './seed-pack-schema'

function validPack(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'dnd-vtt-seed-pack',
    formatVersion: 1,
    id: 'test-pack',
    name: 'Test Pack',
    description: 'A test',
    lore: [{ id: 'l1', title: 'World', content: 'Lore', category: 'world', keywords: ['mere'] }],
    npcs: [{ id: 'n1', name: 'Bob', description: 'A guy', role: 'ally' }],
    adventures: [{ id: 'a1', title: 'Arc One' }],
    quests: [{ name: 'Find the thing', objectives: ['Search the fen'] }],
    encounterTables: [
      {
        id: 't1',
        name: 'Travel',
        diceFormula: '1d8',
        entries: [
          { min: 1, max: 4, text: 'a' },
          { min: 5, max: 8, text: 'b' }
        ]
      }
    ],
    customRules: [{ id: 'r1', name: 'Gritty rests', description: 'x', category: 'rest' }],
    toneInstructions: 'Dread-forward but hopeful.',
    openingScene: { readAloud: 'You wake to fog.' },
    ...over
  }
}

describe('seed-pack-schema (PHASE-37 37A)', () => {
  it('a full valid pack parses', () => {
    const r = parseSeedPack(validPack())
    expect(r.ok).toBe(true)
  })

  it('rejects a non-pack (missing/wrong format) with a clear message', () => {
    expect(parseSeedPack({ name: 'x' })).toEqual({ ok: false, error: 'This file is not a seed pack.' })
    expect(parseSeedPack(null).ok).toBe(false)
  })

  it('rejects a newer formatVersion with the upgrade message', () => {
    const r = parseSeedPack(validPack({ formatVersion: 2 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/newer app version/i)
  })

  it('reports a field-level error (missing name)', () => {
    const p = validPack()
    delete p.name
    const r = parseSeedPack(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name/i)
  })

  it('preserves unknown top-level + per-entry fields (loose object)', () => {
    const r = parseSeedPack(
      validPack({
        customTopLevel: 42,
        lore: [{ id: 'l1', title: 'T', content: 'C', category: 'world', homebrewFlag: true }]
      })
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.pack as Record<string, unknown>).customTopLevel).toBe(42)
      expect((r.pack.lore?.[0] as Record<string, unknown>).homebrewFlag).toBe(true)
    }
  })

  it('rejects a roll-table entry with min > max', () => {
    const r = parseSeedPack(
      validPack({
        encounterTables: [{ id: 't1', name: 'T', diceFormula: '1d6', entries: [{ min: 5, max: 2, text: 'x' }] }]
      })
    )
    expect(r.ok).toBe(false)
  })

  it('enforces the objectives cap (max 8)', () => {
    const r = SeedPackSchema.safeParse(
      validPack({ quests: [{ name: 'Q', objectives: Array.from({ length: 9 }, (_, i) => `o${i}`) }] })
    )
    expect(r.success).toBe(false)
  })

  it('applies defaults (description, quest objectives) on parse', () => {
    const r = parseSeedPack(validPack({ description: undefined, quests: [{ name: 'Q' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.pack.description).toBe('')
      expect(r.pack.quests?.[0].objectives).toEqual([])
      expect(r.pack.quests?.[0].chapterQuest).toBe(false)
    }
  })
})
