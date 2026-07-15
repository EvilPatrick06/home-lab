#!/usr/bin/env node
/**
 * Per-file size budget (LOC ratchet).
 *
 * The renderer's largest "god components" are being decomposed incrementally
 * (see SUGGESTIONS-LOG-DNDAPP "Renderer god-components …"). To make sure they
 * SHRINK rather than GROW back, each is given a hard line-count ceiling here.
 * CI fails (exit 1) if a budgeted file exceeds its ceiling — forcing the author
 * to extract a cohesive piece (a hook / sub-component into the sibling dir)
 * instead of piling more onto the monolith. As extraction continues, LOWER the
 * budgets below to lock in the gains.
 *
 * Run: `node scripts/lint/file-size-budget.mjs`  (wired into dnd-app-ci.yml)
 *
 * To add a file to the ratchet: set its budget to the file's CURRENT line count.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')

/**
 * Hard ceilings, in source lines, keyed by repo-relative (to dnd-app) path.
 * A file may sit AT its budget but must never exceed it. Lower these as the
 * decomposition proceeds; never raise one to "make room" — extract instead.
 * @type {Record<string, number>}
 */
const BUDGETS = {
  'src/renderer/src/components/game/GameLayout.tsx': 1290,
  'src/renderer/src/components/library/PdfViewer.tsx': 1236,
  // Enrolled 2026-07-15 (approved backlog item): frozen at their then-current
  // line counts so the main-process AI layer, web shim, and largest store can
  // no longer grow unbounded. Lower each budget as decomposition lands
  // (ai-service.ts already has an approved decompose backlog entry).
  'src/main/ai/ai-service.ts': 1694,
  'src/main/ai/ai-schemas.ts': 1622,
  'src/main/ipc/ai-handlers.ts': 1209,
  'src/web/web-api.ts': 1190,
  'src/renderer/src/stores/network-store/index.ts': 1007
}

let failed = false
const rows = []
for (const [rel, budget] of Object.entries(BUDGETS)) {
  let lines
  try {
    const content = readFileSync(join(ROOT, rel), 'utf8')
    // Count lines with `wc -l` semantics (newline count; ignore a trailing newline).
    lines = content.length === 0 ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
  } catch (err) {
    console.error(`file-size-budget: cannot read ${rel}: ${err.message}`)
    failed = true
    continue
  }
  const over = lines > budget
  if (over) failed = true
  rows.push({ rel, lines, budget, over })
}

const width = Math.max(...rows.map((r) => r.rel.length))
for (const r of rows) {
  const status = r.over ? 'OVER ' : 'ok   '
  console.log(`${status} ${r.rel.padEnd(width)}  ${r.lines} / ${r.budget}`)
}

if (failed) {
  console.error(
    '\nfile-size-budget: a budgeted file exceeds its line ceiling. Extract a cohesive\n' +
      'piece (a hook or sub-component into the sibling dir) to bring it back under budget —\n' +
      'do NOT raise the budget. See SUGGESTIONS-LOG-DNDAPP "Renderer god-components …".'
  )
  process.exit(1)
}
console.log('\nfile-size-budget: all budgeted files within their line ceilings.')
