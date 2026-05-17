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

  // Phase 35e QA P5: bold / italic / link parsing.
  describe('bold / italic / link (Phase 35e)', () => {
    it('extracts a bold token', () => {
      const out = parseRichContent('this is **important** text');
      expect(out).toEqual([
        { type: 'text', content: 'this is ' },
        { type: 'bold', content: 'important' },
        { type: 'text', content: ' text' },
      ]);
    });

    it('extracts an italic token', () => {
      const out = parseRichContent('this is *emphasized* text');
      expect(out).toEqual([
        { type: 'text', content: 'this is ' },
        { type: 'italic', content: 'emphasized' },
        { type: 'text', content: ' text' },
      ]);
    });

    it('prefers bold over italic when both could match', () => {
      const out = parseRichContent('**bold not italic**');
      expect(out).toEqual([{ type: 'bold', content: 'bold not italic' }]);
    });

    it('extracts a link token with label and href', () => {
      const out = parseRichContent('see [docs](https://example.com) for more');
      expect(out).toEqual([
        { type: 'text', content: 'see ' },
        { type: 'link', label: 'docs', href: 'https://example.com' },
        { type: 'text', content: ' for more' },
      ]);
    });

    it('preserves inline code over emphasis (asterisks inside backticks stay literal)', () => {
      const out = parseRichContent('use `**not bold**` for literal');
      expect(out).toEqual([
        { type: 'text', content: 'use ' },
        { type: 'inline-code', content: '**not bold**' },
        { type: 'text', content: ' for literal' },
      ]);
    });

    it('mixes bold, italic, inline-code, and link in one line', () => {
      const out = parseRichContent('**B** *I* `C` [L](u)');
      expect(out.map(n => n.type)).toEqual([
        'bold', 'text', 'italic', 'text', 'inline-code', 'text', 'link',
      ]);
    });

    it('does not match bold spanning a newline', () => {
      const out = parseRichContent('**not\nbold**');
      expect(out).toEqual([{ type: 'text', content: '**not\nbold**' }]);
    });

    it('leaves a stray asterisk as text', () => {
      const out = parseRichContent('5 * 6 = 30');
      // Single asterisk surrounded by digits + spaces — no closing partner.
      expect(out).toEqual([{ type: 'text', content: '5 * 6 = 30' }]);
    });
  });

  // Phase 36d QA P3: inline math.
  describe('inline math (Phase 36d)', () => {
    it('extracts $E=mc^2$ as a math node', () => {
      const out = parseRichContent('Einstein gave us $E=mc^2$ in 1905');
      expect(out).toEqual([
        { type: 'text', content: 'Einstein gave us ' },
        { type: 'math', content: 'E=mc^2' },
        { type: 'text', content: ' in 1905' },
      ]);
    });

    it('handles single-character math', () => {
      const out = parseRichContent('Let $x$ be the variable');
      expect(out).toEqual([
        { type: 'text', content: 'Let ' },
        { type: 'math', content: 'x' },
        { type: 'text', content: ' be the variable' },
      ]);
    });

    it('does not match "$5" (no closing partner)', () => {
      const out = parseRichContent('It costs $5 for one unit');
      expect(out).toEqual([{ type: 'text', content: 'It costs $5 for one unit' }]);
    });

    it('does not match "$ open and close $" with adjacent whitespace', () => {
      const out = parseRichContent('a $ bad $ math');
      // Inner edges have whitespace — not a valid math token.
      expect(out).toEqual([{ type: 'text', content: 'a $ bad $ math' }]);
    });

    it('preserves dollar-signs inside inline code', () => {
      const out = parseRichContent('var x = `$5.00`');
      // Inline-code takes priority over math.
      expect(out.map(n => n.type)).toEqual(['text', 'inline-code']);
      expect(out[1].content).toBe('$5.00');
    });

    it('does not match math spanning a newline', () => {
      const out = parseRichContent('$bad\nmath$');
      expect(out).toEqual([{ type: 'text', content: '$bad\nmath$' }]);
    });
  });

  // Phase 38e: safe image markdown.
  describe('image markdown with safe-source allowlist (Phase 38e)', () => {
    it('extracts a data:image URL as an image node', () => {
      const out = parseRichContent('see ![tiny](data:image/png;base64,iVBORw0KGgo=) below');
      expect(out).toEqual([
        { type: 'text', content: 'see ' },
        { type: 'image', alt: 'tiny', src: 'data:image/png;base64,iVBORw0KGgo=' },
        { type: 'text', content: ' below' },
      ]);
    });

    it('accepts trusted https hosts (GitHub user images)', () => {
      const out = parseRichContent('![diagram](https://user-images.githubusercontent.com/123/abc.png)');
      expect(out).toEqual([
        { type: 'image', alt: 'diagram', src: 'https://user-images.githubusercontent.com/123/abc.png' },
      ]);
    });

    it('falls back to text for an untrusted host', () => {
      const out = parseRichContent('![evil](https://random-host.example/x.png)');
      expect(out).toEqual([
        { type: 'text', content: '![evil](https://random-host.example/x.png)' },
      ]);
    });

    it('falls back to text for http://', () => {
      const out = parseRichContent('![insecure](http://user-images.githubusercontent.com/x.png)');
      expect(out).toEqual([
        { type: 'text', content: '![insecure](http://user-images.githubusercontent.com/x.png)' },
      ]);
    });

    it('falls back to text for non-image data: URLs', () => {
      const out = parseRichContent('![sneaky](data:text/html;base64,PHNjcmlwdD4=)');
      expect(out).toEqual([
        { type: 'text', content: '![sneaky](data:text/html;base64,PHNjcmlwdD4=)' },
      ]);
    });

    it('rejects data:image/svg+xml (SVG can contain <script>)', () => {
      const out = parseRichContent('![sneaky-svg](data:image/svg+xml;base64,PHN2Zy8+)');
      expect(out).toEqual([
        { type: 'text', content: '![sneaky-svg](data:image/svg+xml;base64,PHN2Zy8+)' },
      ]);
    });

    it('allows an empty alt text', () => {
      const out = parseRichContent('![](data:image/png;base64,iVBORw0KGgo=)');
      expect(out).toEqual([
        { type: 'image', alt: '', src: 'data:image/png;base64,iVBORw0KGgo=' },
      ]);
    });

    it('still parses a non-image [link](url) the same way as before', () => {
      const out = parseRichContent('see [docs](https://example.com)');
      expect(out.map(n => n.type)).toEqual(['text', 'link']);
    });
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
