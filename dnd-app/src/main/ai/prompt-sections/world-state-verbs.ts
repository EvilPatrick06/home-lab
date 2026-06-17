/**
 * PHASE-27 27F — world-state delta verb documentation, injected via the context (gated by the
 * store's `enabled` flag) rather than the system prompt: assembleSystemPrompt is sync +
 * campaign-agnostic (F7), and this keeps the system prompt byte-stable for PHASE-01's KV cache.
 * Static text, so it precedes the volatile [WORLD STATE] block within the memory segment.
 */
export const WORLD_STATE_VERBS_PROMPT = [
  '[WORLD STATE ACTIONS]',
  'The World State block below is AUTHORITATIVE — never contradict it. Emit these to update it:',
  '`discover_location`: {name, type?, description?, connectsTo?, exitLabel?} — a new place the party learns of.',
  '`move_party`: {locationName} — when the party travels to a location.',
  '`link_locations`: {fromName, toName, label?} — record a path/exit between two places.',
  '`set_npc_opinion`: {npcName, characterName, delta? | score?, summary?} — when an NPC’s view of a SPECIFIC',
  '  character shifts (delta is relative, score is absolute, clamped to ±100).',
  '`record_fact`: {text, tags?} — an established world fact worth remembering.',
  '[/WORLD STATE ACTIONS]'
].join('\n')
