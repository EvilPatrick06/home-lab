import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PHASE-12 F1: the home Active-Tome panel's accent text must route through the
// light-theme ink vars (contrast is CSS-var driven and not unit-assertable in
// happy-dom, so these are static source guards — the manual two-theme check is
// the authoritative acceptance gate).
describe('active-tome panel light-theme ink (PHASE-12 F1)', () => {
  const home = readFileSync('src/features/home/HomeScreen.jsx', 'utf-8');
  const css = readFileSync('src/index.css', 'utf-8');

  it('tag pills route through --accent-gold-ink with the dark hex as fallback', () => {
    expect(home).toContain("color: 'var(--accent-gold-ink, #fcd34d)'");
    // the fixed hex must not appear as a bare (non-fallback) color anywhere
    expect(home).not.toContain("color: '#fcd34d'");
  });

  it('subject pill routes through --accent-purple-ink with the dark hex as fallback', () => {
    expect(home).toContain("color: 'var(--accent-purple-ink, #d8b4fe)'");
    expect(home).not.toContain("color: '#d8b4fe'");
  });

  it('eyebrow + meta strip carry the light-gated active-tome-accent class', () => {
    const matches = home.match(/active-tome-accent/g) || [];
    expect(matches.length).toBe(2);
    expect(home).toMatch(/text-amber-600[^"]*active-tome-accent[^"]*">⚔ ACTIVE TOME ⚔/);
    expect(home).toMatch(/text-amber-300\/80 active-tome-accent/);
  });

  it('index.css defines the ink vars light-only and the class-gated override', () => {
    expect(css).toMatch(/--accent-gold-ink: #92400e/);
    expect(css).toMatch(/--accent-purple-ink: #6b21a8/);
    // light-only: exactly one definition of each (inside the light block), no :root default
    expect((css.match(/--accent-gold-ink:/g) || []).length).toBe(1);
    expect((css.match(/--accent-purple-ink:/g) || []).length).toBe(1);
    expect(css).toMatch(
      /html\[data-theme="light"\] \.active-tome-accent \{\n {2}color: var\(--accent-gold-ink\) !important;/,
    );
  });

  it('intentionally-dark-in-both author/difficulty pills are untouched', () => {
    expect(home).toContain("color: '#93c5fd'");
    expect(home).toContain("color: '#fca5a5'");
  });
});
