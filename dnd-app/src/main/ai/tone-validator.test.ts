import { describe, expect, it } from 'vitest'
import { cleanNarrativeText, detectToneViolations, hasViolations } from './tone-validator'

describe('tone-validator', () => {
  it('detects markdown headers', () => {
    const violations = detectToneViolations('## Scene Setting\nYou enter the cave.')
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].type).toBe('markdown_header')
  })

  it('detects bold text', () => {
    const violations = detectToneViolations('The **dragon** roars.')
    expect(violations.some((v) => v.type === 'bold_text')).toBe(true)
  })

  it('detects bullet lists', () => {
    const violations = detectToneViolations('You see:\n- A sword\n- A shield')
    expect(violations.some((v) => v.type === 'bullet_list')).toBe(true)
  })

  it('detects meta-labels', () => {
    const violations = detectToneViolations('Scene Setting: The tavern is warm.')
    expect(violations.some((v) => v.type === 'meta_label')).toBe(true)
  })

  it('ignores content inside STAT_CHANGES blocks', () => {
    const text = 'You attack.\n[STAT_CHANGES]\n**damage**: 5\n[/STAT_CHANGES]'
    const violations = detectToneViolations(text)
    expect(violations.length).toBe(0)
  })

  it('ignores content inside DM_ACTIONS blocks', () => {
    const text = '[DM_ACTIONS]\n- place_token\n[/DM_ACTIONS]\nThe goblin appears.'
    const violations = detectToneViolations(text)
    expect(violations.length).toBe(0)
  })

  it('cleans markdown headers', () => {
    expect(cleanNarrativeText('## The Cavern Awaits\nYou enter.')).toBe('The Cavern Awaits\nYou enter.')
  })

  it('cleans bold markers', () => {
    expect(cleanNarrativeText('The **dragon** roars.')).toBe('The dragon roars.')
  })

  it('cleans bullet markers', () => {
    expect(cleanNarrativeText('- A sword\n- A shield')).toBe('A sword\nA shield')
  })

  it('preserves JSON blocks during cleaning', () => {
    const text = 'Attack.\n[STAT_CHANGES]\n{"type":"damage"}\n[/STAT_CHANGES]'
    const cleaned = cleanNarrativeText(text)
    expect(cleaned).toContain('[STAT_CHANGES]')
    expect(cleaned).toContain('{"type":"damage"}')
  })

  it('reports no violations for clean prose', () => {
    const text =
      'You step through the ancient doorway. Cold air washes over your skin, carrying the scent of damp stone and something metallic. The corridor stretches ahead, torchlight dancing across carved walls that tell stories older than memory.'
    expect(hasViolations(text)).toBe(false)
  })
})
