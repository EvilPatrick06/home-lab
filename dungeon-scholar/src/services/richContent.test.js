import { describe, it, expect } from 'vitest';
import { parseRichContent, isDiagramLanguage } from './richContent.js';

describe('parseRichContent', () => {
  it('returns [] for empty or non-string input', () => {
    expect(parseRichContent('')).toEqual([]);
    expect(parseRichContent(null)).toEqual([]);
    expect(parseRichContent(undefined)).toEqual([]);
    expect(parseRichContent(123)).toEqual([]);
  });

  it('returns a single text node for plain prose', () => {
    expect(parseRichContent('hello world')).toEqual([
      { type: 'text', content: 'hello world' },
    ]);
  });

  it('extracts a fenced code block with language', () => {
    const out = parseRichContent('Before\n```bash\nls -la\n```\nAfter');
    expect(out).toEqual([
      { type: 'text', content: 'Before\n' },
      { type: 'code', language: 'bash', content: 'ls -la\n' },
      { type: 'text', content: '\nAfter' },
    ]);
  });

  it('accepts fenced blocks without a language', () => {
    const out = parseRichContent('```\nplain code\n```');
    expect(out).toEqual([
      { type: 'code', language: '', content: 'plain code\n' },
    ]);
  });

  it('lowercases the language tag', () => {
    const out = parseRichContent('```YAML\nfoo: bar\n```');
    expect(out[0].language).toBe('yaml');
  });

  it('captures multiple fenced blocks in order', () => {
    const out = parseRichContent('A\n```a\none\n```B\n```b\ntwo\n```C');
    expect(out.map(n => n.type)).toEqual(['text', 'code', 'text', 'code', 'text']);
    expect(out[1]).toEqual({ type: 'code', language: 'a', content: 'one\n' });
    expect(out[3]).toEqual({ type: 'code', language: 'b', content: 'two\n' });
  });

  it('does not match an unclosed fence (treats it as plain text)', () => {
    const input = 'Before\n```bash\nls -la\nNo end fence';
    const out = parseRichContent(input);
    expect(out).toEqual([{ type: 'text', content: input }]);
  });

  it('extracts inline backticks as inline-code nodes', () => {
    const out = parseRichContent('use `ls -la` to list');
    expect(out).toEqual([
      { type: 'text', content: 'use ' },
      { type: 'inline-code', content: 'ls -la' },
      { type: 'text', content: ' to list' },
    ]);
  });

  it('handles consecutive inline-code spans', () => {
    const out = parseRichContent('`a``b`');
    expect(out.map(n => n.type)).toEqual(['inline-code', 'inline-code']);
    expect(out[0].content).toBe('a');
    expect(out[1].content).toBe('b');
  });

  it('does not match inline backticks that span a newline', () => {
    const out = parseRichContent('`unterminated\nstuff`');
    // Lone single-line `unterminated\nstuff` won't match the inline regex
    expect(out).toEqual([{ type: 'text', content: '`unterminated\nstuff`' }]);
  });

  it('mixes fenced blocks and inline code correctly', () => {
    const out = parseRichContent('Type `ls` to list:\n```bash\nls -la\n```\nDone.');
    expect(out.map(n => n.type)).toEqual(['text', 'inline-code', 'text', 'code', 'text']);
  });

  it('preserves whitespace and newlines inside text nodes verbatim', () => {
    const out = parseRichContent('line 1\n\nline 2\n\nline 3');
    expect(out).toEqual([{ type: 'text', content: 'line 1\n\nline 2\n\nline 3' }]);
  });

  it('does not interpret HTML special characters specially', () => {
    const out = parseRichContent('<div>&amp;</div>');
    expect(out).toEqual([{ type: 'text', content: '<div>&amp;</div>' }]);
  });
});

describe('isDiagramLanguage', () => {
  it('recognizes the diagram-family languages', () => {
    expect(isDiagramLanguage('ascii')).toBe(true);
    expect(isDiagramLanguage('diagram')).toBe(true);
    expect(isDiagramLanguage('topology')).toBe(true);
    expect(isDiagramLanguage('flow')).toBe(true);
    expect(isDiagramLanguage('ASCII')).toBe(true);
  });

  it('returns false for code-family languages and undefined', () => {
    expect(isDiagramLanguage('bash')).toBe(false);
    expect(isDiagramLanguage('yaml')).toBe(false);
    expect(isDiagramLanguage('')).toBe(false);
    expect(isDiagramLanguage(null)).toBe(false);
    expect(isDiagramLanguage(undefined)).toBe(false);
  });
});
