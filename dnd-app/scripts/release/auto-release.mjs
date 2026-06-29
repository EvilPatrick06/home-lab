#!/usr/bin/env node
/**
 * Auto-cut a dnd-app DESKTOP release from the integrator.
 *
 * This is the unattended wrapper the daily/4-hourly integrator runs AFTER it has
 * merged the clean `auto/*` branches into `master` and pushed. It decides whether
 * the just-integrated changes warrant a release and, if so, reuses the existing
 * release helper (`cut.mjs`) to do the actual bump → commit → tag → push →
 * pre-create-draft-release dance. It NEVER reimplements the tag/publish path.
 *
 * Usage (run from the repo root or dnd-app/, on a clean `master`):
 *   node dnd-app/scripts/release/auto-release.mjs            # cut if warranted
 *   node dnd-app/scripts/release/auto-release.mjs --dry-run  # decide + print, don't cut
 *
 * Decision rules (see docs/AUTOMATED-AGENT-GIT-WORKFLOW.md "Release flow & CI"):
 *   TRIGGER  — release ONLY when real dnd-app *application source* changed since
 *              the last published release tag. Release-worthy = the INCLUDE
 *              globs below (dnd-app/src, package.json|lock, resources, index.html,
 *              electron.vite.config.ts, scripts/build) MINUS the EXCLUDE globs
 *              (tests, **\/*.md, dnd-app/docs/**, dnd-app/mobile/** — the mobile
 *              line versions separately). A run that integrated only docs / logs /
 *              QA reports / suggestion churn produces NO release.
 *   BUMP     — semver PATCH by default; MINOR when the integrated range added a
 *              completed PHASE plan under dnd-app/docs/phases/completed/ (a phase
 *              landing == a shipped feature, per INSTRUCTIONS.md rule 8).
 *   CADENCE  — one release per integrator run that has app changes (not batched).
 *   IDEMPOTENT — keyed on the latest tag: if master HEAD is already the tagged
 *              release commit, or nothing release-worthy changed since the tag,
 *              it no-ops. The same commit is therefore never released twice, so
 *              re-running the integrator can't release-storm.
 *
 * Exit code is ALWAYS 0 on a clean decision (cut OR skip) so a "nothing to
 * release" run never reds the integrator. Non-zero only on a real error
 * (cut.mjs failing, git unavailable, etc.).
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
// scripts/release/ -> scripts/ -> dnd-app/
const DND_APP_ROOT = join(SCRIPT_DIR, '..', '..')
// dnd-app/ -> repo root
const REPO_ROOT = join(DND_APP_ROOT, '..')

const DRY_RUN = process.argv.includes('--dry-run')

// ── release-worthiness pathspecs ────────────────────────────────────────────
// INCLUDE: things baked into / affecting the built desktop artifact.
const INCLUDE = [
  'dnd-app/src',
  'dnd-app/package.json',
  'dnd-app/package-lock.json',
  'dnd-app/resources',
  'dnd-app/index.html',
  'dnd-app/electron.vite.config.ts',
  'dnd-app/scripts/build'
]
// EXCLUDE (wins over INCLUDE): churn that never changes the shipped app.
const EXCLUDE = [
  ':(exclude,glob)dnd-app/**/*.test.ts',
  ':(exclude,glob)dnd-app/**/*.test.tsx',
  ':(exclude,glob)dnd-app/**/__tests__/**',
  ':(exclude,glob)dnd-app/**/__snapshots__/**',
  ':(exclude,glob)dnd-app/**/*.md',
  ':(exclude,glob)dnd-app/docs/**',
  ':(exclude,glob)dnd-app/mobile/**'
]

// ── helpers ─────────────────────────────────────────────────────────────────

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8', ...opts }).trim()
}

function gitSafe(args) {
  try {
    return git(args)
  } catch {
    return ''
  }
}

function decision(verb, msg) {
  // A single, grep-able line the integrator surfaces in its completion summary.
  console.log(`AUTO-RELEASE ${verb}: ${msg}`)
}

function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim())
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3] }
}

function cmpSemver(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

function fmt(s) {
  return `${s.major}.${s.minor}.${s.patch}`
}

// ── 0. sanity: on master, clean tree ────────────────────────────────────────

// In --dry-run we only read git history and print a decision, so the on-master /
// clean-tree guards are advisory (warn, don't exit) — that makes the decision
// logic testable from any branch/worktree. A real cut still hard-requires them.
const branch = gitSafe(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'master') {
  if (!DRY_RUN) {
    decision('SKIP', `not on master (on "${branch}") — auto-release only runs on master`)
    process.exit(0)
  }
  console.log(`(dry-run on "${branch}", not master — decision shown anyway)`)
}

const dirty = gitSafe(['status', '--porcelain'])
if (dirty && !DRY_RUN) {
  // cut.mjs requires a clean tree; the integrator should call this only when
  // clean. Skip rather than fail so a stray dirty state never reds the run.
  decision('SKIP', 'working tree not clean — refusing to auto-release (commit/clean first)')
  process.exit(0)
}

// Make sure we can see all remote tags before picking "the last release".
gitSafe(['fetch', '--tags', '--quiet', 'origin'])

// ── 1. last published release tag ───────────────────────────────────────────

const allTags = gitSafe(['tag', '--list', 'v*.*.*']).split('\n').filter(Boolean)
const semverTags = allTags
  .map((t) => ({ tag: t, ver: parseSemver(t) }))
  .filter((x) => x.ver)
  .sort((a, b) => cmpSemver(a.ver, b.ver))

const lastTag = semverTags.length ? semverTags[semverTags.length - 1].tag : null

// ── 2. idempotency guard A — HEAD already released ──────────────────────────

const head = git(['rev-parse', 'HEAD'])
if (lastTag) {
  const tagCommit = gitSafe(['rev-list', '-n', '1', lastTag])
  if (tagCommit && tagCommit === head) {
    decision('SKIP', `master HEAD (${head.slice(0, 12)}) is already release ${lastTag} — nothing new to ship`)
    process.exit(0)
  }
}

// Range we evaluate: lastTag..HEAD (or the whole history if there is no tag yet).
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const sinceLabel = lastTag || '(repo start)'

// ── 3. release-worthiness ────────────────────────────────────────────────────

const diffArgs = ['diff', '--name-only', ...(lastTag ? [lastTag, 'HEAD'] : ['HEAD']), '--', ...INCLUDE, ...EXCLUDE]
const changed = git(diffArgs).split('\n').filter(Boolean)

if (changed.length === 0) {
  decision('SKIP', `no release-worthy dnd-app source changed since ${sinceLabel} (docs/log/QA churn only) — no release`)
  process.exit(0)
}

// ── 4. bump type — MINOR if a phase landed, else PATCH ──────────────────────

const phaseStatus = lastTag
  ? gitSafe(['diff', '--name-status', lastTag, 'HEAD', '--', 'dnd-app/docs/phases/completed/'])
  : gitSafe(['diff', '--name-status', '--', 'dnd-app/docs/phases/completed/'])

const completedPhases = phaseStatus
  .split('\n')
  .filter(Boolean)
  .filter((l) => /^(A|R\d*)\b/.test(l) && /\/PHASE-[^/]*\.md$/.test(l))
  .map((l) => l.split(/\s+/).pop())
  .filter(Boolean)

const bumpType = completedPhases.length > 0 ? 'minor' : 'patch'

// ── 5. compute next version (base = max(lastTag, package.json)) ─────────────

const pkgPath = join(DND_APP_ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const pkgVer = parseSemver(pkg.version)
const tagVer = lastTag ? parseSemver(lastTag) : null

let base = pkgVer || tagVer
if (tagVer && (!base || cmpSemver(tagVer, base) > 0)) base = tagVer
if (pkgVer && cmpSemver(pkgVer, base) > 0) base = pkgVer
if (!base) {
  decision('ERROR', `cannot parse a base version from tag "${lastTag}" or package.json "${pkg.version}"`)
  process.exit(1)
}

function bump(v, type) {
  if (type === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 }
  return { major: v.major, minor: v.minor, patch: v.patch + 1 }
}

let next = bump(base, bumpType)
// Defensive: never collide with an existing tag (e.g. a pre-bumped pkg). Walk
// the patch up until the tag is free.
const taken = new Set(semverTags.map((x) => fmt(x.ver)))
while (taken.has(fmt(next))) {
  next = { major: next.major, minor: next.minor, patch: next.patch + 1 }
}
const nextVer = fmt(next)

// ── 6. release notes (the living changelog == the GitHub Release body) ──────
// Repo convention (docs/CHANGELOG.md): the GitHub Releases page is the living
// changelog; cut.mjs --notes-file writes the body. We assemble it here from the
// integrated range so every cut ships real notes.

const logArgs = ['log', '--no-merges', '--pretty=format:- %s', ...(lastTag ? [range] : ['HEAD']), '--', ...INCLUDE, ...EXCLUDE]
const appCommits = git(logArgs).split('\n').filter(Boolean)
const mergeCount = gitSafe(['rev-list', '--count', '--merges', lastTag ? range : 'HEAD'])

const notesLines = []
notesLines.push(
  bumpType === 'minor'
    ? `**Auto-release ${nextVer} (minor)** — integrated feature work since ${sinceLabel}.`
    : `**Auto-release ${nextVer} (patch)** — integrated fixes/changes since ${sinceLabel}.`
)
notesLines.push('')
if (completedPhases.length) {
  notesLines.push('**Phases completed in this release:**')
  for (const p of completedPhases) {
    notesLines.push(`- ${p.replace('dnd-app/docs/phases/completed/', '').replace(/\.md$/, '')}`)
  }
  notesLines.push('')
}
notesLines.push('**Application changes (dnd-app source):**')
if (appCommits.length) {
  // Cap the list so a large backlog cut stays readable; full history is in git.
  const MAX = 60
  notesLines.push(...appCommits.slice(0, MAX))
  if (appCommits.length > MAX) notesLines.push(`- …and ${appCommits.length - MAX} more (see git log ${range}).`)
} else {
  notesLines.push('- (no non-merge commit subjects touched app source in range)')
}
notesLines.push('')
notesLines.push(
  `_Cut automatically by the integrator from ${head.slice(0, 12)} on master ` +
    `(${changed.length} release-worthy file(s) changed, ${mergeCount || '0'} merge(s) since ${sinceLabel})._`
)
const notes = `${notesLines.join('\n')}\n`

const notesFile = join(mkdtempSync(join(tmpdir(), 'auto-release-')), `v${nextVer}-notes.md`)
writeFileSync(notesFile, notes)

// ── 7. decide / cut ──────────────────────────────────────────────────────────

decision(
  'PLAN',
  `${sinceLabel} → v${nextVer} (${bumpType}); ` +
    `${changed.length} release-worthy file(s); ` +
    `${completedPhases.length} phase(s) completed; notes at ${notesFile}`
)

if (DRY_RUN) {
  console.log('\n----- release notes (dry-run, not cutting) -----')
  console.log(notes)
  console.log('------------------------------------------------')
  decision('DRY-RUN', `would run: node dnd-app/scripts/release/cut.mjs ${nextVer} --notes-file ${notesFile}`)
  process.exit(0)
}

// Reuse the existing helper for the bump + commit + tag + push + draft-create.
const cutScript = join(SCRIPT_DIR, 'cut.mjs')
try {
  execFileSync('node', [cutScript, nextVer, '--notes-file', notesFile], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  })
} catch (err) {
  decision('ERROR', `cut.mjs failed for v${nextVer} — release NOT cut: ${err?.message ?? err}`)
  process.exit(1)
}

decision('CUT', `v${nextVer} (${bumpType}) cut — Release workflow now builds + publishes once assets verify.`)
process.exit(0)
