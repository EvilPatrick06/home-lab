/**
 * Resolves the repo "5.5e References" directory. Content lives at the
 * monorepo root (next to dnd-app/), not inside dnd-app/.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function get5eReferencesDir(cwd: string = process.cwd()): string {
  const candidates = [join(cwd, '5.5e References'), join(cwd, '..', '5.5e References')]
  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }
  throw new Error(
    '5.5e References not found. Expected at <repo>/5.5e References/ (run from home-lab or dnd-app cwd).',
  )
}
