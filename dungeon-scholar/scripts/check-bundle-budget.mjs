#!/usr/bin/env node
// check-bundle-budget.mjs — advisory initial-bundle-size budget for dungeon-scholar.
//
// WHY: the app invests in a small initial bundle (manualChunks vendor split,
// React.lazy per screen, no eager KaTeX/Mermaid). Nothing in CI prevented a
// regression — a heavy dep landing in the initial chunk would pass green. This
// script asserts the largest single initial JS chunk in dist/ stays under a
// committed budget. See SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md "CI has no ... bundle-size budget".
//
// ADVISORY FIRST: exits 0 (warn only) by default so it reports without gating,
// matching the repo's incremental-tightening posture. Pass --strict (or set
// BUNDLE_BUDGET_STRICT=1) to make an over-budget chunk a non-zero exit once the
// budget has proven stable. Run after `vite build`.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.BUNDLE_DIST_DIR || 'dist';
const ASSETS = join(DIST, 'assets');
// Budget for the single largest initial JS chunk (KB). Generous to start; ratchet down.
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB || 600);
const STRICT = process.env.BUNDLE_BUDGET_STRICT === '1' || process.argv.includes('--strict');

let files;
try {
  files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`bundle-budget: no build output at ${ASSETS} — run \`npm run build\` first.`);
  process.exit(STRICT ? 1 : 0);
}

const sized = files
  .map((f) => ({ f, kb: statSync(join(ASSETS, f)).size / 1024 }))
  .sort((a, b) => b.kb - a.kb);

if (sized.length === 0) {
  console.error('bundle-budget: no .js chunks found in dist/assets.');
  process.exit(STRICT ? 1 : 0);
}

const largest = sized[0];
console.log(`bundle-budget: largest JS chunk = ${largest.f} @ ${largest.kb.toFixed(1)} KB (budget ${BUDGET_KB} KB)`);
console.log('bundle-budget: top chunks:');
for (const { f, kb } of sized.slice(0, 5)) console.log(`  ${kb.toFixed(1).padStart(8)} KB  ${f}`);

if (largest.kb > BUDGET_KB) {
  const msg = `bundle-budget: OVER BUDGET — ${largest.f} is ${largest.kb.toFixed(1)} KB > ${BUDGET_KB} KB.`;
  if (STRICT) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`${msg} (advisory — not failing the build)`);
}
process.exit(0);