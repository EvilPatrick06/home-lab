import { describe, expect, it } from 'vitest'
import { buildSafetyConstraintsSection, extractSafetyInput, scanForLineHits } from './safety-constraints'

describe('safety-constraints (PHASE-32 32B)', () => {
  it('returns an empty block when nothing is configured (inert by default)', () => {
    expect(buildSafetyConstraintsSection({ lines: [], veils: [], banList: [] })).toBe('')
  })

  it('renders only the Lines subsection when only lines are set', () => {
    const out = buildSafetyConstraintsSection({ lines: ['Torture'], veils: [], banList: [] })
    expect(out).toContain('[SAFETY CONSTRAINTS]')
    expect(out).toContain('- Torture')
    expect(out).toMatch(/override any player request/i)
    expect(out).not.toMatch(/Veils \(/)
    expect(out).not.toMatch(/Banned by the table/)
    expect(out).toContain('[/SAFETY CONSTRAINTS]')
  })

  it('merges legacy contentLimits into lines, case-insensitive dedupe', () => {
    const input = extractSafetyInput({
      sessionZero: { lines: ['Torture'], contentLimits: ['torture', 'Spiders/insects'], veils: ['Romance'] },
      aiBanList: [{ topic: 'Slavery' }, { topic: 'slavery' }]
    })
    expect(input.lines).toEqual(['Torture', 'Spiders/insects']) // 'torture' deduped against 'Torture'
    expect(input.veils).toEqual(['Romance'])
    expect(input.banList).toEqual(['Slavery'])
  })

  it('renders the ban list under the banned-during-play heading', () => {
    const out = buildSafetyConstraintsSection({ lines: [], veils: [], banList: ['Spiders'] })
    expect(out).toMatch(/Banned by the table during play/)
    expect(out).toContain('- Spiders')
  })

  it('scanForLineHits flags a line keyword, misses unrelated text, and ignores structured blocks', () => {
    const input: { lines: string[]; veils: string[]; banList: string[] } = {
      lines: ['Torture', 'Spiders/insects'],
      veils: ['Romance'],
      banList: ['Slavery']
    }
    expect(scanForLineHits('The torturer grins as he works.', input)).toContain('Torture')
    expect(scanForLineHits('A pleasant walk in the meadow.', input)).toEqual([])
    // A keyword that only appears inside a structured block must NOT hit.
    expect(scanForLineHits('All clear here.\n[STAT_CHANGES]\nthe spiders attack\n[/STAT_CHANGES]', input)).toEqual([])
    // Veils are never scanned.
    expect(scanForLineHits('A tender romance blossomed.', input)).not.toContain('Romance')
  })
})
