import { describe, expect, it } from 'vitest'
import { assembleSystemPrompt, type GameMode } from './prompt-assembler'
import { CHARACTER_RULES_PROMPT } from './prompt-sections/character-rules'
import { COMBAT_RULES_PROMPT } from './prompt-sections/combat-rules'
import { DM_ACTIONS_SCHEMA_PROMPT } from './prompt-sections/dm-actions-schema'
import { EXPLORATION_RULES_PROMPT } from './prompt-sections/exploration-rules'
import { NARRATIVE_RULES_PROMPT } from './prompt-sections/narrative-rules'
import { SOCIAL_RULES_PROMPT } from './prompt-sections/social-rules'
import { VOICE_NARRATION_PROMPT } from './prompt-sections/voice-narration'

// Phase 28i — coverage for the pure section-assembly logic. We assert which
// modular sections are present/absent per game mode, that the narrative section
// always leads and the DM-actions schema always trails, and that the assembled
// string is the join of exactly the expected parts (no extra glue). Distinctive
// `##` headers from each section act as presence markers so the tests stay
// robust to wording changes inside the sections.

// Distinctive header substrings, one per section module.
const HDR_NARRATIVE = '## NARRATIVE VOICE (MANDATORY)'
const HDR_COMBAT = '## Combat Reference (2024 PHB Rules Glossary)'
const HDR_CHARACTER = '## Character Sheet Enforcement'
const HDR_EXPLORATION = '## Exploration & Travel (DMG 2024)'
const HDR_SOCIAL = '## NPC Attitude Tracking'
const HDR_DM_ACTIONS = '## Game Board Control'
const HDR_VOICE = '## VOICE TAGS (optional — for spoken narration)'

describe('assembleSystemPrompt', () => {
  describe('combat mode', () => {
    const prompt = assembleSystemPrompt('combat')

    it('includes narrative, character, combat, and DM-actions sections', () => {
      expect(prompt).toContain(HDR_NARRATIVE)
      expect(prompt).toContain(HDR_CHARACTER)
      expect(prompt).toContain(HDR_COMBAT)
      expect(prompt).toContain(HDR_DM_ACTIONS)
    })

    it('omits the exploration and social sections', () => {
      expect(prompt).not.toContain(HDR_EXPLORATION)
      expect(prompt).not.toContain(HDR_SOCIAL)
    })

    it('is exactly narrative + character + combat + DM-actions + voice joined by blank lines', () => {
      expect(prompt).toBe(
        [
          NARRATIVE_RULES_PROMPT,
          CHARACTER_RULES_PROMPT,
          COMBAT_RULES_PROMPT,
          DM_ACTIONS_SCHEMA_PROMPT,
          VOICE_NARRATION_PROMPT
        ].join('\n\n')
      )
    })
  })

  describe('exploration mode', () => {
    const prompt = assembleSystemPrompt('exploration')

    it('includes narrative, exploration, and DM-actions sections', () => {
      expect(prompt).toContain(HDR_NARRATIVE)
      expect(prompt).toContain(HDR_EXPLORATION)
      expect(prompt).toContain(HDR_DM_ACTIONS)
    })

    it('omits combat, character, and social sections', () => {
      expect(prompt).not.toContain(HDR_COMBAT)
      expect(prompt).not.toContain(HDR_CHARACTER)
      expect(prompt).not.toContain(HDR_SOCIAL)
    })

    it('is exactly narrative + exploration + DM-actions + voice joined by blank lines', () => {
      expect(prompt).toBe(
        [NARRATIVE_RULES_PROMPT, EXPLORATION_RULES_PROMPT, DM_ACTIONS_SCHEMA_PROMPT, VOICE_NARRATION_PROMPT].join(
          '\n\n'
        )
      )
    })
  })

  describe('social mode', () => {
    const prompt = assembleSystemPrompt('social')

    it('includes narrative, social, and DM-actions sections', () => {
      expect(prompt).toContain(HDR_NARRATIVE)
      expect(prompt).toContain(HDR_SOCIAL)
      expect(prompt).toContain(HDR_DM_ACTIONS)
    })

    it('omits combat, character, and exploration sections', () => {
      expect(prompt).not.toContain(HDR_COMBAT)
      expect(prompt).not.toContain(HDR_CHARACTER)
      expect(prompt).not.toContain(HDR_EXPLORATION)
    })

    it('is exactly narrative + social + DM-actions + voice joined by blank lines', () => {
      expect(prompt).toBe(
        [NARRATIVE_RULES_PROMPT, SOCIAL_RULES_PROMPT, DM_ACTIONS_SCHEMA_PROMPT, VOICE_NARRATION_PROMPT].join('\n\n')
      )
    })
  })

  describe('general mode', () => {
    const prompt = assembleSystemPrompt('general')

    it('includes every section', () => {
      expect(prompt).toContain(HDR_NARRATIVE)
      expect(prompt).toContain(HDR_CHARACTER)
      expect(prompt).toContain(HDR_COMBAT)
      expect(prompt).toContain(HDR_EXPLORATION)
      expect(prompt).toContain(HDR_SOCIAL)
      expect(prompt).toContain(HDR_DM_ACTIONS)
    })

    it('is exactly all sections joined in narrative→char→combat→explore→social→actions→voice order', () => {
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

    it('includes the optional voice-tags section', () => {
      expect(prompt).toContain(HDR_VOICE)
    })

    it('matches the no-argument default (general)', () => {
      expect(assembleSystemPrompt()).toBe(prompt)
    })

    it('matches the default branch for an unknown mode value', () => {
      // Defensive: an out-of-band mode string must fall through to the default
      // (all-sections) branch rather than producing only the narrative prefix.
      const unknown = assembleSystemPrompt('mystery' as unknown as GameMode)
      expect(unknown).toBe(prompt)
    })
  })

  describe('ordering invariants (all modes)', () => {
    const modes: GameMode[] = ['combat', 'exploration', 'social', 'general']

    it('always leads with the narrative section', () => {
      for (const mode of modes) {
        expect(assembleSystemPrompt(mode).startsWith(NARRATIVE_RULES_PROMPT)).toBe(true)
      }
    })

    it('always ends with the voice-tags section (the new trailer after DM-actions)', () => {
      for (const mode of modes) {
        expect(assembleSystemPrompt(mode).endsWith(VOICE_NARRATION_PROMPT)).toBe(true)
      }
    })

    it('places narrative before DM-actions in every mode', () => {
      for (const mode of modes) {
        const prompt = assembleSystemPrompt(mode)
        expect(prompt.indexOf(HDR_NARRATIVE)).toBeLessThan(prompt.indexOf(HDR_DM_ACTIONS))
      }
    })
  })
})
