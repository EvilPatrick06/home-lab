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
  // PHASE-04 04B: pick the DOMINANT delimiter (count tabs vs commas over the
  // sample) instead of the old whole-file tab-priority rule, which forced TSV
  // mode — and silently dropped comma rows — whenever any early line had a tab.
  const sample = String(text).split(/\r?\n/).slice(0, 10).join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

// PHASE-04 04B: rescue minority-delimiter rows. After parsing with the dominant
// delimiter, any row that produced <2 non-empty fields is re-split by the OTHER
// delimiter (so a stray comma row in a TSV deck — or vice versa — still parses).
function rescueMixedRows(rows, delimiter) {
  const other = delimiter === '\t' ? ',' : '\t';
  return rows.map((row) => {
    if (row.filter((c) => c.trim() !== '').length >= 2) return row;
    const joined = row.join(delimiter);
    if (joined.includes(other)) {
      const alt = joined.split(other);
      if (alt.filter((c) => c.trim() !== '').length >= 2) return alt;
    }
    return row;
  });
}

// Tokenize delimited text into an array of string[] rows. Tab mode is a simple
// per-line split (Quizlet does not quote); comma mode is a quote-aware CSV scan.
export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const src = String(text);
  if (delimiter === '\t') {
    return rescueMixedRows(
      src
        .split(/\r?\n/)
        .map((line) => line.split('\t'))
        .filter((row) => row.some((c) => c.trim() !== '')),
      '\t',
    );
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
  return rescueMixedRows(
    rows.filter((r) => r.some((c) => c.trim() !== '')),
    ',',
  );
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
 * @returns {{ ok: true, tome: object, count: number, skipped: number } | { ok: false, error: string }}
 */
export function deckTextToTome(text, { title, delimiter } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'Paste some CSV / Quizlet text first.' };
  }
  const delim = delimiter || detectDelimiter(text);
  let rows = parseDelimited(text, delim);
  if (rows.length && looksLikeHeader(rows[0])) rows = rows.slice(1);

  const flashcards = [];
  let skipped = 0;
  for (const r of rows) {
    const front = (r[0] || '').trim();
    const back = (r[1] || '').trim();
    if (!front || !back) {
      skipped++;
      continue; // need both sides
    }
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
  return { ok: true, tome, count: flashcards.length, skipped };
}

// ── CSV / Quizlet export (the inverse of deckTextToTome) ────────────────────
//
// The importer above pulls two-column term/definition decks (CSV / TSV /
// Quizlet copy-paste) INTO a tome. This is the symmetric OUT path: emit a
// tome's flashcards as RFC-4180-quoted `term,definition,domain` rows that
// round-trip cleanly back through parseDeckText / deckTextToTome. This gives a
// learner who authored or edited a tome in-app a way to extract their cards
// into the universal two-column format every other tool (Anki, Quizlet, a
// spreadsheet, a study group's doc) reads — the data-ownership inverse of the
// import feature.

// Quote a single CSV field per RFC-4180: wrap in double quotes and double any
// embedded quote WHEN the field contains a comma, quote, CR, or LF. Otherwise
// emit it bare. Non-strings coerce to string first.
export function csvQuoteField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize a tome's flashcards to RFC-4180 CSV text.
 * Header row: term,definition,domain. The domain column is always emitted
 * (empty when a card has none) so the shape is stable and re-importable.
 * @param {object} tome — a library entry ({ data: { flashcards } }) or a raw
 *   tome-data object ({ flashcards }).
 * @param {{ header?: boolean }} [opts]
 * @returns {string} CSV text (CRLF line endings per RFC-4180).
 */
export function exportTomeCsv(tome, { header = true } = {}) {
  const data = tome && tome.data && typeof tome.data === 'object' ? tome.data : tome;
  const cards = data && Array.isArray(data.flashcards) ? data.flashcards : [];
  const lines = [];
  if (header) lines.push('term,definition,domain');
  for (const c of cards) {
    if (!c || typeof c !== 'object') continue;
    const front = c.front ?? '';
    const back = c.back ?? '';
    // Skip degenerate cards that carry no content in either column.
    if (String(front).trim() === '' && String(back).trim() === '') continue;
    const domain = c.domain ?? '';
    lines.push([front, back, domain].map(csvQuoteField).join(','));
  }
  return lines.join('\r\n');
}
