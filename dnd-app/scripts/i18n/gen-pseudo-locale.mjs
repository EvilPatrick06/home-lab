#!/usr/bin/env node
// Phase R3 — generate the en-XA pseudo-locale from en.json.
//
// en-XA ("accented English") is a TEST locale: every string value is
// transliterated to accented look-alikes and bracketed/padded, so it is
// trivially distinguishable from real English at a glance while remaining
// readable. It is auto-generated (NO human translation) with 100% key coverage
// by construction, so the language picker has a real second locale to exercise
// and `locale-parity.test.ts` can prove the key sets never drift.
//
// Rules:
//   - Accent only LETTERS; leave digits/punctuation/whitespace alone.
//   - Skip `{{interpolation}}` spans entirely (never accent inside them, or
//     i18next interpolation breaks).
//   - Leave the KEY structure (incl. i18next `_one`/`_other` plural suffixes)
//     untouched — only VALUES are transformed.
//   - Wrap each value in `[‹ … ›]` and pad ~30% with the filler char to surface
//     layout/truncation bugs.
//
// Usage: node scripts/i18n/gen-pseudo-locale.mjs   (writes locales/en-XA.json)

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(here, '..', '..', 'src', 'renderer', 'src', 'i18n', 'locales')
const enPath = join(localesDir, 'en.json')
const outPath = join(localesDir, 'en-XA.json')

const ACCENT = {
  a: 'å', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ',
  k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ô', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ',
  u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ',
  K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ô', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ',
  U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž'
}

// Split a string into `{{...}}` interpolation spans (kept verbatim) and the
// plain text between them (accented).
const INTERP = /(\{\{[^}]*\}\}|\$t\([^)]*\))/g

function accentSegment(s) {
  return s.replace(/[A-Za-z]/g, (ch) => ACCENT[ch] ?? ch)
}

function transform(value) {
  const parts = value.split(INTERP)
  const accented = parts
    .map((part, i) => (i % 2 === 1 ? part : accentSegment(part)))
    .join('')
  // Pad ~30% (by letter count) with a filler to expose truncation, then bracket.
  const letters = (value.match(/[A-Za-z]/g) ?? []).length
  const padCount = Math.round(letters * 0.3)
  const pad = padCount > 0 ? ` ${'·'.repeat(padCount)}` : ''
  return `[‹${accented}${pad}›]`
}

function deepMap(node) {
  if (typeof node === 'string') return transform(node)
  if (Array.isArray(node)) return node.map(deepMap)
  if (node && typeof node === 'object') {
    const out = {}
    for (const k of Object.keys(node)) out[k] = deepMap(node[k])
    return out
  }
  return node
}

const en = JSON.parse(readFileSync(enPath, 'utf8'))
const enXA = deepMap(en)
writeFileSync(outPath, `${JSON.stringify(enXA, null, 2)}\n`)
console.log(`✓ wrote ${outPath}`)
