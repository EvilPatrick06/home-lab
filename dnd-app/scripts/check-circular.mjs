#!/usr/bin/env node
// Circular-dependency gate (replaces the old `dpdm ... --exit-code circular:0`,
// which told dpdm to exit 0 when cycles were found — a silent no-op that could
// never catch a newly-introduced cycle; issues-log 2026-06-22).
//
// dpdm runs WITHOUT an --exit-code override (so it always exits 0 and just
// reports), and this wrapper fails (exit 1) only when a cycle appears that is
// NOT in the accepted baseline below. The 4 baseline cycles are known and
// mostly mitigated at runtime via dynamic import; statically breaking them is a
// larger refactor tracked separately. The point of the gate is to stop NEW
// cycles from sneaking in.
import { execFileSync } from 'node:child_process'

const BASELINE = [
  ['src/main/ai/ai-service.ts', 'src/main/ai/campaign-context.ts', 'src/main/storage/campaign-storage.ts'],
  [
    'src/renderer/src/stores/use-ai-dm-store.ts',
    'src/renderer/src/services/game-action-executor.ts',
    'src/renderer/src/services/game-actions/monster-automation-actions.ts',
    'src/renderer/src/services/combat/monster-turn-executor.ts'
  ],
  [
    'src/renderer/src/stores/use-ai-dm-store.ts',
    'src/renderer/src/services/game-action-executor.ts',
    'src/renderer/src/services/game-actions/monster-automation-actions.ts',
    'src/renderer/src/services/combat/monster-turn-executor.ts',
    'src/renderer/src/services/ai-dm-routing.ts'
  ],
  [
    'src/renderer/src/services/game-action-executor.ts',
    'src/renderer/src/services/game-actions/monster-automation-actions.ts',
    'src/renderer/src/services/combat/monster-turn-executor.ts',
    'src/renderer/src/services/ai-dm-routing.ts'
  ]
].map((c) => JSON.stringify([...c].sort()))

const args = [
  '--no-warning',
  '--no-tree',
  '--transform',
  '--extensions',
  'ts,tsx',
  'src/main/index.ts',
  'src/renderer/src/main.tsx'
]

let out = ''
try {
  out = execFileSync('node_modules/.bin/dpdm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  out = `${e.stdout || ''}${e.stderr || ''}`
}

const cycles = []
for (const line of out.split('\n')) {
  const m = line.match(/^\s*\d+\)\s+(.+\S)\s*$/)
  if (m) cycles.push(m[1].split(' -> ').map((s) => s.trim()))
}

const unknown = cycles.filter((c) => !BASELINE.includes(JSON.stringify([...c].sort())))
if (unknown.length > 0) {
  console.error(`✖ ${unknown.length} NEW circular dependency(ies) not in the accepted baseline:`)
  for (const c of unknown) console.error(`  - ${c.join(' -> ')}`)
  console.error('\nBreak the cycle, or — if it is genuinely intentional — add it to BASELINE in scripts/check-circular.mjs.')
  process.exit(1)
}
console.log(`✔ circular-deps gate: ${cycles.length} cycle(s), all in the accepted baseline (${BASELINE.length}).`)
