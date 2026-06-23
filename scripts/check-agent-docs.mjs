#!/usr/bin/env node
// Drift guard for the AI agent-instruction docs (suggestions-log 2026-06-22).
// AGENTS.md is the canonical source; the tool-specific files must keep a pointer
// to it for shared conventions rather than silently diverging into 4 copies.
import { readFileSync } from 'node:fs'

const CANONICAL = 'AGENTS.md'
const SECONDARY = ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']

let failed = false
for (const f of SECONDARY) {
  const txt = readFileSync(f, 'utf8')
  if (!txt.includes(CANONICAL)) {
    failed = true
    console.error(`✖ ${f} does not reference the canonical ${CANONICAL} — link to it for shared sections.`)
  } else {
    console.log(`✔ ${f} references ${CANONICAL}`)
  }
}
process.exit(failed ? 1 : 0)
