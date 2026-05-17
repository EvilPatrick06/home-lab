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
//   everything else           →  plain text (newlines preserved by the
//                                 renderer via white-space: pre-line)
//
// Intentionally narrow — no headings, lists, tables, LaTeX, or images.
// The AI should keep prose readable; this just unlocks the common
// inline emphasis + links that show up in descriptions, plus the code
// + diagram blocks for technical answers.

const FENCE_RE = /```([a-z0-9_-]*)\n?([\s\S]*?)```/gi;
// Single regex that alternates between every inline form. Order matters:
// bold (\*\*) must come before italic (\*), and inline-code (`) takes
// priority over emphasis so a code span containing asterisks renders as
// code. Links are last because they're the most structurally specific.
const INLINE_TOKEN_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

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
