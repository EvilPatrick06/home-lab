// Oracle-graded free-text answers. Used by Lab and Quiz fillblanks. Falls back
// to a tolerant string match against the tome's canonical answers if the Oracle
// is unreachable. (Dungeon battles are MC/TF and never call gradeAnswer.)

const ORACLE_ENDPOINT = 'https://dungeon-scholar-oracle.patrick-home-lab.workers.dev';

const norm = (s) => String(s || '').trim().toLowerCase();

// Tolerant string match used as the local fallback. True if the user's answer
// matches (or substring-matches) any canonical answer.
export function stringMatchAnswer({ userAnswer, expectedAnswer, acceptedAnswers }) {
  const u = norm(userAnswer);
  if (!u) return false;
  const candidates = [];
  if (expectedAnswer) candidates.push(expectedAnswer);
  if (Array.isArray(acceptedAnswers)) candidates.push(...acceptedAnswers);
  return candidates.some((c) => {
    const n = norm(c);
    if (!n) return false;
    return n === u || u.includes(n) || n.includes(u);
  });
}

const GRADER_SYSTEM = `You are an exacting but fair grader for a study app.
Given a question, the canonical correct answer, and the student's answer,
judge whether the student demonstrated correct understanding. Accept
paraphrases, abbreviations, alternative wordings, and partial-credit
responses that hit the key concept. Reject answers that are unrelated,
factually wrong, or empty/skipped.

Respond with EXACTLY one JSON object on a single line, nothing else:
{"correct": true|false, "feedback": "one or two sentences in the second person, light D&D fantasy flavor permitted"}`;

const buildUserMessage = ({ question, expectedAnswer, acceptedAnswers, userAnswer }) => {
  const expected = expectedAnswer
    || (Array.isArray(acceptedAnswers) && acceptedAnswers.length
      ? acceptedAnswers.join(' / ')
      : '');
  return `Question:
${question || '(no question text)'}

Canonical answer:
${expected || '(none provided)'}

Student's answer:
${userAnswer}`;
};

// Collect every balanced top-level {...} block in the text. String-aware so
// braces inside JSON string values don't break the depth count.
const collectBalancedJsonBlocks = (text) => {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  return blocks;
};

// Normalize a parsed object into a verdict, or null if it isn't one.
const asVerdict = (parsed) => {
  if (!parsed || typeof parsed.correct !== 'boolean') return null;
  return {
    correct: !!parsed.correct,
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
  };
};

const extractJsonVerdict = (text) => {
  if (!text) return null;
  // Fast path: compliant single-object output (incl. feedback that mentions braces).
  try {
    const v = asVerdict(JSON.parse(text.trim()));
    if (v) return v;
  } catch { /* fall through to balanced-block extraction */ }
  // Models sometimes wrap a prose example object before the real verdict, or
  // fence the JSON. Scan every balanced {...} block and take the LAST valid
  // verdict — the model appends its real answer after any worked example.
  let last = null;
  for (const block of collectBalancedJsonBlocks(text)) {
    try {
      const v = asVerdict(JSON.parse(block));
      if (v) last = v;
    } catch { /* skip non-JSON candidate */ }
  }
  return last;
};

const fallbackResult = ({ userAnswer, expectedAnswer, acceptedAnswers, reason }) => {
  const correct = stringMatchAnswer({ userAnswer, expectedAnswer, acceptedAnswers });
  return {
    correct,
    feedback: correct
      ? 'A close match — accepted by the tome\'s own measure.'
      : 'Thy answer did not match the tome\'s canonical reckoning.',
    source: 'fallback',
    fallbackReason: reason || 'Oracle unreachable',
  };
};

/**
 * Ask the Oracle to grade a free-text answer.
 *
 * @param {object} args
 * @param {string} args.question
 * @param {string} [args.expectedAnswer]      canonical answer (lab.answer or quiz.correctAnswer)
 * @param {string[]} [args.acceptedAnswers]   alternative accepted phrasings
 * @param {string} args.userAnswer
 * @param {AbortSignal} [args.signal]         to cancel in-flight requests
 * @param {typeof fetch} [args.fetchImpl]     for tests
 * @returns {Promise<{ correct: boolean, feedback: string, source: 'oracle'|'fallback'|'local', fallbackReason?: string }>}
 *
 * Rejects with `AbortError` when `signal` aborts; all other failures resolve to
 * a fallback verdict.
 */
export async function gradeAnswer({
  question,
  expectedAnswer,
  acceptedAnswers,
  userAnswer,
  signal,
  fetchImpl = fetch,
} = {}) {
  if (!userAnswer || !String(userAnswer).trim()) {
    return {
      correct: false,
      feedback: 'Thou hast offered no answer.',
      source: 'local',
    };
  }

  let response;
  try {
    response = await fetchImpl(ORACLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: GRADER_SYSTEM,
        messages: [
          { role: 'user', content: buildUserMessage({ question, expectedAnswer, acceptedAnswers, userAnswer }) },
        ],
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') throw err;
    return fallbackResult({ userAnswer, expectedAnswer, acceptedAnswers, reason: err?.message || 'network error' });
  }

  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try {
      const body = await response.text();
      const lower = body.toLowerCase();
      if (lower.includes('rate') || lower.includes('quota') || lower.includes('limit') || lower.includes('exceeded')) {
        reason = 'rate limit / quota';
      }
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      /* ignore other body-read errors */
    }
    return fallbackResult({ userAnswer, expectedAnswer, acceptedAnswers, reason });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') throw err;
    return fallbackResult({ userAnswer, expectedAnswer, acceptedAnswers, reason: 'malformed JSON' });
  }
  if (data?.error) {
    return fallbackResult({ userAnswer, expectedAnswer, acceptedAnswers, reason: String(data.error).slice(0, 80) });
  }

  const text = (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim();
  const verdict = extractJsonVerdict(text);
  if (!verdict) {
    return fallbackResult({ userAnswer, expectedAnswer, acceptedAnswers, reason: 'unparseable verdict' });
  }
  return { ...verdict, source: 'oracle' };
}
