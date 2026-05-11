// Phase 26f: rich-content parser for tome text fields.
//
// Parses a tiny markdown-flavored subset out of question stems,
// explanations, lab scenarios, etc.:
//
//   ```lang\n<content>\n```   →  fenced code block (with language tag)
//   `single backticks`        →  inline code span
//   everything else           →  plain text (newlines preserved by the
//                                 renderer via white-space: pre-line)
//
// Intentionally tiny — no headings, lists, emphasis, links, etc. The
// AI should keep prose readable; this just unlocks diagrams (ASCII or
// labelled `diagram` blocks), CLI snippets, configs, log excerpts and
// other monospace artifacts that text-only rendering swallows.

const FENCE_RE = /```([a-z0-9_-]*)\n?([\s\S]*?)```/gi;
const INLINE_RE = /`([^`\n]+)`/g;

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
  const inlineRe = new RegExp(INLINE_RE.source, 'g');
  let lastIdx = 0;
  let m;
  while ((m = inlineRe.exec(slice)) !== null) {
    if (m.index > lastIdx) {
      nodes.push({ type: 'text', content: slice.slice(lastIdx, m.index) });
    }
    nodes.push({ type: 'inline-code', content: m[1] });
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
