import { describe, expect, it } from 'vitest'
import { SCENE_PREP_PROMPT } from '../../shared/constants'
import { buildScenePrepMessage, DEFAULT_SCENE_PREP_MESSAGE } from './scene-prep-message'

describe('scene-prep-message (PHASE-37 37D)', () => {
  it('the default is byte-identical to the legacy SCENE_PREP_PROMPT', () => {
    expect(DEFAULT_SCENE_PREP_MESSAGE).toBe(SCENE_PREP_PROMPT)
  })

  it('falls back to the default for undefined / {} / non-string readAloud', () => {
    expect(buildScenePrepMessage(undefined)).toBe(SCENE_PREP_PROMPT)
    expect(buildScenePrepMessage({})).toBe(SCENE_PREP_PROMPT)
    expect(buildScenePrepMessage({ readAloud: 123 })).toBe(SCENE_PREP_PROMPT)
    expect(buildScenePrepMessage({ readAloud: '   ' })).toBe(SCENE_PREP_PROMPT)
  })

  it('builds a seeded message with title, readAloud, dmNotes + the verbatim prohibition', () => {
    const msg = buildScenePrepMessage({
      title: 'The Reed Road',
      readAloud: 'The mere opens before you.',
      dmNotes: 'The bell is the chapel.'
    })
    expect(msg).toContain('The Reed Road')
    expect(msg).toContain('The mere opens before you.')
    expect(msg).toContain('The bell is the chapel.')
    expect(msg).toMatch(/do NOT read it verbatim/i)
    expect(msg).not.toBe(SCENE_PREP_PROMPT)
  })

  it('clips oversize readAloud (4000) and dmNotes (2000)', () => {
    const msg = buildScenePrepMessage({ readAloud: 'a'.repeat(5000), dmNotes: 'b'.repeat(3000) })
    expect(msg).toContain('a'.repeat(4000))
    expect(msg).not.toContain('a'.repeat(4001))
    expect(msg).toContain('b'.repeat(2000))
    expect(msg).not.toContain('b'.repeat(2001))
  })
})
