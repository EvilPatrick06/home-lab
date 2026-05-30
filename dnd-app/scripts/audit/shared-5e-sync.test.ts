import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * CI gate: the five 5e JSON files duplicated across the dnd-app ↔ bmo boundary
 * MUST stay byte-identical. dnd-app is the source of truth; the bmo copies are
 * produced by manually running bmo/pi/scripts/sync-shared-5e-json.sh. This test
 * fails the dnd-app CI if the two trees diverge so the manual sync step can't be
 * silently forgotten. (`scripts/**\/*.test.ts` is in vitest's include and the CI
 * checks out the whole monorepo, so bmo/ is present in the runner.)
 */

// audit -> scripts -> dnd-app -> home-lab
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const D5 = resolve(REPO_ROOT, 'dnd-app/src/renderer/public/data/5e')
const BMO = resolve(REPO_ROOT, 'bmo/pi/data/5e')

// Mirror of bmo/pi/scripts/sync-shared-5e-json.sh (dnd-app rel path -> bmo flat name).
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['hazards/conditions.json', 'conditions.json'],
  ['encounters/encounter-presets.json', 'encounter-presets.json'],
  ['encounters/random-tables.json', 'random-tables.json'],
  ['equipment/magic-items.json', 'magic-items.json'],
  ['world/treasure-tables.json', 'treasure-tables.json']
]

describe('shared 5e JSON stays in sync (dnd-app <-> bmo/pi/data)', () => {
  it.each(PAIRS)('%s matches bmo/pi/data/5e/%s byte-for-byte', (d5Rel, bmoRel) => {
    const d5Path = resolve(D5, d5Rel)
    const bmoPath = resolve(BMO, bmoRel)
    const d5Buf = readFileSync(d5Path)
    const bmoBuf = readFileSync(bmoPath)
    expect(
      bmoBuf.equals(d5Buf),
      `Out of sync: ${d5Path} != ${bmoPath}. Run bmo/pi/scripts/sync-shared-5e-json.sh to resync (dnd-app is source of truth).`
    ).toBe(true)
  })
})
