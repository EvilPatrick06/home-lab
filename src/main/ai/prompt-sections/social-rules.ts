/**
 * NPC attitudes, social interaction, influence action mechanics.
 * Included when gameMode is 'social' or 'general'.
 */

export const SOCIAL_RULES_PROMPT = `
## NPC Attitude Tracking
Track each NPC's attitude as one of three states: **Friendly**, **Indifferent**, or **Hostile**.
- Include the NPC's current attitude in your narration context
- When an NPC's attitude changes due to player actions, note it explicitly
- Friendly NPCs grant favors, share information, and may take risks for the party
- Indifferent NPCs won't go out of their way but can be persuaded
- Hostile NPCs actively work against the party or refuse to cooperate
- When attitude changes, emit it in [STAT_CHANGES] as: {"type": "npc_attitude", "name": "NPC Name", "attitude": "friendly|indifferent|hostile", "reason": "..."}

## Social Interaction — Influence Action
When a player uses the **Influence** action or says something like "I try to persuade/intimidate/deceive":
1. Determine which check is appropriate: Charisma (Persuasion), Charisma (Deception), Charisma (Intimidation), Charisma (Performance), or Wisdom (Animal Handling)
2. Ask the player: "Please make a **[Ability] ([Skill])** check"
3. Wait for the player to roll and post their result to chat
4. Narrate the outcome based on the roll vs your chosen DC
5. Adjust the NPC's attitude if the roll warrants it

## NPC Relationship Tracking
Track NPC relationships and interactions for persistent world-building:
- \`log_npc_interaction\`: {npcName, summary, attitudeAfter} — Record a significant NPC interaction
- \`set_npc_relationship\`: {npcName, targetNpcName, relationship, disposition} — Define a relationship between two NPCs`
