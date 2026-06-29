// Import external study-deck formats (CSV / TSV / Quizlet export) into a tome.
//
// The app's own inbound paths all assume its JSON schema (TOME-V1 share codes,
// pasted tome JSON, bundled starter decks). The huge existing corpus of study
// material lives in CSV/TSV and Quizlet exports — plain two-column term/def
// text. This converter parses that text into the canonical tome shape
// ({ metadata, flashcards, quiz, labs }) so it can flow through the SAME import
// path as everything else (normalizeTomeData -> addTomeToLibrary).
//
// Supported:
//   - CSV (comma-delimited, RFC-4180-ish quoting with "" escapes + quoted
//     fields that may contain commas/newlines).
//   - TSV / Quizlet export (tab between term & definition, newline between
//     cards — Quizlet's default copy-paste format).
//   - An optional 3rd column is treated as the card's domain/category tag.
//   - A leading header row (front/back, term/definition, question/answer,
//     word/meaning) is auto-detected and skipped.
//
// `.apkg` (Anki) is intentionally NOT handled here — it is a zipped SQLite DB
// that needs a sql.js/WASM reader (a heavier dependency + bundle-size decision),
// tracked as a follow-up. CSV/Quizlet covers the common, dependency-free cases.

import { generateTomeId, normalizeTomeData } from '../game/tome.js';

const HEADER_PAIRS = new Set([
  'front|back',
  'term|definition',
  'question|answer',
  'word|meaning',
  'q|a',
  'front|back|category',
  'term|definition|tag',
]);

export function detectDelimiter(text) {
  const sample = String(text).split(/\r?\n/).slice(0, 10).join('\n');
  return sample.includes('\t') ? '\t' : ',';
}

// Tokenize delimited text into an array of string[] rows. Tab mode is a simple
// per-line split (Quizlet does not quote); comma mode is a quote-aware CSV scan.
export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const src = String(text);
  if (delimiter === '\t') {
    return src
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
      .filter((row) => row.some((c) => c.trim() !== ''));
  }
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // flush trailing field/row
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function looksLikeHeader(row) {
  if (!row || row.length < 2) return false;
  const key = row
    .slice(0, 3)
    .map((c) => c.trim().toLowerCase())
    .join('|');
  return (
    HEADER_PAIRS.has(key) ||
    HEADER_PAIRS.has(
      row
        .slice(0, 2)
        .map((c) => c.trim().toLowerCase())
        .join('|'),
    )
  );
}

/**
 * Convert delimited deck text into a tome object.
 * @param {string} text
 * @param {{ title?: any, delimiter?: any }} [opts]
 * @returns {{ ok: true, tome: object, count: number } | { ok: false, error: string }}
 */
export function deckTextToTome(text, { title, delimiter } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'Paste some CSV / Quizlet text first.' };
  }
  const delim = delimiter || detectDelimiter(text);
  let rows = parseDelimited(text, delim);
  if (rows.length && looksLikeHeader(rows[0])) rows = rows.slice(1);

  const flashcards = [];
  for (const r of rows) {
    const front = (r[0] || '').trim();
    const back = (r[1] || '').trim();
    if (!front || !back) continue; // need both sides
    const domain = (r[2] || '').trim();
    const card = {
      id: `imp_${flashcards.length}_${Math.random().toString(36).slice(2, 8)}`,
      front,
      back,
    };
    if (domain) card.domain = domain;
    flashcards.push(card);
  }

  if (flashcards.length === 0) {
    return {
      ok: false,
      error: 'No cards found — each row needs at least two columns (front and back).',
    };
  }

  const cleanTitle = (title && String(title).trim()) || 'Imported deck';
  const tome = normalizeTomeData({
    id: generateTomeId(),
    metadata: {
      title: cleanTitle,
      subject: 'Imported',
      author: 'Imported deck',
      description: `Imported ${flashcards.length} card${flashcards.length === 1 ? '' : 's'} from ${
        delim === '\t' ? 'Quizlet/TSV' : 'CSV'
      }.`,
    },
    flashcards,
    quiz: [],
    labs: [],
  });
  return { ok: true, tome, count: flashcards.length };
}
