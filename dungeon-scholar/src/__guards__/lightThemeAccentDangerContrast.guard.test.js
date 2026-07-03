import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// PHASE-10 (QA run-4): node-side static guard for the light-theme accent-text
// and danger-button contrast fixes. No DOM — happy-dom does not parse oklch()
// or composite rgba(), so we assert the source no longer carries the failing
// classes/literals on the named surfaces and that the theme tokens exist.

// This guard lives in src/__guards__/; srcRoot points at src/ (one level up).
const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(srcRoot, rel), 'utf8');
const css = read('index.css');

describe('PHASE-10 F1 — --text-accent-muted token + utilities', () => {
  it(':root declares the muted-accent token routed through the amber-700 ramp (Dark byte-identical)', () => {
    expect(css).toMatch(/--text-accent-muted:\s*var\(--color-amber-700\)/);
  });
  it('light theme overrides the token to dark ink', () => {
    const idx = css.indexOf('html[data-theme="light"]');
    expect(idx).toBeGreaterThan(-1);
    expect(css.slice(idx)).toMatch(/--text-accent-muted:\s*#92400e/);
  });
  it('defines the .text-accent-muted utility + opacity variants', () => {
    expect(css).toMatch(/\.text-accent-muted\s*\{/);
    for (const n of [80, 70, 60, 50, 40]) {
      expect(css.includes(`.text-accent-muted-${n}`), `missing .text-accent-muted-${n}`).toBe(true);
    }
  });
  it('darkens the Bestiary biome heading inline accent in light theme', () => {
    expect(css).toMatch(/html\[data-theme="light"\]\s*\.biome-heading/);
  });
});

describe('PHASE-10 F1 — converted accent-label surfaces', () => {
  const surfaces = {
    'App.jsx': 'App.jsx',
    InventoryScreen: 'features/progression/InventoryScreen.jsx',
    ShopScreen: 'features/progression/ShopScreen.jsx',
    BestiaryScreen: 'features/progression/BestiaryScreen.jsx',
  };
  for (const [name, rel] of Object.entries(surfaces)) {
    it(`${name} uses the muted-accent utility`, () => {
      expect(read(rel)).toMatch(/text-accent-muted/);
    });
  }
  it('Bestiary <h3> carries the biome-heading class', () => {
    expect(read('features/progression/BestiaryScreen.jsx')).toMatch(/biome-heading/);
  });
});

describe('PHASE-10 F2 — danger buttons route through --surface-red', () => {
  const buttons = [
    'features/home/HomeScreen.jsx',
    'features/library/LibraryScreen.jsx',
    'components/TomeNotes.jsx',
    'features/study/ChatMode.jsx',
    'features/study/LabMode.jsx',
    'features/study/QuizMode.jsx',
  ];
  for (const rel of buttons) {
    it(`${rel} button background uses rgba(var(--surface-red,...))`, () => {
      expect(read(rel)).toMatch(/rgba\(var\(--surface-red, 41, 12, 12\)/);
    });
  }
  it('HomeScreen has no single-line hardcoded dark-red button background left', () => {
    // the two difficulty-badge backgrounds are intentionally dark-in-both
    // (fixed #fca5a5 text) and use a multi-line style object ending in a comma,
    // so the exact single-line button literal (ending in "' }}") must be gone.
    expect(read('features/home/HomeScreen.jsx')).not.toContain("rgba(41, 12, 12, 0.7)' }}");
  });
});

// 2026-06-30 follow-up round (ISSUES-LOG "Light-theme muted accent-label
// wash-out persists on non-enumerated screens"): same static-guard style as
// PHASE-10 F1/F2 above, extended to the screens QA run-4 did not enumerate.
describe('2026-06-30 follow-up — muted-accent conversion on non-enumerated screens', () => {
  const screens = [
    'features/progression/AscensionScreen.jsx',
    'features/progression/RunHistoryScreen.jsx',
    'features/progression/SpellbookScreen.jsx',
    'features/progression/CalendarScreen.jsx',
    'features/progression/StableScreen.jsx',
    'features/progression/CraftingScreen.jsx',
  ];
  for (const rel of screens) {
    it(`${rel} uses the muted-accent utility and carries no raw text-amber-700`, () => {
      const src = read(rel);
      expect(src).toMatch(/text-accent-muted/);
      expect(src).not.toMatch(/text-amber-700/);
    });
  }

  it('App.jsx (home-hero subtitle + card corner glyphs) carries no raw text-amber-700', () => {
    expect(read('App.jsx')).not.toMatch(/text-amber-700/);
  });

  it('Bestiary boss lore-tier hint darkens via .biome-accent-text in light theme', () => {
    expect(read('features/progression/BestiaryScreen.jsx')).toMatch(/biome-accent-text/);
    expect(css).toMatch(/html\[data-theme="light"\]\s*\.biome-accent-text/);
  });

  it('flashcard SRS rating buttons route through the raised surface triplets', () => {
    const src = read('features/study/FlashcardsMode.jsx');
    expect(src).toContain('rgba(var(--surface-red-raised, 127, 29, 29), 0.55)');
    expect(src).toContain('rgba(var(--surface-amber-raised, 146, 64, 14), 0.55)');
    for (const t of ['--surface-red-raised', '--surface-amber-raised']) {
      const first = css.indexOf(`${t}:`);
      expect(first, `${t} missing`).toBeGreaterThan(-1);
      // declared twice: dark :root value + light-theme override
      expect(css.indexOf(`${t}:`, first + 1), `${t} has no light override`).toBeGreaterThan(-1);
    }
  });
});
