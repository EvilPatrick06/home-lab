import { describe, expect, it } from 'vitest';
import {
  buildCertificateText,
  certificateFilename,
  isTomeMastered,
  MASTERY_THRESHOLD,
  renderCertificatePng,
  tomeMasteryPct,
} from './certificate.js';

const mastered = { reps: 3, stability: 30 };
const young = { reps: 1, stability: 2 };

function tomeWith(n) {
  return { flashcards: Array.from({ length: n }, (_, i) => ({ id: `c${i}` })) };
}

describe('tomeMasteryPct', () => {
  it('is 0 for an empty/invalid tome', () => {
    expect(tomeMasteryPct({}, { flashcards: [] })).toBe(0);
    expect(tomeMasteryPct(null, null)).toBe(0);
  });

  it('counts only cards reviewed >=2x with stability >= 7 days', () => {
    const tome = tomeWith(4);
    const progress = { cardProgress: { c0: mastered, c1: mastered, c2: young } };
    // 2 of 4 mastered -> 50%
    expect(tomeMasteryPct(progress, tome)).toBe(50);
  });

  it('reaches 100 when all cards are mastered', () => {
    const tome = tomeWith(3);
    const progress = { cardProgress: { c0: mastered, c1: mastered, c2: mastered } };
    expect(tomeMasteryPct(progress, tome)).toBe(100);
  });
});

describe('isTomeMastered', () => {
  it('requires the mastery threshold and at least one card', () => {
    const tome = tomeWith(5);
    const four = { cardProgress: { c0: mastered, c1: mastered, c2: mastered, c3: mastered } };
    expect(tomeMasteryPct(four, tome)).toBe(80);
    expect(MASTERY_THRESHOLD).toBe(80);
    expect(isTomeMastered(four, tome)).toBe(true);

    const three = { cardProgress: { c0: mastered, c1: mastered, c2: mastered } };
    expect(isTomeMastered(three, tome)).toBe(false); // 60%
    expect(isTomeMastered({}, { flashcards: [] })).toBe(false);
  });
});

describe('buildCertificateText', () => {
  it('fills defaults and formats a date', () => {
    const t = buildCertificateText({
      scholarName: 'Patrick',
      tomeTitle: 'Network+ Fundamentals',
      title: 'Loremaster',
      masteryPct: 92,
      date: '2026-06-24T00:00:00Z',
    });
    expect(t.heading).toBe('Certificate of Mastery');
    expect(t.scholarName).toBe('Patrick');
    expect(t.tomeTitle).toBe('Network+ Fundamentals');
    expect(t.titleText).toBe('Loremaster');
    expect(t.masteryText).toBe('92% mastery attained');
    expect(t.dateText).toMatch(/2026/);
  });

  it('falls back gracefully on missing fields', () => {
    const t = buildCertificateText({});
    expect(t.scholarName).toBe('A Scholar');
    expect(t.tomeTitle).toBe('Untitled Tome');
    expect(t.masteryText).toBe('');
  });

  it('clamps mastery percent to 0..100', () => {
    expect(buildCertificateText({ masteryPct: 150 }).masteryText).toBe('100% mastery attained');
    expect(buildCertificateText({ masteryPct: -5 }).masteryText).toBe('0% mastery attained');
  });
});

describe('certificateFilename', () => {
  it('slugifies the tome title', () => {
    expect(certificateFilename({ tomeTitle: 'Network+ Fundamentals!' })).toBe(
      'dungeon-scholar-certificate-network-fundamentals.png',
    );
    expect(certificateFilename({})).toBe('dungeon-scholar-certificate-tome.png');
  });
});

describe('renderCertificatePng', () => {
  it('returns null or a data URL string without throwing (headless-safe)', () => {
    const r = renderCertificatePng({ scholarName: 'X', tomeTitle: 'Y', masteryPct: 88 });
    expect(r === null || typeof r === 'string').toBe(true);
  });
});
