import { describe, expect, it } from 'vitest';
import {
  dueCountExpanded,
  expandClozeCard,
  expandClozeDeck,
  hasCloze,
  parseClozeSpans,
  renderClozeText,
} from './cloze.js';

describe('hasCloze', () => {
  it('detects cloze spans', () => {
    expect(hasCloze('The port is {{c1::443}}.')).toBe(true);
    expect(hasCloze('bare {{answer}} works too')).toBe(true);
    expect(hasCloze('no cloze here')).toBe(false);
    expect(hasCloze(null)).toBe(false);
  });
});

describe('parseClozeSpans', () => {
  it('parses numbered clusters', () => {
    const spans = parseClozeSpans('{{c1::SYN}} then {{c2::ACK}}');
    expect(spans.map((s) => [s.cluster, s.answer])).toEqual([
      [1, 'SYN'],
      [2, 'ACK'],
    ]);
  });
  it('auto-numbers bare spans', () => {
    const spans = parseClozeSpans('{{one}} and {{two}}');
    expect(spans.map((s) => s.cluster)).toEqual([1, 2]);
  });
  it('supports an inline hint via ::', () => {
    const spans = parseClozeSpans('{{c1::443::the HTTPS port}}');
    expect(spans[0]).toMatchObject({ cluster: 1, answer: '443', hint: 'the HTTPS port' });
  });
  it('skips empty answers', () => {
    expect(parseClozeSpans('{{c1::}} x')).toEqual([]);
  });
});

describe('renderClozeText', () => {
  it('masks the target cluster and reveals the rest', () => {
    const text = 'Handshake: SYN -> {{c1::SYN-ACK}} -> {{c2::ACK}}';
    expect(renderClozeText(text, 1)).toBe('Handshake: SYN -> [...] -> ACK');
    expect(renderClozeText(text, 2)).toBe('Handshake: SYN -> SYN-ACK -> [...]');
  });
  it('shows the hint in the blank when present', () => {
    expect(renderClozeText('{{c1::443::HTTPS}}', 1)).toBe('[HTTPS]');
  });
});

describe('expandClozeCard', () => {
  it('expands one item per distinct cluster', () => {
    const items = expandClozeCard({ id: 'q7', text: '{{c1::SYN}} -> {{c2::ACK}}', domain: 'TCP' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'q7_c1', cluster: 1, back: 'SYN', domain: 'TCP', cloze: true });
    expect(items[0].acceptedAnswers).toEqual(['SYN']);
    expect(items[1].front).toContain('SYN');
  });
  it('groups same-cluster spans into one item with multiple accepted answers', () => {
    const items = expandClozeCard({ id: 'q', text: '{{c1::A}} and {{c1::B}}' });
    expect(items).toHaveLength(1);
    expect(items[0].acceptedAnswers).toEqual(['A', 'B']);
    expect(items[0].back).toBe('A, B');
  });
  it('returns [] for a non-cloze card', () => {
    expect(expandClozeCard({ id: 'q', text: 'plain text' })).toEqual([]);
    expect(expandClozeCard(null)).toEqual([]);
  });
  it('reads from front when text is absent', () => {
    const items = expandClozeCard({ id: 'q', front: 'The {{c1::answer}}' });
    expect(items).toHaveLength(1);
  });
});

describe('expandClozeDeck', () => {
  it('expands cloze cards and passes non-cloze cards through', () => {
    const deck = [
      { id: 'a', text: '{{c1::x}} {{c2::y}}' },
      { id: 'b', front: 'plain', back: 'card' },
    ];
    const out = expandClozeDeck(deck);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.id)).toEqual(['a_c1', 'a_c2', 'b']);
  });
});

describe('dueCountExpanded (issue-cloze-due-count)', () => {
  const cards = [
    { id: 'a', front: 'handshake: SYN -> {{c1::SYN-ACK}} -> {{c2::ACK}}', back: '' },
    { id: 'b', front: 'plain', back: 'card' },
  ];

  it('an unrated 2-cluster cloze card contributes 2 (plus 1 for the plain card)', () => {
    expect(dueCountExpanded({}, cards)).toBe(3); // a_c1 + a_c2 + b
  });

  it('a rated-out cloze card contributes 0 — progress is consulted on the expanded ids, not the raw id', () => {
    const rated = {
      stability: 10,
      difficulty: 5,
      reps: 3,
      lapses: 0,
      lastReview: Date.now(),
      dueAt: Date.now() + 7 * 86400000,
    };
    const map = { a_c1: rated, a_c2: rated, b: rated };
    expect(dueCountExpanded(map, cards)).toBe(0);
  });
});
