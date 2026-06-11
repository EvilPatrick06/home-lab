// PHASE-10 10D — sanitize the live AI stream preview so the DM never watches raw
// machine tags scroll by. Final-text correctness is main's job (ai-response-parser
// strips these at stream-done); this only cleans the transient on-screen preview.
//
// Grammar (verified in PHASE-10 F12):
//   block payloads: [STAT_CHANGES]…[/STAT_CHANGES], [DM_ACTIONS]…[/DM_ACTIONS],
//                   [RULE_CITATION …]…[/RULE_CITATION], [RULING …]…[/RULING]
//   voice tags:     [NPC: archetype], [EMOTION: mood]

const BLOCK_MARKERS = ['[STAT_CHANGES]', '[DM_ACTIONS]', '[RULE_CITATION', '[RULING']
const VOICE_TAG_RE = /\[NPC:\s*[a-z_]+\s*\]|\[EMOTION:\s*[a-z_]+\s*\]/gi
// A lone '[' plus up to 16 marker-ish chars still streaming in at end-of-string.
// Trade-off: a narration line genuinely ending in "[word" loses those chars from a
// 200-char transient preview — acceptable.
const TRAILING_PARTIAL_RE = /\[[A-Za-z_]{0,16}$/

export function sanitizeStreamPreview(raw: string): string {
  if (!raw) return raw

  // 1. Cut at the EARLIEST block-opening marker — everything from there on is machine payload.
  let cut = raw.length
  for (const marker of BLOCK_MARKERS) {
    const idx = raw.indexOf(marker)
    if (idx !== -1 && idx < cut) cut = idx
  }
  let text = raw.slice(0, cut)

  // 2. Strip complete voice tags.
  text = text.replace(VOICE_TAG_RE, '')

  // 3. Trim a trailing partial marker still streaming in.
  text = text.replace(TRAILING_PARTIAL_RE, '')

  // 4. Collapse the doubled spaces tag removal leaves; preserve newlines.
  text = text.replace(/[ \t]{2,}/g, ' ')

  return text
}
