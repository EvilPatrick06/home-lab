import { describe, expect, it } from 'vitest'
import {
  parseRuleCitations,
  parseRulings,
  parseVoiceTags,
  stripRuleCitations,
  stripRulings,
  stripVoiceTags
} from './ai-response-parser'

describe('parseRuleCitations', () => {
  it('returns empty array when no citations', () => {
    expect(parseRuleCitations('Just narrative text')).toEqual([])
  })

  it('parses a single rule citation', () => {
    const text =
      'Some text [RULE_CITATION source="PHB" rule="Fireball"]A 3rd-level evocation spell.[/RULE_CITATION] more text'
    const result = parseRuleCitations(text)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      source: 'PHB',
      rule: 'Fireball',
      text: 'A 3rd-level evocation spell.'
    })
  })

  it('parses multiple rule citations', () => {
    const text = `
[RULE_CITATION source="PHB" rule="Fireball"]Fire damage.[/RULE_CITATION]
[RULE_CITATION source="DMG" rule="Cover"]Half cover grants +2 AC.[/RULE_CITATION]
    `
    const result = parseRuleCitations(text)
    expect(result).toHaveLength(2)
    expect(result[0].source).toBe('PHB')
    expect(result[1].source).toBe('DMG')
  })

  it('trims citation text whitespace', () => {
    const text = '[RULE_CITATION source="PHB" rule="Test"]  Some text with spaces  [/RULE_CITATION]'
    const result = parseRuleCitations(text)
    expect(result[0].text).toBe('Some text with spaces')
  })
})

describe('stripRuleCitations', () => {
  it('removes rule citation blocks', () => {
    const text = 'Before. [RULE_CITATION source="PHB" rule="X"]citation text[/RULE_CITATION] After.'
    const result = stripRuleCitations(text)
    expect(result).toBe('Before.After.')
  })

  it('returns original text when no citations', () => {
    expect(stripRuleCitations('Hello world')).toBe('Hello world')
  })

  it('handles multiple citation blocks', () => {
    const text =
      'A [RULE_CITATION source="PHB" rule="X"]x[/RULE_CITATION] B [RULE_CITATION source="DMG" rule="Y"]y[/RULE_CITATION] C'
    const result = stripRuleCitations(text)
    expect(result).not.toContain('RULE_CITATION')
  })
})

// ── Voice tags (DM-BMO per-character tone/pitch; stripped from chat) ──
describe('parseVoiceTags / stripVoiceTags', () => {
  it('extracts the NPC archetype + emotion (case-insensitive, first match wins)', () => {
    const r = parseVoiceTags('[NPC:Gruff_Dwarf][EMOTION:Angry] "Ye shall not pass!"')
    expect(r).toEqual({ npc: 'gruff_dwarf', emotion: 'angry' })
  })

  it('returns undefined fields when no tags are present', () => {
    expect(parseVoiceTags('Just plain narration.')).toEqual({ npc: undefined, emotion: undefined })
  })

  it('strips the tags from the chat text but keeps the prose + newlines', () => {
    const out = stripVoiceTags('[NPC:mysterious_elf] The elf whispers.\n\nA second line.')
    expect(out).not.toContain('[NPC:')
    expect(out).toContain('The elf whispers.')
    expect(out).toContain('\n\nA second line.') // paragraph break preserved
  })

  it('leaves text without tags unchanged (aside from trim)', () => {
    expect(stripVoiceTags('No tags here.')).toBe('No tags here.')
  })
})

// ── House-rulings (persist to the rulings ledger; stripped from chat) ──
describe('parseRulings / stripRulings', () => {
  it('extracts question, ruling body, and optional citation', () => {
    const text =
      'You can do that.\n[RULING question="Shove off a ledge?" citation="DMG p.272"]Yes — treat as a Shove, then falling damage.[/RULING]'
    expect(parseRulings(text)).toEqual([
      { question: 'Shove off a ledge?', ruling: 'Yes — treat as a Shove, then falling damage.', citation: 'DMG p.272' }
    ])
  })

  it('treats citation as empty string when omitted', () => {
    const r = parseRulings('[RULING question="Crit on a natural 19?"]No, only natural 20 crits here.[/RULING]')
    expect(r).toHaveLength(1)
    expect(r[0].citation).toBe('')
    expect(r[0].ruling).toBe('No, only natural 20 crits here.')
  })

  it('parses multiple rulings and skips ones with an empty question or body', () => {
    const text =
      '[RULING question="A?"]first[/RULING] mid [RULING question=""]no question[/RULING] [RULING question="B?"]   [/RULING] [RULING question="C?"]third[/RULING]'
    const r = parseRulings(text)
    expect(r.map((x) => x.question)).toEqual(['A?', 'C?'])
  })

  it('returns [] when there are no ruling tags', () => {
    expect(parseRulings('Just narrative.')).toEqual([])
  })

  it('strips ruling blocks from chat text but keeps surrounding prose', () => {
    const out = stripRulings('Before. [RULING question="Q?"]A ruling.[/RULING] After.')
    expect(out).not.toContain('[RULING')
    expect(out).toContain('Before.')
    expect(out).toContain('After.')
  })
})
