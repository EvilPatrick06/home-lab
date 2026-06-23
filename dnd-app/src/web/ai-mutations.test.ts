import { describe, expect, it } from 'vitest'
import { parseAiMutations } from './ai-mutations'

describe('parseAiMutations', () => {
  it('harvests valid STAT_CHANGES and strips the tag from display text', () => {
    const text =
      'The arrow bites deep. [STAT_CHANGES]{"changes":[{"type":"damage","characterName":"Aria","value":5,"reason":"goblin arrow"}]}[/STAT_CHANGES]'
    const { statChanges, dmActions, displayText } = parseAiMutations(text)
    expect(statChanges).toHaveLength(1)
    expect(statChanges[0]).toMatchObject({ type: 'damage', characterName: 'Aria', value: 5 })
    expect(dmActions).toHaveLength(0)
    expect(displayText).toBe('The arrow bites deep.')
    expect(displayText).not.toContain('STAT_CHANGES')
  })

  it('harvests multiple change types across blocks', () => {
    const text =
      'A [STAT_CHANGES]{"changes":[{"type":"heal","value":3,"reason":"potion"}]}[/STAT_CHANGES] B ' +
      '[STAT_CHANGES]{"changes":[{"type":"add_condition","name":"poisoned","reason":"venom"}]}[/STAT_CHANGES]'
    const { statChanges } = parseAiMutations(text)
    expect(statChanges).toHaveLength(2)
    expect((statChanges as Array<{ type: string }>).map((c) => c.type)).toEqual(['heal', 'add_condition'])
  })

  it('parses DM_ACTIONS blocks', () => {
    const text = 'Roll for it. [DM_ACTIONS]{"actions":[{"action":"start_initiative","entries":[]}]}[/DM_ACTIONS]'
    const { dmActions, displayText } = parseAiMutations(text)
    expect(dmActions.some((a) => a.action === 'start_initiative')).toBe(true)
    expect(displayText).toBe('Roll for it.')
  })

  it('drops malformed blocks but keeps the prose', () => {
    const text = 'Something happens. [STAT_CHANGES]{not valid json}[/STAT_CHANGES]'
    const { statChanges, displayText } = parseAiMutations(text)
    expect(statChanges).toHaveLength(0)
    expect(displayText).toBe('Something happens.')
  })

  it('returns empty arrays and original text when no tags present', () => {
    const { statChanges, dmActions, displayText } = parseAiMutations('Just narration.')
    expect(statChanges).toHaveLength(0)
    expect(dmActions).toHaveLength(0)
    expect(displayText).toBe('Just narration.')
  })
})
