import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 41 (QA16): node-side guard for the full light theme. No DOM — we read
// src/index.css and statically scan the JSX for Tailwind color utilities, then
// assert that every used `family-step` pair has a matching `--color-*` override
// inside the html[data-theme="light"] inverted-ramp block, and that the
// surface triplet + focus tokens exist in BOTH the dark `:root` defaults and
// the light override.

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'index.css'), 'utf8');

// The 14 color families + 11 ramp steps the build script mirrors. Kept in sync
// with the generator in the PHASE-41 plan / index.css comment header.
const FAMILIES =
  'amber|purple|emerald|red|sky|indigo|rose|stone|orange|yellow|zinc|cyan|blue|slate';
const STEPS = '50|100|200|300|400|500|600|700|800|900|950';
// Trailing (?![0-9]) so the "50" alternative does not match inside "500" etc.
// (regex alternation is leftmost-first, so "50" would otherwise capture the
// first two digits of "border-red-500" and mis-classify it as red-50).
const UTIL_RE = new RegExp(
  `(?:text|bg|border|from|to|via|ring|outline|fill|stroke|shadow)-(${FAMILIES})-(${STEPS})(?![0-9])`,
  'g'
);

const SURFACES = [
  '--surface-deep',
  '--surface-amber',
  '--surface-amber-strong',
  '--surface-purple',
  '--surface-emerald',
  '--surface-modal',
];

/** Recursively collect every .jsx file under a directory. */
function collectJsx(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsx(full));
    else if (entry.isFile() && entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

/** Slice the FIRST `html[data-theme="light"] { ... }` block whose body
 *  contains the marker substring (so we target the ramp block specifically). */
function sliceLightBlock(source, marker) {
  let from = 0;
  const sel = 'html[data-theme="light"] {';
  while (true) {
    const start = source.indexOf(sel, from);
    if (start === -1) return null;
    const open = source.indexOf('{', start);
    const close = source.indexOf('}', open);
    if (close === -1) return null;
    const body = source.slice(open + 1, close);
    if (!marker || body.includes(marker)) return body;
    from = close + 1;
  }
}

/** Slice the `:root { ... }` block whose body contains the marker. */
function sliceRootBlock(source, marker) {
  let from = 0;
  while (true) {
    const start = source.indexOf(':root {', from);
    if (start === -1) return null;
    const open = source.indexOf('{', start);
    const close = source.indexOf('}', open);
    if (close === -1) return null;
    const body = source.slice(open + 1, close);
    if (!marker || body.includes(marker)) return body;
    from = close + 1;
  }
}

const jsxFiles = collectJsx(here);
const usedPairs = new Set();
for (const f of jsxFiles) {
  const text = readFileSync(f, 'utf8');
  let m;
  UTIL_RE.lastIndex = 0;
  while ((m = UTIL_RE.exec(text)) !== null) {
    usedPairs.add(`${m[1]}-${m[2]}`);
  }
}

// The inverted-ramp block is the light block that declares --color-* vars.
const rampBlock = sliceLightBlock(css, '--color-amber-50');
// The surface/focus light override is the light block declaring --surface-deep.
const surfaceLightBlock = sliceLightBlock(css, '--surface-deep');
// The dark defaults live in the :root block holding the panel/surface vars.
const rootBlock = sliceRootBlock(css, '--surface-deep');

describe('Phase 41 light theme — inverted color ramps', () => {
  it('found JSX files to scan', () => {
    expect(jsxFiles.length).toBeGreaterThan(0);
  });

  it('found Tailwind color utilities in the JSX', () => {
    expect(usedPairs.size).toBeGreaterThan(0);
  });

  it('has an html[data-theme="light"] inverted-ramp block', () => {
    expect(rampBlock).not.toBeNull();
  });

  it('declares a --color-<family>-<step> override for every used utility', () => {
    expect(rampBlock).not.toBeNull();
    const missing = [];
    for (const pair of usedPairs) {
      if (!rampBlock.includes(`--color-${pair}:`)) missing.push(pair);
    }
    expect(missing, `missing light overrides: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('Phase 41 light theme — surface + focus tokens', () => {
  it('has a :root block declaring the surface defaults', () => {
    expect(rootBlock).not.toBeNull();
  });

  it('has an html[data-theme="light"] block declaring the surface overrides', () => {
    expect(surfaceLightBlock).not.toBeNull();
  });

  it('light block declares all six --surface-* triplets + --focus-ring', () => {
    expect(surfaceLightBlock).not.toBeNull();
    for (const s of SURFACES) {
      expect(surfaceLightBlock.includes(`${s}:`), `light missing ${s}`).toBe(true);
    }
    expect(surfaceLightBlock.includes('--focus-ring:')).toBe(true);
  });

  it(':root declares matching dark defaults for the six surfaces + --focus-ring', () => {
    expect(rootBlock).not.toBeNull();
    for (const s of SURFACES) {
      expect(rootBlock.includes(`${s}:`), `:root missing ${s}`).toBe(true);
    }
    expect(rootBlock.includes('--focus-ring:')).toBe(true);
  });
});
