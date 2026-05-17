// Phase 26f: rich-content renderer for tome text fields.
//
// Pass `text` and a `className` (applied to the outer wrapper). Plain
// prose keeps existing styling; fenced ```lang blocks render as a pre/
// code with a small uppercase language tag in the corner and a dashed
// border when the language is diagram-family (ascii, diagram, topology,
// flow). Inline `backticks` render as a styled <code> span.

import React, { useState, useEffect } from 'react';
import { parseRichContent, isDiagramLanguage } from '../services/richContent.js';

// Phase 38f / 43c: lazy-load KaTeX on first math node. Module-level
// promise caches the import so the second math node renders instantly.
// CSS is a side-effecting dynamic import. Falls back to the styled-span
// renderer if KaTeX fails to load (offline / CDN block).
//
// 43c: after the dynamic import resolves, the katex module is also
// hung on `window.katex` so external probes (devtools, automated QA,
// `window.katex === undefined` checks) report it as loaded. The ESM
// dynamic import alone does not pollute the global scope, which made
// the feature look absent to multiple QA verification methods.
let katexPromise = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([mod]) => {
      const katex = mod.default || mod;
      try {
        if (typeof window !== 'undefined') window.katex = katex;
      } catch { /* sandbox */ }
      return katex;
    });
  }
  return katexPromise;
}

// Phase 38f: per-expression KaTeX renderer. Renders styled-span placeholder
// while katex loads; swaps to the typeset HTML once ready. throwOnError:false
// so a malformed expression renders the raw source rather than crashing.
function MathRender({ expr, fallbackStyle }) {
  const [html, setHtml] = useState(null);
  useEffect(() => {
    let mounted = true;
    loadKatex().then((katex) => {
      if (!mounted) return;
      try {
        const rendered = katex.renderToString(expr, { throwOnError: false, displayMode: false });
        setHtml(rendered);
      } catch { /* keep fallback */ }
    }).catch(() => { /* offline — keep fallback */ });
    return () => { mounted = false; };
  }, [expr]);
  if (html) {
    // katex.renderToString returns trusted HTML (auto-escapes user input,
    // includes no <script>). dangerouslySetInnerHTML is the documented
    // KaTeX API for inline use.
    return <span title="Math expression" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span title="Math expression (loading…)" style={fallbackStyle}>{expr}</span>;
}

const PRE_BASE_STYLE = {
  borderRadius: '4px',
  padding: '0.85rem 1rem 0.75rem',
  margin: '0.5rem 0',
  overflowX: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.85em',
  lineHeight: 1.45,
  position: 'relative',
  textAlign: 'left',
  whiteSpace: 'pre',
  fontStyle: 'normal',
};

const INLINE_CODE_STYLE = {
  background: 'rgba(0, 0, 0, 0.45)',
  border: '1px solid rgba(245, 158, 11, 0.4)',
  color: '#fde68a',
  borderRadius: '3px',
  padding: '0 0.35em',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.9em',
  fontStyle: 'normal',
};

const LANG_TAG_STYLE = {
  position: 'absolute',
  top: '4px',
  right: '8px',
  fontSize: '0.6em',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'rgba(245, 158, 11, 0.6)',
  fontStyle: 'italic',
  fontFamily: 'inherit',
  pointerEvents: 'none',
};

function styleForFence(language) {
  if (isDiagramLanguage(language)) {
    return {
      ...PRE_BASE_STYLE,
      background: 'rgba(31, 12, 41, 0.7)',
      border: '2px dashed rgba(168, 85, 247, 0.6)',
      color: '#e9d5ff',
    };
  }
  return {
    ...PRE_BASE_STYLE,
    background: 'rgba(0, 0, 0, 0.55)',
    border: '2px solid rgba(245, 158, 11, 0.45)',
    color: '#fde68a',
  };
}

export default function RichContent({ text, className, style, as: BlockTag = 'div' }) {
  const nodes = parseRichContent(text);
  if (nodes.length === 0) {
    return BlockTag ? <BlockTag className={className} style={style} /> : null;
  }

  const children = [];
  let runBuffer = [];
  let key = 0;

  const flushRun = () => {
    if (runBuffer.length === 0) return;
    children.push(
      <span key={`run${key++}`} style={{ whiteSpace: 'pre-line' }}>{runBuffer}</span>,
    );
    runBuffer = [];
  };

  nodes.forEach((n, i) => {
    if (n.type === 'text') {
      if (n.content) runBuffer.push(<React.Fragment key={`t${i}`}>{n.content}</React.Fragment>);
    } else if (n.type === 'inline-code') {
      runBuffer.push(
        <code key={`ic${i}`} style={INLINE_CODE_STYLE}>{n.content}</code>,
      );
    } else if (n.type === 'bold') {
      // Phase 35e QA P5: **bold** renders as <strong> with theme color.
      runBuffer.push(
        <strong key={`b${i}`} style={{ fontWeight: 700, color: '#fde68a' }}>{n.content}</strong>,
      );
    } else if (n.type === 'italic') {
      // Phase 35e: *italic* renders as <em>. Most prose is already italic
      // (the dungeon font), so emphasize by switching to NORMAL style so
      // the italics-on-italics inversion stands out.
      runBuffer.push(
        <em key={`em${i}`} style={{ fontStyle: 'normal', fontWeight: 600, color: '#fef3c7' }}>{n.content}</em>,
      );
    } else if (n.type === 'link') {
      // Phase 35e: [text](url) renders as an <a> opening in a new tab.
      runBuffer.push(
        <a key={`a${i}`} href={n.href} target="_blank" rel="noopener noreferrer"
          style={{ color: '#7dd3fc', textDecoration: 'underline', fontStyle: 'normal' }}>
          {n.label}
        </a>,
      );
    } else if (n.type === 'image') {
      // Phase 38e: ![alt](url) — already URL-validated by the parser.
      // Renders inline-block so a short alt text isn't visually
      // disconnected from the surrounding prose.
      runBuffer.push(
        <img
          key={`img${i}`}
          src={n.src}
          alt={n.alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            display: 'inline-block',
            verticalAlign: 'middle',
            maxWidth: '100%',
            maxHeight: '18em',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '4px',
            background: 'rgba(0,0,0,0.25)',
            margin: '0.15em 0.2em',
          }}
        />,
      );
    } else if (n.type === 'math') {
      // Phase 36d / 38f: $inline math$ — full KaTeX typesetting via
      // lazy-loaded module. Styled-span placeholder renders immediately
      // (matches the Phase 36d look) and is replaced once KaTeX finishes
      // loading. Module + CSS are imported only when the first math node
      // is encountered, so tomes without math don't pay the bundle cost.
      runBuffer.push(
        <MathRender
          key={`m${i}`}
          expr={n.content}
          fallbackStyle={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontStyle: 'italic',
            fontSize: '0.95em',
            background: 'rgba(126, 34, 206, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            color: '#e9d5ff',
            borderRadius: '3px',
            padding: '0 0.35em',
          }}
        />,
      );
    } else if (n.type === 'code') {
      flushRun();
      const diagram = isDiagramLanguage(n.language);
      children.push(
        <pre key={`c${i}`} style={styleForFence(n.language)}>
          {n.language && (
            <span style={LANG_TAG_STYLE}>{diagram ? 'diagram' : n.language}</span>
          )}
          <code style={{ background: 'transparent', padding: 0, color: 'inherit', fontFamily: 'inherit', fontStyle: 'normal' }}>
            {n.content}
          </code>
        </pre>,
      );
    }
  });
  flushRun();

  if (!BlockTag) return <>{children}</>;
  return (
    <BlockTag className={className} style={style}>
      {children}
    </BlockTag>
  );
}
