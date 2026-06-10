#!/usr/bin/env node
/**
 * Keep the count-y claims in the docs from drifting. Computes EXACT, cheap
 * filesystem counts (test files, plugin-dir component files, BMO agents/tests)
 * and rewrites the matching doc lines. Run from `cut.mjs` at release time and
 * available manually via `npm run sync:doc-counts`.
 *
 * Per-`it()` test counts are deliberately NOT used — they need a full test run
 * and drift every commit. Test-FILE counts are exact, instant, and stable, so
 * the docs advertise "N test files" instead of a per-assertion number.
 *
 * Channel counts live in IPC-SURFACE.md and are handled by `gen:ipc-surface`.
 *
 * Each site is non-fatal: a missing file or no-match logs a warning and moves
 * on, so a doc rename never blocks a release.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DND_APP_ROOT = join(SCRIPT_DIR, '..', '..')
const REPO_ROOT = join(DND_APP_ROOT, '..')

/** Recursively count files under `dir` matching `pred(filename)`. 0 if absent. */
function countFiles(dir, pred) {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) n += countFiles(full, pred)
    else if (pred(entry)) n += 1
  }
  return n
}

const isTs = (f) => f.endsWith('.ts') || f.endsWith('.tsx')
const isTestTs = (f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx')

/** Count regex matches in a file (0 if absent). For an authoritative count of
 *  things registered in code rather than guessed from filenames. */
function countMatches(file, re) {
  if (!existsSync(file)) return 0
  return (readFileSync(file, 'utf-8').match(re) || []).length
}

// Authoritative BMO agent count = agents actually REGISTERED with the
// orchestrator, not the number of *.py files in agents/ (which includes
// helpers like base_agent/orchestrator/router/_registry/vtt_sync). Two
// registration sites: the `core_agents` list in `agent.py` + the
// `create_all_agents()` builder in `_registry.py`. Matching `create_<x>_agent(`
// CALLS (paren-suffixed) counts registrations and skips imports + the plural
// `create_all_agents(` helper.
const AGENT_CALL_RE = /create_[a-z_]+_agent\(/g
const bmoAgents =
  countMatches(join(REPO_ROOT, 'bmo/pi/agent.py'), AGENT_CALL_RE) +
  countMatches(join(REPO_ROOT, 'bmo/pi/agents/_registry.py'), AGENT_CALL_RE)

// App version — cut.mjs bumps package.json BEFORE running this script, so the
// docs always advertise the version being released.
const appVersion = JSON.parse(readFileSync(join(DND_APP_ROOT, 'package.json'), 'utf-8')).version

// Today's date for the root README "Current state (YYYY-MM-DD)" heading.
const today = new Date().toISOString().slice(0, 10)

/** Count keys in the DM_ACTION_SCHEMAS map / members of the StatChangeSchema
 *  union — authoritative "what can the AI DM actually do" numbers, parsed from
 *  the schema source so doc claims can't drift from code. 0 if parsing fails
 *  (then the doc site logs NO MATCH only if the phrasing also vanished). */
function countAiSchemaEntries() {
  const file = join(DND_APP_ROOT, 'src/main/ai/ai-schemas.ts')
  if (!existsSync(file)) return { dmActions: 0, statChanges: 0 }
  const src = readFileSync(file, 'utf-8')
  const actionsBlock = src.match(/export const DM_ACTION_SCHEMAS[^=]*=\s*\{([\s\S]*?)\n\}/)
  const dmActions = actionsBlock ? (actionsBlock[1].match(/^\s{2}[a-z_]+:/gm) || []).length : 0
  const statBlock = src.match(/export const StatChangeSchema = z\.discriminatedUnion\('type', \[([\s\S]*?)\]\)/)
  const statChanges = statBlock ? (statBlock[1].match(/Schema/g) || []).length : 0
  return { dmActions, statChanges }
}
const ai = countAiSchemaEntries()

const c = {
  dndTestFiles: countFiles(join(DND_APP_ROOT, 'src'), isTestTs),
  sheet: countFiles(join(DND_APP_ROOT, 'src/renderer/src/components/sheet'), isTs),
  builder: countFiles(join(DND_APP_ROOT, 'src/renderer/src/components/builder'), isTs),
  levelup: countFiles(join(DND_APP_ROOT, 'src/renderer/src/components/levelup'), isTs),
  combat: countFiles(join(DND_APP_ROOT, 'src/renderer/src/services/combat'), isTs),
  // BMO: only count if the bmo tree is present (it always is in this monorepo).
  bmoTestFiles: countFiles(join(REPO_ROOT, 'bmo/pi/tests'), (f) => f.startsWith('test_') && f.endsWith('.py')),
  // 5e content library size (the "N JSON files" README claim).
  libraryJson: countFiles(join(DND_APP_ROOT, 'src/renderer/public/data'), (f) => f.endsWith('.json'))
}
const libraryJsonFmt = c.libraryJson.toLocaleString('en-US')

// site = { path, re, replace }. `replace` is a function — so it must NOT use
// `$1` (string-only backrefs); it rebuilds the whole matched text instead.
// Every `re` matches its OWN output, so the script is idempotent and re-applies
// cleanly on every release.
const sites = [
  // ── Version + date (dynamic since 2026-06-10; cut.mjs bumps package.json first) ──
  // root README: "at **v2.4.70**"
  { path: join(REPO_ROOT, 'README.md'), re: /at \*\*v\d+\.\d+\.\d+\*\*/, replace: () => `at **v${appVersion}**` },
  // root README: "## Current state (2026-06-10)"
  {
    path: join(REPO_ROOT, 'README.md'),
    re: /## Current state \(\d{4}-\d{2}-\d{2}\)/,
    replace: () => `## Current state (${today})`
  },
  // dnd-app/README.md: "**Current version:** v2.4.70"
  {
    path: join(DND_APP_ROOT, 'README.md'),
    re: /\*\*Current version:\*\* v\d+\.\d+\.\d+/,
    replace: () => `**Current version:** v${appVersion}`
  },
  // ── AI DM capability counts (parsed from ai-schemas.ts) ──
  { path: join(REPO_ROOT, 'README.md'), re: /\b\d+ DM actions\b/g, replace: () => `${ai.dmActions} DM actions` },
  { path: join(DND_APP_ROOT, 'README.md'), re: /\b\d+ DM actions\b/g, replace: () => `${ai.dmActions} DM actions` },
  {
    path: join(REPO_ROOT, 'README.md'),
    re: /\b\d+ stat-change types\b/g,
    replace: () => `${ai.statChanges} stat-change types`
  },
  {
    path: join(DND_APP_ROOT, 'README.md'),
    re: /\b\d+ stat-change types\b/g,
    replace: () => `${ai.statChanges} stat-change types`
  },
  // ── 5e library size ──
  // dnd-app/README.md: "3,037 JSON files" (×2 — features list + usage walkthrough)
  { path: join(DND_APP_ROOT, 'README.md'), re: /[\d,]+ JSON files/g, replace: () => `${libraryJsonFmt} JSON files` },
  // dnd-app/README.md: "**672 test files**"
  { path: join(DND_APP_ROOT, 'README.md'), re: /\*\*[\d,]+ test files\*\*/, replace: () => `**${c.dndTestFiles} test files**` },
  // root README.md: "672 test files" / "22 pytest files"
  { path: join(REPO_ROOT, 'README.md'), re: /[\d,]+ test files/, replace: () => `${c.dndTestFiles} test files` },
  { path: join(REPO_ROOT, 'README.md'), re: /[\d,]+ pytest files/, replace: () => `${c.bmoTestFiles} pytest files` },
  // bmo/README.md: "full suite (22 test files)"
  { path: join(REPO_ROOT, 'bmo/README.md'), re: /full suite \([\d,]+ test files\)/, replace: () => `full suite (${c.bmoTestFiles} test files)` },
  // BMO agent count (authoritative — `bmoAgents`). Global: some files repeat it.
  { path: join(REPO_ROOT, 'README.md'), re: /\b\d+ AI agents\b/g, replace: () => `${bmoAgents} AI agents` },
  { path: join(REPO_ROOT, 'README.md'), re: /the \d+ BMO AI agents/g, replace: () => `the ${bmoAgents} BMO AI agents` },
  { path: join(REPO_ROOT, 'docs/ARCHITECTURE.md'), re: /one of the \d+ agents/g, replace: () => `one of the ${bmoAgents} agents` },
  { path: join(REPO_ROOT, 'docs/ARCHITECTURE.md'), re: /\b\d+ AI agents\b/g, replace: () => `${bmoAgents} AI agents` },
  { path: join(REPO_ROOT, 'bmo/README.md'), re: /\b\d+-agent router\b/g, replace: () => `${bmoAgents}-agent router` },
  { path: join(REPO_ROOT, 'bmo/README.md'), re: /\b\d+ specialized AI agents\b/g, replace: () => `${bmoAgents} specialized AI agents` },
  { path: join(REPO_ROOT, 'bmo/README.md'), re: /\b\d+ AI-agent roles\b/g, replace: () => `${bmoAgents} AI-agent roles` },
  { path: join(REPO_ROOT, 'bmo/docs/AGENTS.md'), re: /\b\d+ specialized AI agents\b/g, replace: () => `${bmoAgents} specialized AI agents` },
  // AGENTS.md (cross-tool rules) + GEMINI.md + bmo/pi/README.md structure map.
  { path: join(REPO_ROOT, 'AGENTS.md'), re: /\b\d+ AI agents\b/g, replace: () => `${bmoAgents} AI agents` },
  { path: join(REPO_ROOT, 'GEMINI.md'), re: /\b\d+ AI agents\b/g, replace: () => `${bmoAgents} AI agents` },
  { path: join(REPO_ROOT, 'AGENTS.md'), re: /\b\d+ registered AI agents\b/g, replace: () => `${bmoAgents} registered AI agents` },
  { path: join(REPO_ROOT, 'bmo/pi/README.md'), re: /\b\d+ AI agents\b/g, replace: () => `${bmoAgents} AI agents` },
  // GLOSSARY + SECURITY + bmo ARCHITECTURE claims (made dynamic 2026-06-10).
  { path: join(REPO_ROOT, 'docs/GLOSSARY.md'), re: /BMO has \d+\./, replace: () => `BMO has ${bmoAgents}.` },
  {
    path: join(REPO_ROOT, 'docs/SECURITY.md'),
    re: /v\d+\.\d+\.x \(current: \d+\.\d+\.\d+\)/,
    replace: () => `v${appVersion.split('.').slice(0, 2).join('.')}.x (current: ${appVersion})`
  },
  { path: join(REPO_ROOT, 'bmo/docs/ARCHITECTURE.md'), re: /orchestrator \+ \d+ agents/, replace: () => `orchestrator + ${bmoAgents} agents` },
  { path: join(REPO_ROOT, 'bmo/docs/ARCHITECTURE.md'), re: /The \d+ registered agents/, replace: () => `The ${bmoAgents} registered agents` },
  // .cursorrules structure map — agent count + 5e library size.
  { path: join(REPO_ROOT, '.cursorrules'), re: /\b\d+ specialized AI agents\b/g, replace: () => `${bmoAgents} specialized AI agents` },
  {
    path: join(REPO_ROOT, '.cursorrules'),
    re: /D&D content as JSON \([\d,]+ files\)/,
    replace: () => `D&D content as JSON (${libraryJsonFmt} files)`
  },
  // PLUGIN-SYSTEM.md plugin-dir file counts — match the whole "dir` (NN files)"
  // span and rebuild it (no capture-group backref).
  {
    path: join(DND_APP_ROOT, 'docs/PLUGIN-SYSTEM.md'),
    re: /components\/sheet\/` \(\d+ files\)/,
    replace: () => `components/sheet/\` (${c.sheet} files)`
  },
  {
    path: join(DND_APP_ROOT, 'docs/PLUGIN-SYSTEM.md'),
    re: /components\/builder\/` \(\d+ files/,
    replace: () => `components/builder/\` (${c.builder} files`
  },
  {
    path: join(DND_APP_ROOT, 'docs/PLUGIN-SYSTEM.md'),
    re: /components\/levelup\/` \(\d+ files\)/,
    replace: () => `components/levelup/\` (${c.levelup} files)`
  },
  {
    path: join(DND_APP_ROOT, 'docs/PLUGIN-SYSTEM.md'),
    re: /services\/combat\/` \(\d+ files\)/,
    replace: () => `services/combat/\` (${c.combat} files)`
  }
]

let changed = 0
let missing = 0
for (const { path, re, replace } of sites) {
  if (!existsSync(path)) {
    console.log(`! sync-doc-counts: ${path} not found — skipped`)
    continue
  }
  const before = readFileSync(path, 'utf-8')
  const matched = re.test(before)
  // RegExp.test advances lastIndex on /g regexes — reset so .replace re-scans.
  re.lastIndex = 0
  const after = before.replace(re, replace)
  if (!matched) {
    // A genuine miss — the doc phrasing changed and the regex needs updating.
    console.log(`⚠ sync-doc-counts: NO MATCH for ${re} in ${path} (regex may be stale)`)
  } else if (after === before) {
    // Matched but already at the right value — idempotent no-op.
    console.log(`= sync-doc-counts: ${path} already up to date for ${re}`)
  } else {
    writeFileSync(path, after)
    changed += 1
    console.log(`✓ sync-doc-counts: updated ${path}`)
  }
}
if (missing) console.log(`! ${missing} site(s) missing`)
console.log(
  `Counts: version=${appVersion}, dnd test files=${c.dndTestFiles}, sheet=${c.sheet}, builder=${c.builder}, ` +
    `levelup=${c.levelup}, combat=${c.combat}, bmo tests=${c.bmoTestFiles}, agents=${bmoAgents}, ` +
    `dm actions=${ai.dmActions}, stat changes=${ai.statChanges}, library json=${c.libraryJson}. ` +
    `Updated ${changed} site(s).`
)
