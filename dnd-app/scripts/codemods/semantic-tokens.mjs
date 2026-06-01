#!/usr/bin/env node
/**
 * Codemod: migrate a CURATED, unambiguous set of raw Tailwind color classes to
 * the semantic color-token utilities defined in styles/globals.css (@theme).
 *
 * Run:  node scripts/codemods/semantic-tokens.mjs           # apply + report
 *       node scripts/codemods/semantic-tokens.mjs --dry-run  # report only
 *
 * WHY: ~9.6k className color literals make app-wide re-theming and design
 * tweaks a find-and-replace slog. Routing the standard surface/border/text/
 * accent grays + ambers through semantic tokens (bg-surface, text-muted,
 * border-border, text-accent, …) makes those surfaces themeable from one place.
 *
 * ZERO VISUAL REGRESSION is the hard constraint: every mapping below targets a
 * semantic token whose DEFAULT value is the *exact same* color as the class it
 * replaces (e.g. bg-gray-900 → bg-surface, where --color-surface = gray-900).
 * Classes whose nearest token would be a *different* gray (gray-200/300/500/600,
 * border-gray-800, …) are intentionally LEFT ALONE — remapping them would shift
 * the pixel. Likewise context-specific semantic colors (damage reds, status
 * greens/yellows) are NOT migrated; they carry meaning, not surface styling.
 *
 * SAFETY: replacements run on the full file text but only match whole class
 * tokens — an optional chain of variant prefixes (hover:, focus:, md:, dark:,
 * group-hover:, …) + the base utility + an optional /opacity modifier — bounded
 * by a non-class-char (or string/quote/whitespace) on each side, so we never
 * touch substrings inside unrelated identifiers.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// scripts/codemods/ → dnd-app root → renderer source
const SRC_ROOT = join(__dirname, '..', '..', 'src', 'renderer', 'src')

const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Curated base-utility → semantic-utility mappings. Each pair is color-identical
 * in the default theme. Keys/values are the BASE class (no variant prefix, no
 * /opacity modifier); the regex preserves any `hover:`/`md:`/… prefix and any
 * `/50` opacity suffix around the swap.
 */
const MAPPINGS = {
  // Surfaces
  'bg-gray-950': 'bg-base', // gray-950  #030712
  'bg-gray-900': 'bg-surface', // gray-900  #111827
  'bg-gray-800': 'bg-surface-2', // gray-800  #1f2937
  // Accent (brand amber) backgrounds
  'bg-amber-400': 'bg-accent', // amber-400 #fbbf24
  'bg-amber-500': 'bg-accent-strong', // amber-500 #f59e0b
  // Borders — only gray-700 (the default border weight) maps cleanly.
  'border-gray-700': 'border-border', // gray-700  #374151
  'border-amber-400': 'border-accent', // amber-400 #fbbf24
  // Text
  'text-gray-100': 'text-fg', // gray-100  #f3f4f6 (primary text)
  'text-gray-400': 'text-muted', // gray-400  #9ca3af (secondary text)
  'text-amber-400': 'text-accent', // amber-400 #fbbf24
  'text-amber-500': 'text-accent-strong' // amber-500 #f59e0b
}

// Class chars that may appear in a Tailwind variant prefix or opacity modifier.
// We require a non-class-char boundary on each side so we only swap whole tokens.
const BOUNDARY = String.raw`(?<![\w-])` // left: not preceded by a class char
// right boundary: end of the optional /opacity modifier, then a non-modifier char
// (whitespace, quote, backtick, brace, etc.) — handled inline per-pattern.

/** Build the per-mapping regex. Captures any variant-prefix chain + opacity. */
function buildRegex(base) {
  // (?:[\w-]+:)* → zero or more `variant:` prefixes (hover:, group-hover:, md:, …)
  // (?:\/[0-9]+)? → optional /opacity modifier
  return new RegExp(`${BOUNDARY}((?:[\\w-]+:)*)${escapeRegex(base)}((?:\\/[0-9]+)?)(?![\\w-])`, 'g')
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const COMPILED = Object.entries(MAPPINGS).map(([from, to]) => ({ from, to, re: buildRegex(from) }))

/** Recursively collect every .tsx file under SRC_ROOT. */
function collectTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      collectTsx(full, out)
    } else if (extname(name) === '.tsx') {
      out.push(full)
    }
  }
  return out
}

const files = collectTsx(SRC_ROOT)
const perMapping = Object.fromEntries(Object.keys(MAPPINGS).map((k) => [k, 0]))
let filesChanged = 0
let totalSites = 0

for (const file of files) {
  const before = readFileSync(file, 'utf-8')
  let after = before
  for (const { from, to, re } of COMPILED) {
    after = after.replace(re, (_full, prefix, opacity) => {
      perMapping[from] += 1
      totalSites += 1
      return `${prefix}${to}${opacity}`
    })
  }
  if (after !== before) {
    filesChanged += 1
    if (!DRY_RUN) writeFileSync(file, after, 'utf-8')
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const mode = DRY_RUN ? 'DRY RUN (no files written)' : 'APPLIED'
console.log(`\nsemantic-tokens codemod — ${mode}`)
console.log(`scanned ${files.length} .tsx files under src/renderer/src\n`)
console.log('per-mapping site counts:')
for (const [from, to] of Object.entries(MAPPINGS)) {
  console.log(`  ${from.padEnd(18)} → ${to.padEnd(18)} ${perMapping[from]}`)
}
console.log(`\ntotal sites changed: ${totalSites}`)
console.log(`files changed:       ${filesChanged}\n`)
