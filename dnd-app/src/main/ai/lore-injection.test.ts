import { describe, expect, it } from 'vitest'
import { buildLoreBlock, buildScanText, LORE_SCAN_DEPTH, type LoreEntryLike, selectLore } from './lore-injection'

const lore: LoreEntryLike[] = [
  { title: 'The Sundering', content: 'the world cracked apart', category: 'world' }, // constant (no keywords)
  { title: 'Ashen Veil', content: 'a secret cult', category: 'faction', keywords: ['ashen veil', 'the veil', 'cult'] },
  { title: 'Rosewood Chest', content: 'a locked chest', category: 'item', keywords: ['rosewood'] }
]

describe('buildScanText', () => {
  it('joins the last LORE_SCAN_DEPTH messages plus game state', () => {
    const msgs = Array.from({ length: 8 }, (_, i) => ({ role: 'user', content: `m${i}` }))
    const scan = buildScanText(msgs, '[GAME STATE] under attack')
    expect(scan).toContain('m7')
    expect(scan).toContain(`m${8 - LORE_SCAN_DEPTH}`) // m4 included
    expect(scan).not.toContain('m3') // beyond the depth window
    expect(scan).toContain('under attack')
  })
})

describe('selectLore', () => {
  it("'all' mode is identity", () => {
    expect(selectLore(lore, 'all', '')).toEqual(lore)
  })

  it("'triggered' always keeps constant (keyword-less) entries", () => {
    const out = selectLore(lore, 'triggered', 'nothing relevant here')
    expect(out.map((e) => e.title)).toEqual(['The Sundering']) // only the constant entry
  })

  it("'triggered' includes a keyword match (whole-word, case-insensitive)", () => {
    const out = selectLore(lore, 'triggered', 'The CULT of the Ashen Veil approaches')
    expect(out.map((e) => e.title)).toEqual(['The Sundering', 'Ashen Veil'])
  })

  it("'triggered' matches whole words only (no substring false-positives)", () => {
    // "rose" must not trigger the 'rosewood' entry.
    const out = selectLore(lore, 'triggered', 'a single rose lay on the table')
    expect(out.map((e) => e.title)).toEqual(['The Sundering'])
  })

  it('preserves original array order for matched entries', () => {
    const out = selectLore(lore, 'triggered', 'rosewood and cult')
    expect(out.map((e) => e.title)).toEqual(['The Sundering', 'Ashen Veil', 'Rosewood Chest'])
  })
})

describe('buildLoreBlock', () => {
  it('wraps entries in [LORE]…[/LORE] with the byte-identical line format', () => {
    const block = buildLoreBlock([lore[1]])
    expect(block).toBe('[LORE]\n- Ashen Veil [faction]: a secret cult\n[/LORE]')
  })
  it('defaults a missing category to "other"', () => {
    expect(buildLoreBlock([{ title: 'X', content: 'y' }])).toBe('[LORE]\n- X [other]: y\n[/LORE]')
  })
  it('returns empty string for no entries', () => {
    expect(buildLoreBlock([])).toBe('')
  })
})
