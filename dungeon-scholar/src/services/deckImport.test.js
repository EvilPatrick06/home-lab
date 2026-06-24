import { describe, expect, it } from 'vitest';
import { deckTextToTome, detectDelimiter, parseDelimited } from './deckImport.js';

describe('detectDelimiter', () => {
  it('picks tab when tabs are present (Quizlet export)', () => {
    expect(detectDelimiter('term\tdefinition\nfoo\tbar')).toBe('\t');
  });
  it('falls back to comma otherwise', () => {
    expect(detectDelimiter('front,back\nfoo,bar')).toBe(',');
  });
});

describe('parseDelimited', () => {
  it('parses simple comma rows', () => {
    expect(parseDelimited('a,b\nc,d', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('honors quoted fields containing commas and escaped quotes', () => {
    const rows = parseDelimited('"hello, world","she said ""hi"""', ',');
    expect(rows).toEqual([['hello, world', 'she said "hi"']]);
  });

  it('parses tab rows and drops blank lines', () => {
    expect(parseDelimited('a\tb\n\nc\td\n', '\t')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('deckTextToTome', () => {
  it('rejects empty input', () => {
    expect(deckTextToTome('').ok).toBe(false);
    expect(deckTextToTome('   ').ok).toBe(false);
  });

  it('rejects input with no usable two-column rows', () => {
    const res = deckTextToTome('justonecolumn\nanother');
    expect(res.ok).toBe(false);
  });

  it('converts CSV into a tome with flashcards', () => {
    const res = deckTextToTome('What is 2+2?,Four\nCapital of France,Paris', { title: 'Mixed' });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(2);
    expect(res.tome.metadata.title).toBe('Mixed');
    expect(res.tome.flashcards).toHaveLength(2);
    expect(res.tome.flashcards[0].front).toBe('What is 2+2?');
    expect(res.tome.flashcards[0].back).toBe('Four');
    expect(Array.isArray(res.tome.quiz)).toBe(true);
    // every card gets a unique id
    const ids = new Set(res.tome.flashcards.map((c) => c.id));
    expect(ids.size).toBe(2);
  });

  it('skips a header row and reads a 3rd column as domain', () => {
    const res = deckTextToTome('front,back,category\nWhat is HTTP?,HyperText Transfer Protocol,Web');
    expect(res.ok).toBe(true);
    expect(res.count).toBe(1);
    expect(res.tome.flashcards[0].domain).toBe('Web');
  });

  it('parses Quizlet tab export', () => {
    const res = deckTextToTome('mitochondria\tpowerhouse of the cell\nribosome\tprotein synthesis');
    expect(res.ok).toBe(true);
    expect(res.count).toBe(2);
    expect(res.tome.flashcards[1].front).toBe('ribosome');
    expect(res.tome.metadata.description).toMatch(/Quizlet/);
  });

  it('defaults the title when none supplied', () => {
    const res = deckTextToTome('a,b');
    expect(res.tome.metadata.title).toBe('Imported deck');
  });
});
