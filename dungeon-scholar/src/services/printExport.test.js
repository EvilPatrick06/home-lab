import { describe, expect, it } from 'vitest';
import { buildPrintableHtml } from './printExport.js';

const tome = {
  data: {
    metadata: { title: 'Net+ Basics', subject: 'Networking' },
    flashcards: [{ front: 'SYN?', back: 'first handshake step' }],
    quiz: [
      {
        question: 'Which port is HTTPS?',
        options: ['80', '443', '22'],
        correctIndex: 1,
        explanation: '443 is TLS.',
      },
      { question: 'TCP is connectionless.', type: 'truefalse', correctAnswer: false },
    ],
  },
};

describe('buildPrintableHtml', () => {
  it('produces a standalone HTML doc with the title + sections', () => {
    const html = buildPrintableHtml(tome);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Net+ Basics</title>');
    expect(html).toContain('Flashcards');
    expect(html).toContain('Questions');
  });

  it('includes answers when withAnswers (default)', () => {
    const html = buildPrintableHtml(tome, { withAnswers: true });
    expect(html).toContain('first handshake step');
    expect(html).toContain('Answer: B. 443');
    expect(html).toContain('443 is TLS.');
    expect(html).toContain('Answer: false');
  });

  it('omits answers in questions-only mode', () => {
    const html = buildPrintableHtml(tome, { withAnswers: false });
    expect(html).not.toContain('first handshake step');
    expect(html).not.toContain('Answer:');
    expect(html).toContain('questions only');
  });

  it('escapes HTML in tome content', () => {
    const html = buildPrintableHtml({ data: { metadata: { title: 'A' }, quiz: [{ question: '<script>x</script>' }] } });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });

  it('handles an empty tome gracefully', () => {
    const html = buildPrintableHtml({ data: { metadata: { title: 'Empty' } } });
    expect(html).toContain('no printable flashcards or questions');
  });

  it('accepts a raw tome-data object', () => {
    const html = buildPrintableHtml({ metadata: { title: 'Raw' }, quiz: [{ question: 'Q1' }] });
    expect(html).toContain('<title>Raw</title>');
    expect(html).toContain('1. Q1');
  });
});
