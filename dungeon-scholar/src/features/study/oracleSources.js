// PHASE-08 08D: decide whether an Oracle answer should carry a "SOURCES FROM THE
// TOME" block. `searchTome` keeps any card scoring > 0, so a single weak lexical
// hit on an out-of-tome question produced unrelated "sources" — even when the
// Oracle's own answer opened with the out-of-tome disclaimer the system prompt
// requests ("This goes beyond the current tome, but..."). Gate the block on
// (a) the answer NOT carrying that disclaimer and (b) a minimum top retrieval
// score, so weak coincidental matches are dropped. The Tome Search fallback
// (renderSearchResults) is intentionally NOT routed through this — there the
// cards ARE the response.

// One exact stem match in searchTome scores 10; a substring match 7; a partial
// stem 5. Below an exact-match-equivalent we treat the hit as lexical noise.
export const ORACLE_SOURCE_MIN_SCORE = 10;

const OUT_OF_TOME_RE =
  /beyond the current tome|beyond this tome|goes beyond the tome|not covered (in|by) (the|this) tome|isn'?t covered (in|by) (the|this) tome|outside (the|this) tome/i;

export function isOutOfTomeAnswer(text) {
  return OUT_OF_TOME_RE.test(text || '');
}

// `sources` is the score-descending list returned by searchTome (each item has a
// numeric `.score`). Returns the sources to attach to the answer, or [] to suppress.
export function oracleSourcesForAnswer(text, sources, minScore = ORACLE_SOURCE_MIN_SCORE) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  if (isOutOfTomeAnswer(text)) return [];
  const top = sources[0]?.score ?? 0;
  if (top < minScore) return [];
  return sources;
}
