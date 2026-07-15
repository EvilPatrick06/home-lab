import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../stores/use-lobby-store'
import { exportChatTranscriptJSON, exportChatTranscriptMarkdown } from './chat-transcript-export'

const base: ChatMessage = {
  id: '1',
  senderId: 'p1',
  senderName: 'Gavin',
  content: 'I open the door.',
  timestamp: new Date('2026-07-03T14:05:00Z').getTime(),
  isSystem: false
}

describe('chat-transcript-export', () => {
  it('titles the session with the LOCAL calendar date, not the UTC date', () => {
    // Evening-west-of-UTC case: 2026-07-14 20:30 EST is 2026-07-15 01:30 UTC.
    // vitest.config sets TZ=America/New_York for the suite via the mocked clock below.
    const prevTz = process.env.TZ
    process.env.TZ = 'America/New_York' // node (Linux) picks this up at runtime
    const vi_now = new Date(2026, 6, 14, 20, 30, 0) // local 2026-07-14 20:30
    const { useFakeTimers, setSystemTime, useRealTimers } = vi
    useFakeTimers()
    setSystemTime(vi_now)
    try {
      const md = exportChatTranscriptMarkdown([base])
      const expected = '# Session — 2026-07-14'
      expect(md.split('\n')[0]).toBe(expected)
      // Regression guard: whenever local date differs from the UTC date, the
      // header must follow the local one.
      const utcDate = vi_now.toISOString().slice(0, 10)
      if (utcDate !== '2026-07-14') {
        expect(md).not.toContain(utcDate)
      }
    } finally {
      useRealTimers()
      if (prevTz === undefined) delete process.env.TZ
      else process.env.TZ = prevTz
    }
  })

  it('returns a placeholder heading when there are no messages', () => {
    const md = exportChatTranscriptMarkdown([])
    expect(md).toContain('# Session —')
    expect(md).toContain('No chat messages')
  })

  it('renders a speaker line for a normal message', () => {
    const md = exportChatTranscriptMarkdown([base])
    expect(md).toContain('**Gavin**')
    expect(md).toContain('I open the door.')
  })

  it('labels AI-DM messages as the Dungeon Master', () => {
    const md = exportChatTranscriptMarkdown([{ ...base, senderId: 'ai-dm', content: 'The door creaks.' }])
    expect(md).toContain('Dungeon Master (AI)')
    expect(md).toContain('The door creaks.')
  })

  it('renders dice rolls inline', () => {
    const roll: ChatMessage = {
      ...base,
      isDiceRoll: true,
      diceResult: { formula: '1d20+5', total: 23, rolls: [18] }
    }
    const md = exportChatTranscriptMarkdown([roll])
    expect(md).toContain('1d20+5')
    expect(md).toContain('23')
  })

  it('renders system messages as italic notes and can omit them', () => {
    const sys: ChatMessage = { ...base, isSystem: true, senderId: 'system', content: 'Gavin joined.' }
    const withSys = exportChatTranscriptMarkdown([base, sys])
    expect(withSys).toContain('Gavin joined.')
    const withoutSys = exportChatTranscriptMarkdown([base, sys], { includeSystem: false })
    expect(withoutSys).not.toContain('Gavin joined.')
  })

  it('exports JSON honoring includeSystem', () => {
    const sys: ChatMessage = { ...base, isSystem: true, senderId: 'system', content: 'Gavin joined.' }
    const json = exportChatTranscriptJSON([base, sys], { includeSystem: false })
    const parsed = JSON.parse(json) as ChatMessage[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].content).toBe('I open the door.')
  })
})
