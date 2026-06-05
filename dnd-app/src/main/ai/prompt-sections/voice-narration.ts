/**
 * Optional voice tags for DM-BMO. When a voice assistant (DM-BMO) is speaking the
 * narration aloud in a Discord voice channel, these tags let it modulate tone/pitch
 * per character. They are STRIPPED from the in-game chat text, so they never show to
 * players — emit them freely. Always included in every prompt assembly.
 */

export const VOICE_NARRATION_PROMPT = `## VOICE TAGS (optional — for spoken narration)
When a specific NPC is the dominant speaker in your reply, you MAY prefix the reply with a voice tag so the spoken narration uses a fitting voice. These tags are removed from the on-screen chat text — they ONLY affect the spoken voice, so use them whenever an NPC's voice would add flavor.
- \`[NPC:archetype]\` — pick the closest archetype: gruff_dwarf, mysterious_elf, booming_dragon, elderly_wizard, cheerful_bard, stern_guard, tavern_keeper, whispery_rogue. Omit for plain DM narration.
- \`[EMOTION:mood]\` — optional mood: neutral, calm, happy, sad, angry, excited, fearful, menacing.
Example: \`[NPC:gruff_dwarf][EMOTION:angry] "Ye'll not pass while I draw breath!" the old warrior bellows.\`
Use at most ONE NPC tag and ONE emotion tag per reply (the first of each wins). Never explain or mention the tags.`
