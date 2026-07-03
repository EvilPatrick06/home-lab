import { describe, expect, it } from 'vitest';
import { csvQuoteField, deckTextToTome, detectDelimiter, exportTomeCsv, parseDelimited } from './deckImport.js';

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

describe('deckTextToTome mixed-delimiter robustness (PHASE-04 04B)', () => {
  it('imports all rows from a mixed comma/tab deck', () => {
    const text = 'What is 2+2?,Four\nCapital of France,Paris\nmitochondria\tpowerhouse of the cell';
    const res = deckTextToTome(text);
    expect(res.ok).toBe(true);
    expect(res.count).toBe(3);
    expect(res.skipped).toBe(0);
  });
  it('parses comma rows even when an early line contains a stray tab', () => {
    const text = 'note\tside\nWhat is 2+2?,Four\nCapital of France,Paris';
    const res = deckTextToTome(text);
    expect(res.ok).toBe(true);
    expect(res.count).toBe(3);
  });
  it('reports skipped rows alongside imported ones', () => {
    const res = deckTextToTome('good,card\nlonelyrow');
    expect(res.ok).toBe(true);
    expect(res.count).toBe(1);
    expect(res.skipped).toBe(1);
  });
  it('leaves pure CSV and pure TSV unchanged', () => {
    expect(deckTextToTome('a,b\nc,d').count).toBe(2);
    expect(deckTextToTome('a\tb\nc\td').count).toBe(2);
  });
});

describe('csvQuoteField (RFC-4180)', () => {
  it('leaves plain fields bare', () => {
    expect(csvQuoteField('hello')).toBe('hello');
    expect(csvQuoteField('')).toBe('');
    expect(csvQuoteField(null)).toBe('');
    expect(csvQuoteField(undefined)).toBe('');
  });
  it('quotes fields with commas, quotes, or newlines and doubles quotes', () => {
    expect(csvQuoteField('a,b')).toBe('"a,b"');
    expect(csvQuoteField('say "hi"')).toBe('"say ""hi"""');
    expect(csvQuoteField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('exportTomeCsv', () => {
  const tome = {
    data: {
      flashcards: [
        { id: 'a', front: 'SYN', back: 'first handshake', domain: 'TCP' },
        { id: 'b', front: 'Port, 443', back: 'HTTPS' },
        { id: 'c', front: 'quote "x"', back: 'line\nbreak', domain: 'Misc' },
      ],
    },
  };

  it('emits a header + one CRLF-separated row per card', () => {
    const csv = exportTomeCsv(tome);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('term,definition,domain');
    expect(lines[1]).toBe('SYN,first handshake,TCP');
    expect(lines[2]).toBe('"Port, 443",HTTPS,');
    expect(lines[3]).toBe('"quote ""x""","line\nbreak",Misc');
  });

  it('can omit the header', () => {
    const csv = exportTomeCsv({ data: { flashcards: [{ front: 'x', back: 'y' }] } }, { header: false });
    expect(csv).toBe('x,y,');
  });

  it('accepts a raw tome-data object as well as a library entry', () => {
    const csv = exportTomeCsv({ flashcards: [{ front: 'a', back: 'b', domain: 'D' }] });
    expect(csv.split('\r\n')[1]).toBe('a,b,D');
  });

  it('skips empty cards and returns just the header for an empty tome', () => {
    expect(exportTomeCsv({ data: { flashcards: [] } })).toBe('term,definition,domain');
    expect(exportTomeCsv({ data: {} })).toBe('term,definition,domain');
  });

  it('round-trips cleanly back through deckTextToTome', () => {
    const csv = exportTomeCsv(tome);
    const res = deckTextToTome(csv);
    expect(res.ok).toBe(true);
    expect(res.tome.flashcards.map((c) => [c.front, c.back, c.domain || ''])).toEqual([
      ['SYN', 'first handshake', 'TCP'],
      ['Port, 443', 'HTTPS', ''],
      ['quote "x"', 'line\nbreak', 'Misc'],
    ]);
  });
});
