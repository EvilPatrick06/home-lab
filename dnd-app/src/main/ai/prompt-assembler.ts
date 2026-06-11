/**
 * Prompt assembler — joins the modular rule sections into the system prompt.
 *
 * Deliberately MODE-INDEPENDENT (PHASE-11 11B): the rules base is always the same
 * seven sections in the same order, so it stays a byte-stable prefix the provider
 * (Ollama) can KV-cache across requests. The only combat-conditional content is
 * COMBAT_TACTICS_PROMPT, which conversation-manager appends separately when the
 * context contains "Initiative:" — keeping it out of this static prefix preserves
 * the cache. (The old per-mode switch produced byte-identical output for the two
 * reachable modes and saved zero tokens; it was removed in 11B.)
 */

import { CHARACTER_RULES_PROMPT } from './prompt-sections/character-rules'
import { COMBAT_RULES_PROMPT } from './prompt-sections/combat-rules'
import { DM_ACTIONS_SCHEMA_PROMPT } from './prompt-sections/dm-actions-schema'
import { EXPLORATION_RULES_PROMPT } from './prompt-sections/exploration-rules'
import { NARRATIVE_RULES_PROMPT } from './prompt-sections/narrative-rules'
import { SOCIAL_RULES_PROMPT } from './prompt-sections/social-rules'
import { VOICE_NARRATION_PROMPT } from './prompt-sections/voice-narration'

/** Assemble the system prompt — one static, cache-stable section join. */
export function assembleSystemPrompt(): string {
  return [
    NARRATIVE_RULES_PROMPT,
    CHARACTER_RULES_PROMPT,
    COMBAT_RULES_PROMPT,
    EXPLORATION_RULES_PROMPT,
    SOCIAL_RULES_PROMPT,
    DM_ACTIONS_SCHEMA_PROMPT,
    VOICE_NARRATION_PROMPT
  ].join('\n\n')
}
