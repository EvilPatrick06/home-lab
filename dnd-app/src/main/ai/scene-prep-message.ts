/**
 * PHASE-37 37D — build the scene-prep user message. With a seeded opening scene, the model is told to
 * open the campaign with that prepared scene (narrated in its own voice, never verbatim); otherwise the
 * legacy generic prompt (byte-identical to SCENE_PREP_PROMPT, so the conversation-cleanup match holds).
 * Main-process only — takes `unknown` (structural cast) rather than importing renderer types.
 */

import { SCENE_PREP_PROMPT } from '../../shared/constants'

export const DEFAULT_SCENE_PREP_MESSAGE = SCENE_PREP_PROMPT

export function buildScenePrepMessage(openingScene: unknown): string {
  if (!openingScene || typeof openingScene !== 'object') return DEFAULT_SCENE_PREP_MESSAGE
  const os = openingScene as { title?: unknown; readAloud?: unknown; dmNotes?: unknown }
  if (typeof os.readAloud !== 'string' || !os.readAloud.trim()) return DEFAULT_SCENE_PREP_MESSAGE

  const readAloud = os.readAloud.slice(0, 4000)
  const title = typeof os.title === 'string' && os.title.trim() ? os.title.trim() : null
  const dmNotes = typeof os.dmNotes === 'string' && os.dmNotes.trim() ? os.dmNotes.slice(0, 2000) : null

  const lines = ['The adventure begins. Open the campaign with this prepared opening scene.']
  if (title) lines.push(`Scene title: ${title}`)
  lines.push('Narrate this opening in your own voice; do NOT read it verbatim:')
  lines.push(readAloud)
  if (dmNotes) lines.push(`Private staging notes (NEVER reveal to players): ${dmNotes}`)
  lines.push('End by inviting the party to act.')
  return lines.join('\n')
}
