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
//   ![alt](url)               →  image (Phase 38e — restricted to data:
//                                 URLs and a handful of trusted hosts;
//                                 unsafe sources fall back to text)
//   $math$                    →  inline math (Phase 36d — styled, NOT
//                                 KaTeX-rendered; the dollar signs are
//                                 stripped and the contents render in a
//                                 monospace italic span)
//   everything else           →  plain text (newlines preserved by the
//                                 renderer via white-space: pre-line)
//
// Intentionally narrow — no headings, lists, tables, or real LaTeX
// typesetting. The AI should keep prose readable; this just unlocks
// the common inline emphasis + links + safe images that show up in
// descriptions, plus the code + diagram blocks for technical answers
// and a visual hint that $...$ is a math expression.

// Capture group 1 = language token; group 2 = the REST of the info line
// (an optional caption, e.g. ```topology Core switch to two access switches);
// group 3 = the fenced body. The caption gives diagram fences a screen-reader
// text alternative (sugg-diagram-a11y).
const FENCE_RE = /```([a-z0-9_-]*)([^\n]*)\n?([\s\S]*?)```/gi;
// Single regex that alternates between every inline form. Order matters:
// inline-code first so a code span containing asterisks/dollar-signs
// stays literal; bold (\*\*) before italic (\*); image (\!\[\]\(\)) before
// link so the leading `!` isn't gobbled by link; math last so naked
// "$5 cost" doesn't get gobbled (matcher requires non-space at both
// inner edges).
const INLINE_TOKEN_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(!\[[^\]\n]*\]\([^)\s]+\))|(\[[^\]\n]+\]\([^)\s]+\))|(\$[^\s$][^$\n]*?[^\s$]\$|\$[^\s$]\$)/g;

// Phase 38e + SEC convergence (scholar-resolver 2026-06-29): tome-embedded
// images are data:image-only. Tomes are importable/shareable, so a remote
// https image `![x](https://attacker/track.png?u=...)` is a tracking-beacon /
// pixel-exfil surface. The production CSP `img-src` (vite.config.js) already
// blocks every remote host except GitHub avatars (which tome images never
// use), so the old https host allowlist was dead code in prod. data:image/*
// base64 is the single canonical remote-image trust set — matched in
// occlusion.js's isAllowedOcclusionImage and permitted by the CSP's `data:`.
function isSafeImageUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  // Pure-binary image formats only — SVG excluded (<svg> can carry inline
  // <script>). Restrictive base64 payload class (a-z A-Z 0-9 + / =) so
  // non-base64 garbage falls through to the literal-text fallback.
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-zA-Z0-9+/=]+$/i.test(url);
}

// SEC: link hrefs are untrusted (tomes are importable/shareable). Allow only
// http(s)/mailto; reject javascript:, data:, vbscript:, file:, etc. Mirrors
// isSafeImageUrl's fallback-to-literal-text behavior on rejection.
function isSafeLinkUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    // Resolve against a base so ordinary relative links (e.g. "docs#x") pass,
    // while absolute dangerous schemes (javascript:, data:, vbscript:, file:)
    // keep their own protocol and are rejected.
    const u = new URL(url, 'https://dungeon-scholar.invalid/');
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

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
    const codeNode = {
      type: 'code',
      language: (m[1] || '').toLowerCase(),
      content: m[3],
    };
    // Only attach a caption when the info line carried one, so plain fences
    // keep their minimal { type, language, content } shape (back-compatible).
    const captionText = (m[2] || '').trim();
    if (captionText) codeNode.caption = captionText;
    nodes.push(codeNode);
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
      // Phase 38e: ![alt](url) image. URL must be data:image/* or on the
      // trusted-hosts allowlist; otherwise fall back to literal text so
      // an untrusted URL never ends up rendered as a <img src>.
      const imatch = m[4].match(/^!\[([^\]\n]*)\]\(([^)\s]+)\)$/);
      if (imatch && isSafeImageUrl(imatch[2])) {
        nodes.push({ type: 'image', alt: imatch[1] || '', src: imatch[2] });
      } else {
        nodes.push({ type: 'text', content: m[4] });
      }
    } else if (m[5]) {
      const lmatch = m[5].match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      if (lmatch && isSafeLinkUrl(lmatch[2])) {
        nodes.push({ type: 'link', label: lmatch[1], href: lmatch[2] });
      } else {
        nodes.push({ type: 'text', content: m[5] });
      }
    } else if (m[6]) {
      // Phase 36d: $inline math$. The dollar signs are stripped; the
      // contents render in a monospaced italic span so the formula is
      // visually distinct from prose. NOT real LaTeX rendering — adding
      // KaTeX would balloon the bundle. Authors should keep formulas
      // simple (subscripts/superscripts in plain text work fine).
      nodes.push({ type: 'math', content: m[6].slice(1, -1) });
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
