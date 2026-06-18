import { describe, expect, it } from 'vitest'
import { assembleSystemPrompt } from './prompt-assembler'
import { CHARACTER_RULES_PROMPT } from './prompt-sections/character-rules'
import { COMBAT_RULES_PROMPT } from './prompt-sections/combat-rules'
import { DM_ACTIONS_SCHEMA_PROMPT } from './prompt-sections/dm-actions-schema'
import { EXPLORATION_RULES_PROMPT } from './prompt-sections/exploration-rules'
import { NARRATIVE_RULES_PROMPT } from './prompt-sections/narrative-rules'
import { SOCIAL_RULES_PROMPT } from './prompt-sections/social-rules'
import { VOICE_NARRATION_PROMPT } from './prompt-sections/voice-narration'

// PHASE-11 11B — the assembler is now mode-independent: one static, cache-stable
// section join (byte-identical to the old 'general' output). Distinctive `##`
// headers from each section act as presence markers.

const HDR_NARRATIVE = '## NARRATIVE VOICE (MANDATORY)'
const HDR_COMBAT = '## Combat Reference (2024 PHB Rules Glossary)'
const HDR_CHARACTER = '## Character Sheet Enforcement'
const HDR_EXPLORATION = '## Exploration & Travel (DMG 2024)'
const HDR_SOCIAL = '## NPC Attitude Tracking'
const HDR_DM_ACTIONS = '## Game Board Control'
const HDR_VOICE = '## VOICE TAGS (optional — for spoken narration)'

describe('assembleSystemPrompt', () => {
  const prompt = assembleSystemPrompt()

  it('includes every section marker', () => {
    expect(prompt).toContain(HDR_NARRATIVE)
    expect(prompt).toContain(HDR_CHARACTER)
    expect(prompt).toContain(HDR_COMBAT)
    expect(prompt).toContain(HDR_EXPLORATION)
    expect(prompt).toContain(HDR_SOCIAL)
    expect(prompt).toContain(HDR_DM_ACTIONS)
    expect(prompt).toContain(HDR_VOICE)
  })

  it('is exactly the seven-section join in narrative→char→combat→explore→social→actions→voice order', () => {
    expect(prompt).toBe(
      [
        NARRATIVE_RULES_PROMPT,
        CHARACTER_RULES_PROMPT,
        COMBAT_RULES_PROMPT,
        EXPLORATION_RULES_PROMPT,
        SOCIAL_RULES_PROMPT,
        DM_ACTIONS_SCHEMA_PROMPT,
        VOICE_NARRATION_PROMPT
      ].join('\n\n')
    )
  })

  it('starts with the narrative section', () => {
    expect(prompt.startsWith(NARRATIVE_RULES_PROMPT)).toBe(true)
  })

  it('ends with the voice-tags section', () => {
    expect(prompt.endsWith(VOICE_NARRATION_PROMPT)).toBe(true)
  })

  it('places DM-actions before the voice-tags trailer', () => {
    expect(prompt.indexOf(HDR_DM_ACTIONS)).toBeLessThan(prompt.indexOf(HDR_VOICE))
  })

  it('is deterministic (same output every call — a stable cacheable prefix)', () => {
    expect(assembleSystemPrompt()).toBe(prompt)
  })

  // PHASE-34 34H — generate_battlemap advertised only when the campaign opts in.
  it('omits generate_battlemap by default, includes it when allowMapGeneration is set', () => {
    expect(assembleSystemPrompt()).not.toContain('generate_battlemap')
    expect(assembleSystemPrompt({ allowMapGeneration: false })).not.toContain('generate_battlemap')
    expect(assembleSystemPrompt({ allowMapGeneration: true })).toContain('generate_battlemap')
  })
})
