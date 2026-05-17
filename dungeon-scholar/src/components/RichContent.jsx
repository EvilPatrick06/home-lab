// Phase 26f: rich-content renderer for tome text fields.
//
// Pass `text` and a `className` (applied to the outer wrapper). Plain
// prose keeps existing styling; fenced ```lang blocks render as a pre/
// code with a small uppercase language tag in the corner and a dashed
// border when the language is diagram-family (ascii, diagram, topology,
// flow). Inline `backticks` render as a styled <code> span.

import React from 'react';
import { parseRichContent, isDiagramLanguage } from '../services/richContent.js';

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
