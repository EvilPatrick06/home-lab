/**
 * Prompt assembler — dynamically assembles the system prompt from modular sections
 * based on the current game mode. Replaces the monolithic DM_SYSTEM_PROMPT with
 * context-aware assembly that saves tokens when not all rules are needed.
 */

import { CHARACTER_RULES_PROMPT } from './prompt-sections/character-rules'
import { COMBAT_RULES_PROMPT } from './prompt-sections/combat-rules'
import { DM_ACTIONS_SCHEMA_PROMPT } from './prompt-sections/dm-actions-schema'
import { EXPLORATION_RULES_PROMPT } from './prompt-sections/exploration-rules'
import { NARRATIVE_RULES_PROMPT } from './prompt-sections/narrative-rules'
import { SOCIAL_RULES_PROMPT } from './prompt-sections/social-rules'
import { VOICE_NARRATION_PROMPT } from './prompt-sections/voice-narration'

export type GameMode = 'combat' | 'exploration' | 'social' | 'general'

/**
 * Assemble a system prompt from modular sections based on the current game mode.
 *
 * - 'combat': narrative + character rules + combat rules + DM actions
 * - 'exploration': narrative + exploration rules + DM actions
 * - 'social': narrative + social rules + DM actions
 * - 'general' (default): all sections
 */
export function assembleSystemPrompt(gameMode: GameMode = 'general'): string {
  const parts: string[] = [NARRATIVE_RULES_PROMPT]

  switch (gameMode) {
    case 'combat':
      parts.push(CHARACTER_RULES_PROMPT)
      parts.push(COMBAT_RULES_PROMPT)
      // Keep exploration + social rules in combat too — fights routinely involve
      // terrain/movement and intimidation/persuasion; stripping them made the AI
      // forget those mid-combat.
      parts.push(EXPLORATION_RULES_PROMPT)
      parts.push(SOCIAL_RULES_PROMPT)
      break
    case 'exploration':
      // Character-sheet enforcement + combat rules belong in EVERY mode — combat can
      // break out anytime, and the AI must always respect HP/slots/abilities.
      parts.push(CHARACTER_RULES_PROMPT)
      parts.push(COMBAT_RULES_PROMPT)
      parts.push(EXPLORATION_RULES_PROMPT)
      break
    case 'social':
      parts.push(CHARACTER_RULES_PROMPT)
      parts.push(COMBAT_RULES_PROMPT)
      parts.push(SOCIAL_RULES_PROMPT)
      break
    default:
      parts.push(CHARACTER_RULES_PROMPT)
      parts.push(COMBAT_RULES_PROMPT)
      parts.push(EXPLORATION_RULES_PROMPT)
      parts.push(SOCIAL_RULES_PROMPT)
      break
  }

  parts.push(DM_ACTIONS_SCHEMA_PROMPT)
  parts.push(VOICE_NARRATION_PROMPT)

  return parts.join('\n\n')
}
