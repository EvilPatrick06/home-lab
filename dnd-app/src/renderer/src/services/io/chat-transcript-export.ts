// ---------------------------------------------------------------------------
// Chat Transcript Export Service
// ---------------------------------------------------------------------------
// Mirrors the combat-log export path (services/io/combat-log-export.ts) for the
// RP/narration game chat. The combat log gets CSV/JSON export; the actual story
// (player roleplay, DM/AI-DM narration, whispers, system messages) had none —
// once a session ended the raw transcript was unrecoverable. This serializes the
// use-lobby-store ChatMessage[] to Markdown (and JSON) so groups can journal a
// campaign, feed a past session back to the AI DM, or share it on Discord.

import type { ChatMessage } from '../../stores/use-lobby-store'

export interface TranscriptExportOptions {
  /** Include `isSystem` messages (joins/leaves/rolls-as-system). Default true. */
  includeSystem?: boolean
}

function speakerFor(msg: ChatMessage): string {
  if (msg.senderId === 'ai-dm') return 'Dungeon Master (AI)'
  if (msg.isSystem) return 'System'
  return msg.senderName || 'Unknown'
}

function timeFor(timestamp: number): string {
  const d = new Date(timestamp)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Human-readable line for a single message (dice rolls & files rendered inline). */
function contentFor(msg: ChatMessage): string {
  if (msg.isDiceRoll && msg.diceResult) {
    const { formula, total, rolls } = msg.diceResult
    return `🎲 rolled ${formula} → ${total} [${rolls.join(', ')}]`
  }
  if (msg.isFile) {
    return `📎 shared a file${msg.fileName ? `: ${msg.fileName}` : ''}`
  }
  return msg.content
}

/**
 * Export the game chat to a Markdown transcript.
 * `# Session — <date>` then `**Speaker** (HH:MM): message`.
 */
export function exportChatTranscriptMarkdown(messages: ChatMessage[], options: TranscriptExportOptions = {}): string {
  const { includeSystem = true } = options
  const visible = messages.filter((m) => includeSystem || !m.isSystem)

  const dateLabel = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`# Session — ${dateLabel}`, '']

  if (visible.length === 0) {
    lines.push('_(No chat messages)_')
    return lines.join('\n')
  }

  for (const msg of visible) {
    const speaker = speakerFor(msg)
    const time = timeFor(msg.timestamp)
    const body = contentFor(msg)
    // System messages are rendered as italic notes rather than a speaker line.
    if (msg.isSystem) {
      lines.push(`_${time} — ${body}_`, '')
    } else {
      lines.push(`**${speaker}** (${time}): ${body}`, '')
    }
  }

  lines.push(`_${visible.length} message${visible.length === 1 ? '' : 's'}._`)
  return lines.join('\n')
}

/**
 * Export the game chat to JSON (the raw ChatMessage[], honoring includeSystem).
 */
export function exportChatTranscriptJSON(messages: ChatMessage[], options: TranscriptExportOptions = {}): string {
  const { includeSystem = true } = options
  const visible = messages.filter((m) => includeSystem || !m.isSystem)
  return JSON.stringify(visible, null, 2)
}
