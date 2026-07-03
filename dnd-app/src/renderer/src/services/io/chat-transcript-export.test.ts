import { describe, expect, it } from 'vitest'
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
