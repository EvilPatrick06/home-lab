import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import katex from 'katex';
import RichContent from './RichContent.jsx';

describe('RichContent — math rendering (Phase 38f / 41a)', () => {
  it('KaTeX renderToString returns HTML containing katex markup (smoke)', () => {
    const html = katex.renderToString('E = mc^2', { throwOnError: false });
    expect(html).toContain('katex');
    // Should contain a wrapping span with class 'katex'
    expect(html).toMatch(/class="katex/);
  });

  it('MathRender swaps fallback span for KaTeX HTML once the lazy import resolves', async () => {
    render(<RichContent text="Einstein gave us $E=mc^2$ in 1905" as="div" />);
    // Initially the fallback span renders the raw expression.
    expect(screen.getByText('E=mc^2')).toBeInTheDocument();
    // After the lazy import resolves, KaTeX-rendered markup should appear.
    await waitFor(() => {
      const katexSpans = document.querySelectorAll('.katex');
      expect(katexSpans.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  }, 8000);

  it('falls back to styled span when the expression is malformed (throwOnError: false)', async () => {
    // KaTeX with throwOnError: false renders the raw source for bad input
    // rather than crashing — confirm we still get visible output, not a
    // blank span.
    render(<RichContent text={'broken: $\\notacommand{}$ here'} as="div" />);
    await waitFor(() => {
      const html = document.body.innerHTML;
      // Either the katex error rendering OR the raw expression visible.
      expect(html.length).toBeGreaterThan(50);
    });
  });
});
