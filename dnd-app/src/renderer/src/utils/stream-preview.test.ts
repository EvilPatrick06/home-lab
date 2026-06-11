import { describe, expect, it } from 'vitest'
import { sanitizeStreamPreview } from './stream-preview'

describe('sanitizeStreamPreview (PHASE-10 10D)', () => {
  it('passes plain narration through unchanged', () => {
    const s = 'The goblin snarls and raises its scimitar.'
    expect(sanitizeStreamPreview(s)).toBe(s)
  })

  it('cuts a complete [STAT_CHANGES] block', () => {
    const s = 'You take 5 damage. [STAT_CHANGES]{"hp":-5}[/STAT_CHANGES]'
    expect(sanitizeStreamPreview(s)).toBe('You take 5 damage. ')
    expect(sanitizeStreamPreview(s)).not.toContain('STAT_CHANGES')
  })

  it('trims a mid-stream partial marker', () => {
    const s = 'The dragon roars [STAT_CH'
    expect(sanitizeStreamPreview(s)).toBe('The dragon roars ')
    expect(sanitizeStreamPreview(s)).not.toContain('[STAT_CH')
  })

  it('cuts at [DM_ACTIONS]', () => {
    expect(sanitizeStreamPreview('Combat begins! [DM_ACTIONS]{}[/DM_ACTIONS]')).toBe('Combat begins! ')
  })

  it('cuts at [RULE_CITATION', () => {
    expect(sanitizeStreamPreview('Per the rules [RULE_CITATION source="PHB" rule="x"]…')).toBe('Per the rules ')
  })

  it('cuts at [RULING', () => {
    expect(sanitizeStreamPreview('I rule that [RULING question="?"]…')).toBe('I rule that ')
  })

  it('strips voice tags and collapses the leftover spacing', () => {
    const out = sanitizeStreamPreview('[NPC: gruff_merchant] [EMOTION: angry] Get out of my shop!')
    expect(out).not.toContain('[NPC:')
    expect(out).not.toContain('[EMOTION:')
    expect(out).toContain('Get out of my shop!')
    expect(out).not.toMatch(/ {2,}/)
  })

  it('cuts at the EARLIEST marker when several appear', () => {
    const s = 'Story. [DM_ACTIONS]{}[/DM_ACTIONS] more [STAT_CHANGES]{}[/STAT_CHANGES]'
    expect(sanitizeStreamPreview(s)).toBe('Story. ')
  })

  it('never leaks a machine substring for any split point of a tagged response', () => {
    const full = 'Narration text here. [STAT_CHANGES]{"hp":-3}[/STAT_CHANGES][DM_ACTIONS]{}[/DM_ACTIONS]'
    for (let i = 0; i <= full.length; i++) {
      const out = sanitizeStreamPreview(full.slice(0, i))
      for (const bad of ['[STAT_CHANGES', '[DM_ACTIONS', '[RULE_CITATION', '[RULING', '[NPC:', '[EMOTION:']) {
        expect(out.includes(bad), `split@${i}: ${JSON.stringify(out)}`).toBe(false)
      }
    }
  })

  it('handles empty input', () => {
    expect(sanitizeStreamPreview('')).toBe('')
  })
})
