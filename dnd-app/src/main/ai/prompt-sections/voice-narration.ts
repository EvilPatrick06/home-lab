/**
 * Optional voice tags for DM-BMO. When a voice assistant (DM-BMO) is speaking the
 * narration aloud in a Discord voice channel, these tags let it modulate tone/pitch
 * per character. They are STRIPPED from the in-game chat text, so they never show to
 * players — emit them freely. Always included in every prompt assembly.
 */

/** VTT↔Pi voice contract. The Pi prosody map (bmo/pi/services/voice_personality.py)
 *  must accept every term below — see the PHASE-21 alias table. Changing either list
 *  is a cross-domain contract change; voice-narration.test.ts pins both. */
export const NPC_ARCHETYPES = [
  'gruff_dwarf',
  'mysterious_elf',
  'booming_dragon',
  'elderly_wizard',
  'cheerful_bard',
  'stern_guard',
  'tavern_keeper',
  'whispery_rogue'
] as const
export const EMOTION_VOCABULARY = [
  'neutral',
  'calm',
  'happy',
  'sad',
  'angry',
  'excited',
  'fearful',
  'menacing'
] as const

export const VOICE_NARRATION_PROMPT = `## VOICE TAGS (optional — for spoken narration)
When a specific NPC is the dominant speaker in your reply, you MAY prefix the reply with a voice tag so the spoken narration uses a fitting voice. These tags are removed from the on-screen chat text — they ONLY affect the spoken voice, so use them whenever an NPC's voice would add flavor.
- \`[NPC:archetype]\` — pick the closest archetype: ${NPC_ARCHETYPES.join(', ')}. Omit for plain DM narration.
- \`[EMOTION:mood]\` — optional mood: ${EMOTION_VOCABULARY.join(', ')}.
- \`[SPEAKER:Name]\` — when a NAMED NPC speaks most of the reply, add their short name (e.g. \`[SPEAKER:Volo]\`) so that character keeps a consistent voice across scenes. Omit for unnamed or one-off characters.
Example: \`[NPC:gruff_dwarf][EMOTION:angry][SPEAKER:Borin] "Ye'll not pass while I draw breath!" the old warrior bellows.\`
Use at most ONE of each tag per reply (the first of each wins). Never explain or mention the tags.`
