// Cloze deletion / text occlusion (sugg-cloze-cards).
//
// The app has image occlusion but no TEXT equivalent. Cloze deletion
// ("The three-way handshake is SYN -> {{c1::SYN-ACK}} -> ACK") is one of the
// highest-retention formats for this app's material (port numbers, protocol
// sequences, command syntax, acronym expansions) and the most-used Anki card
// type. These pure helpers parse Anki-style {{c1::answer}} (and bare
// {{answer}}) spans out of a single authored sentence and expand each masked
// span into a study item, mirroring how services/occlusion.js derives per-region
// cards. Kept pure + unit-testable; the study/import layers consume the output.

import { dueCount } from './srs.js';

// Matches {{c<N>::answer}} or {{c<N>::answer::hint}} or bare {{answer}}.
// Group 1 = optional cluster number (c1 -> "1"); rest is the payload.
const CLOZE_RE = /\{\{(?:c(\d+)::)?([^{}]*?)\}\}/g;

// True if the text contains at least one cloze span.
export function hasCloze(text) {
  if (typeof text !== 'string') return false;
  CLOZE_RE.lastIndex = 0;
  return CLOZE_RE.test(text);
}

/**
 * Parse the cloze spans in a sentence.
 * @param {string} text
 * @returns {{ cluster: number, answer: string, hint: string, index: number }[]}
 */
export function parseClozeSpans(text) {
  const spans = [];
  if (typeof text !== 'string') return spans;
  const re = new RegExp(CLOZE_RE.source, 'g');
  let m;
  let auto = 0;
  while ((m = re.exec(text)) !== null) {
    const cluster = m[1] ? Number(m[1]) : ++auto;
    const raw = (m[2] || '').trim();
    // Support an optional ::hint suffix inside the braces.
    const parts = raw.split('::');
    const answer = (parts[0] || '').trim();
    const hint = parts.length > 1 ? parts.slice(1).join('::').trim() : '';
    if (!answer) continue;
    spans.push({ cluster, answer, hint, index: m.index });
  }
  return spans;
}

/**
 * Render a sentence with ONE cluster masked and the others revealed. The masked
 * span shows a blank (or its hint) so the learner recalls just that fact; other
 * clusters render as their answer text so the sentence reads naturally.
 * @param {string} text
 * @param {number} targetCluster
 * @returns {string}
 */
export function renderClozeText(text, targetCluster) {
  if (typeof text !== 'string') return '';
  const re = new RegExp(CLOZE_RE.source, 'g');
  let auto = 0;
  return text.replace(re, (_full, num, payload) => {
    const cluster = num ? Number(num) : ++auto;
    const raw = (payload || '').trim();
    const answer = raw.split('::')[0].trim();
    const hint = raw.includes('::') ? raw.split('::').slice(1).join('::').trim() : '';
    if (cluster === targetCluster) return hint ? `[${hint}]` : '[...]';
    return answer;
  });
}

/**
 * Expand a cloze-bearing card into one study item PER distinct cluster. Each
 * item carries the masked prompt (`front`), the answer (`back` / acceptedAnswers
 * for free-text grading), and the source id so progress can key off it. A card
 * with no cloze spans returns []. Mirrors occlusion.js's per-region expansion.
 * @param {{ id?: any, text?: string, front?: string, domain?: string }} card
 * @returns {{ id: string, cluster: number, front: string, back: string, acceptedAnswers: string[], domain?: string, cloze: true }[]}
 */
export function expandClozeCard(card) {
  if (!card || typeof card !== 'object') return [];
  const source = typeof card.text === 'string' ? card.text : typeof card.front === 'string' ? card.front : '';
  const spans = parseClozeSpans(source);
  if (spans.length === 0) return [];
  const clusters = [...new Set(spans.map((s) => s.cluster))].sort((a, b) => a - b);
  const baseId = card.id == null ? 'cloze' : String(card.id);
  return clusters.map((cluster) => {
    const answers = spans.filter((s) => s.cluster === cluster).map((s) => s.answer);
    const item = {
      id: `${baseId}_c${cluster}`,
      cluster,
      front: renderClozeText(source, cluster),
      back: answers.join(', '),
      acceptedAnswers: answers,
      cloze: /** @type {true} */ (true),
    };
    if (card.domain) item.domain = card.domain;
    return item;
  });
}

// Expand a whole deck: flat-map every cloze card into its per-cluster items,
// leaving non-cloze cards untouched (passed through). Useful at tome load.
export function expandClozeDeck(cards) {
  const out = [];
  for (const c of Array.isArray(cards) ? cards : []) {
    const expanded = expandClozeCard(c);
    if (expanded.length) out.push(...expanded);
    else if (c) out.push(c);
  }
  return out;
}

// issue-cloze-due-count (2026-07-15): due-count over the EXPANDED deck. SRS
// ratings are keyed on the expanded `<id>_cN` items (FlashcardsMode expands at
// deck build), so counting over the RAW flashcards makes every cloze source
// card permanently "due" (its raw id never gains a progress entry) and counts
// a multi-cluster card as 1 instead of N. Every due-count surface must count
// the same items the review queue actually serves — use this, not raw
// dueCount, wherever the card list may contain cloze cards.
export function dueCountExpanded(cardProgressMap, cards, now = Date.now()) {
  return dueCount(cardProgressMap, expandClozeDeck(cards), now);
}
