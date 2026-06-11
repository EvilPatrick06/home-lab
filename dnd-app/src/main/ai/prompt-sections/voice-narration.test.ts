import { describe, expect, it } from 'vitest'
import { EMOTION_VOCABULARY, NPC_ARCHETYPES, VOICE_NARRATION_PROMPT } from './voice-narration'

// PHASE-11 11E — the voice vocabulary is the VTT↔Pi cross-domain contract. These
// assertions make the prompt physically unable to drift from the tested lists, and
// pin the lists so any edit is a deliberate (reviewed) contract change. PHASE-21's
// 21D mirrors EMOTION_VOCABULARY in bmo/pi/tests against its alias table.

describe('voice-narration contract', () => {
  it('prompt contains every NPC archetype', () => {
    for (const a of NPC_ARCHETYPES) {
      expect(VOICE_NARRATION_PROMPT).toContain(a)
    }
  })

  it('prompt contains every emotion term', () => {
    for (const e of EMOTION_VOCABULARY) {
      expect(VOICE_NARRATION_PROMPT).toContain(e)
    }
  })

  it('pins the archetype list (edit = deliberate contract change)', () => {
    expect(NPC_ARCHETYPES).toEqual([
      'gruff_dwarf',
      'mysterious_elf',
      'booming_dragon',
      'elderly_wizard',
      'cheerful_bard',
      'stern_guard',
      'tavern_keeper',
      'whispery_rogue'
    ])
  })

  it('pins the emotion vocabulary (edit = deliberate contract change)', () => {
    expect(EMOTION_VOCABULARY).toEqual(['neutral', 'calm', 'happy', 'sad', 'angry', 'excited', 'fearful', 'menacing'])
  })

  it('every term matches the parseVoiceTags capture charset /^[a-z_]+$/', () => {
    for (const term of [...NPC_ARCHETYPES, ...EMOTION_VOCABULARY]) {
      expect(term).toMatch(/^[a-z_]+$/)
    }
  })

  it('still starts with the HDR_VOICE marker', () => {
    expect(VOICE_NARRATION_PROMPT.startsWith('## VOICE TAGS (optional — for spoken narration)')).toBe(true)
  })
})
