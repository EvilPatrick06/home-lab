import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// issue-light-theme-gold-buttons (2026-07-15, owner-approved): the gold
// action-button family uses a fixed inline gradient (#fde047 -> #f59e0b) that
// never re-themes, so its label must NOT ride the light-theme-inverted amber
// ramp (text-amber-950 flips to near-white on light -> light-on-gold). Labels
// on gold gradients route through .btn-gold-ink (non-inverting amber-950 hex)
// or an inline non-var hex. Static source guard: this light-theme contrast
// family (PHASE-03/10/12 + the 2026-06-29 issue entry) is exactly the class of
// regression happy-dom cannot see.
const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLD = '#fde047';

function jsxSources(dir = srcRoot, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsxSources(p, acc);
    else if (name.endsWith('.jsx') && !name.includes('.test.')) acc.push(p);
  }
  return acc;
}

describe('gold action-button ink is non-inverting', () => {
  it('index.css defines .btn-gold-ink with the fixed amber-950 hex', () => {
    const css = readFileSync(join(srcRoot, 'index.css'), 'utf8');
    expect(css).toMatch(/\.btn-gold-ink \{\n {2}color: #451a03;\n\}/);
    // exactly one mention: no per-theme override (non-inverting by construction)
    expect((css.match(/btn-gold-ink/g) || []).length).toBe(1);
  });

  it('no JSX pairs ramp-inverted text-amber-950 with the gold gradient', () => {
    const offenders = [];
    for (const f of jsxSources()) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (!ln.includes('text-amber-950')) return;
        const ctx = lines.slice(Math.max(0, i - 10), i + 11).join('\n');
        if (ctx.includes(GOLD)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
