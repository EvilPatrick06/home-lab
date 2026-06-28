import { describe, expect, it } from 'vitest'
import { buildSessionStartRecapPrompt, recapInputsEmpty, type SessionStartRecapInputs } from './recap-context'

const EMPTY: SessionStartRecapInputs = {
  conversationSummaries: [],
  latestSessionLog: '',
  worldSummary: null,
  journalRecaps: []
}

describe('recap-context (PHASE-31 31B)', () => {
  it('recapInputsEmpty is true only when every input is empty', () => {
    expect(recapInputsEmpty(EMPTY)).toBe(true)
    expect(recapInputsEmpty({ ...EMPTY, conversationSummaries: ['x'] })).toBe(false)
    expect(recapInputsEmpty({ ...EMPTY, latestSessionLog: 'log' })).toBe(false)
    expect(recapInputsEmpty({ ...EMPTY, journalRecaps: [{ title: 't', content: 'c' }] })).toBe(false)
    expect(
      recapInputsEmpty({
        ...EMPTY,
        worldSummary: {
          currentLocation: 'X',
          timeOfDay: 'noon',
          activeQuests: ['q'],
          recentEvents: [],
          lastUpdated: 't'
        }
      })
    ).toBe(false)
    // A world summary with only a location (no quests/events) still counts as empty.
    expect(
      recapInputsEmpty({
        ...EMPTY,
        worldSummary: { currentLocation: 'X', timeOfDay: 'noon', activeQuests: [], recentEvents: [], lastUpdated: 't' }
      })
    ).toBe(true)
  })

  it('labels only the blocks that have content', () => {
    const { user } = buildSessionStartRecapPrompt({
      conversationSummaries: ['party met the duke'],
      latestSessionLog: '',
      worldSummary: {
        currentLocation: 'Neverwinter',
        timeOfDay: 'dusk',
        activeQuests: ['Find the relic'],
        recentEvents: ['Bridge collapsed'],
        lastUpdated: 't'
      },
      journalRecaps: []
    })
    expect(user).toContain('[CONVERSATION SUMMARIES]')
    expect(user).toContain('party met the duke')
    expect(user).toContain('[WORLD SUMMARY]')
    expect(user).toContain('Neverwinter')
    expect(user).toContain('Find the relic')
    expect(user).not.toContain('[LAST SESSION LOG]')
    expect(user).not.toContain('[SAVED RECAPS]')
  })

  it('system prompt enforces the grounded, no-mechanics "Previously on" voice', () => {
    const { system } = buildSessionStartRecapPrompt(EMPTY)
    expect(system).toContain('Previously on')
    expect(system).toMatch(/ONLY on the records/i)
    expect(system).toMatch(/never invent/i)
  })

  it('caps a giant block to the per-block token budget', () => {
    const huge = 'word '.repeat(20000) // ~25k tokens unbounded
    const { user } = buildSessionStartRecapPrompt({ ...EMPTY, latestSessionLog: huge })
    // 1 token ≈ 4 chars; 1500-token cap ⇒ well under the raw length.
    expect(user.length).toBeLessThan(huge.length)
  })
})
