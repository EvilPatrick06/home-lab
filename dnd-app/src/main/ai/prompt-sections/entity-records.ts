/**
 * PHASE-25 25E — `record_entity` verb documentation, injected via the context (gated by
 * the entity store's `enabled` flag) rather than the system prompt, because system-prompt
 * assembly is sync + campaign-agnostic (F7). Style mirrors dm-actions-schema.ts.
 */
export const ENTITY_RECORDS_PROMPT = [
  '[ENTITY ACTIONS]',
  "`record_entity`: {kind: 'npc'|'location'|'item'|'faction', name, summary, keywords?} —",
  'when a NEW named NPC, location, item, or faction becomes significant, or an existing one',
  'changes materially, record it. The [ENTITY RECORDS] block below is your persistent memory',
  'of them; the DM may edit records — edited records are authoritative, do not contradict them.',
  '[/ENTITY ACTIONS]'
].join('\n')
