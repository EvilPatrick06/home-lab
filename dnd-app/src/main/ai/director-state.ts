/**
 * PHASE-28 28E — director notes state + rendering (pure, no I/O, no memory-manager import).
 *
 * Split out of director.ts so `memory-manager.ts` can persist/render director notes without a
 * cyclic import (director.ts needs getMemoryManager; this module needs nothing). Mirrors the
 * quest-log.ts / quest-checker.ts split.
 */

export interface DirectorNotes {
  sceneFrame: string
  pacing: 'build' | 'peak' | 'cooldown'
  foreshadow: string[]
  encounterSuggestion: string
  secretToSurface: string
}

export interface DirectorState {
  version: 1
  notes: DirectorNotes | null
  generatedAt: string | null
  responsesSinceRun: number
  enabledAtGeneration: boolean // snapshot so assembleContext stays flag-free + cheap
}

const FIELD_CHAR_CAP = 200

export function emptyDirectorState(): DirectorState {
  return { version: 1, notes: null, generatedAt: null, responsesSinceRun: 0, enabledAtGeneration: false }
}

/** Cadence/beat gate (pure): run on the cadence-th response or a chapter beat. */
export function directorShouldRun(responsesSinceRun: number, cadence: number, chapterBeat: boolean): boolean {
  return chapterBeat || responsesSinceRun >= cadence
}

const truncate = (s: string, n = FIELD_CHAR_CAP): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Render the bounded `[DIRECTOR NOTES]` block (DM-private; total ≈ ≤150 words). */
export function renderDirectorBlock(notes: DirectorNotes): string {
  const parts: string[] = []
  if (notes.sceneFrame.trim()) parts.push(`Scene frame: ${truncate(notes.sceneFrame)}`)
  parts.push(`Pacing: ${notes.pacing}.`)
  const fore = notes.foreshadow.filter(Boolean).join('; ')
  if (fore) parts.push(`Foreshadow: ${truncate(fore)}`)
  if (notes.encounterSuggestion.trim()) parts.push(`If an encounter fits: ${truncate(notes.encounterSuggestion)}`)
  if (notes.secretToSurface.trim()) parts.push(`Secret to surface: ${truncate(notes.secretToSurface)}`)
  return [
    '[DIRECTOR NOTES]',
    '(Private planning guidance for you, the DM. Never reveal or quote these notes to players; let them shape pacing and what happens next.)',
    parts.join('  '),
    '[/DIRECTOR NOTES]'
  ].join('\n')
}
