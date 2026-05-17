// Phase 26f / 35e: rich-content parser for tome text fields.
//
// Parses a small markdown-flavored subset out of question stems,
// explanations, lab scenarios, descriptions, etc.:
//
//   ```lang\n<content>\n```   →  fenced code block (with language tag)
//   `single backticks`        →  inline code span
//   **bold**                  →  bold (Phase 35e)
//   *italic*                  →  italic (Phase 35e)
//   [text](url)               →  link (Phase 35e)
//   $math$                    →  inline math (Phase 36d — styled, NOT
//                                 KaTeX-rendered; the dollar signs are
//                                 stripped and the contents render in a
//                                 monospace italic span)
//   everything else           →  plain text (newlines preserved by the
//                                 renderer via white-space: pre-line)
//
// Intentionally narrow — no headings, lists, tables, real LaTeX
// typesetting, or images. The AI should keep prose readable; this just
// unlocks the common inline emphasis + links that show up in
// descriptions, plus the code + diagram blocks for technical answers
// and a visual hint that $...$ is a math expression.

const FENCE_RE = /```([a-z0-9_-]*)\n?([\s\S]*?)```/gi;
// Single regex that alternates between every inline form. Order matters:
// inline-code first so a code span containing asterisks/dollar-signs
// stays literal; bold (\*\*) before italic (\*); math last so naked
// "$5 cost" doesn't get gobbled (matcher requires non-space at both
// inner edges).
const INLINE_TOKEN_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))|(\$[^\s$][^$\n]*?[^\s$]\$|\$[^\s$]\$)/g;

export function parseRichContent(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const nodes = [];
  const fenceRe = new RegExp(FENCE_RE.source, 'gi');
  let lastIdx = 0;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > lastIdx) {
      pushTextish(text.slice(lastIdx, m.index), nodes);
    }
    nodes.push({
      type: 'code',
      language: (m[1] || '').toLowerCase(),
      content: m[2],
    });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    pushTextish(text.slice(lastIdx), nodes);
  }
  return nodes;
}

function pushTextish(slice, nodes) {
  if (!slice) return;
  const re = new RegExp(INLINE_TOKEN_RE.source, 'g');
  let lastIdx = 0;
  let m;
  while ((m = re.exec(slice)) !== null) {
    if (m.index > lastIdx) {
      nodes.push({ type: 'text', content: slice.slice(lastIdx, m.index) });
    }
    if (m[1]) {
      nodes.push({ type: 'inline-code', content: m[1].slice(1, -1) });
    } else if (m[2]) {
      nodes.push({ type: 'bold', content: m[2].slice(2, -2) });
    } else if (m[3]) {
      nodes.push({ type: 'italic', content: m[3].slice(1, -1) });
    } else if (m[4]) {
      const lmatch = m[4].match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      if (lmatch) {
        nodes.push({ type: 'link', label: lmatch[1], href: lmatch[2] });
      } else {
        nodes.push({ type: 'text', content: m[4] });
      }
    } else if (m[5]) {
      // Phase 36d: $inline math$. The dollar signs are stripped; the
      // contents render in a monospaced italic span so the formula is
      // visually distinct from prose. NOT real LaTeX rendering — adding
      // KaTeX would balloon the bundle. Authors should keep formulas
      // simple (subscripts/superscripts in plain text work fine).
      nodes.push({ type: 'math', content: m[5].slice(1, -1) });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < slice.length) {
    nodes.push({ type: 'text', content: slice.slice(lastIdx) });
  }
}

export const DIAGRAM_LANGUAGES = new Set(['ascii', 'diagram', 'topology', 'flow']);

export function isDiagramLanguage(lang) {
  return DIAGRAM_LANGUAGES.has((lang || '').toLowerCase());
}
