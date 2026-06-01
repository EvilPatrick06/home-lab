#!/usr/bin/env node
/**
 * Codemod: give every form control an accessible name.
 *
 * Run:  node scripts/codemods/form-aria-label.mjs            # apply + report
 *       node scripts/codemods/form-aria-label.mjs --dry-run   # report only
 *
 * Many <input>/<select>/<textarea> elements have a visible `placeholder` (often
 * a sibling visible <label> too) but no PROGRAMMATIC accessible name — no `id`
 * tying a <label htmlFor>, no `aria-label`, no `aria-labelledby`. Screen readers
 * then announce the control with no name. This codemod adds, ADDITIVELY:
 *
 *   aria-label={<the existing placeholder expression>}
 *
 * for exactly those controls (placeholder present, no name present). It mirrors
 * the StatBlockEditor / AiProviderSetup convention of pairing a control with an
 * explicit accessible name. It never overwrites an existing aria-label / id /
 * aria-labelledby, never touches controls that already have a name, and reuses
 * the same expression the placeholder already evaluates (usually a `t(...)` i18n
 * call), so no new strings are introduced.
 *
 * The placeholder text describes the field, so it is a correct accessible name;
 * where a visible <label> also exists, AT user agents prefer the explicit
 * aria-label, which is equivalent text — no double-announcement of distinct names.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_ROOT = join(__dirname, '..', '..', 'src', 'renderer', 'src')
const DRY_RUN = process.argv.includes('--dry-run')

function collectTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) collectTsx(full, out)
    else if (extname(name) === '.tsx' && !name.includes('.test.')) out.push(full)
  }
  return out
}

// Match an <input>/<select>/<textarea> opening tag (may span lines).
const TAG_RE = /<(input|select|textarea)\b([^>]*?)(\/?)>/gs

// Extract the placeholder attribute expression (string or {expr}) from attrs.
function extractPlaceholder(attrs) {
  // placeholder={...}  — balanced single-level braces (good enough for our tags)
  const exprMatch = attrs.match(/placeholder=\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/)
  if (exprMatch) return { kind: 'expr', value: exprMatch[1] }
  // placeholder="literal"
  const strMatch = attrs.match(/placeholder="([^"]*)"/)
  if (strMatch) return { kind: 'str', value: strMatch[1] }
  return null
}

function hasAccessibleName(attrs) {
  return /\baria-label[=}]|\baria-labelledby=|\bid=/.test(attrs)
}

const files = collectTsx(SRC_ROOT)
let sites = 0
let filesChanged = 0

for (const file of files) {
  const before = readFileSync(file, 'utf-8')
  let changedInFile = 0
  const after = before.replace(TAG_RE, (full, tag, attrs, selfClose) => {
    if (hasAccessibleName(attrs)) return full
    const ph = extractPlaceholder(attrs)
    if (!ph) return full
    const ariaAttr = ph.kind === 'expr' ? `aria-label={${ph.value}}` : `aria-label="${ph.value}"`
    // Insert right after the tag name, preserving the original attribute block.
    changedInFile += 1
    sites += 1
    return `<${tag} ${ariaAttr}${attrs}${selfClose}>`
  })
  if (changedInFile > 0) {
    filesChanged += 1
    if (!DRY_RUN) writeFileSync(file, after, 'utf-8')
  }
}

const mode = DRY_RUN ? 'DRY RUN (no files written)' : 'APPLIED'
console.log(`\nform-aria-label codemod — ${mode}`)
console.log(`scanned ${files.length} .tsx files under src/renderer/src`)
console.log(`aria-label added to ${sites} controls across ${filesChanged} files\n`)
