// Pure dungeon-delve logic — movement predicates, answer grading, and question
// selection — extracted from the DungeonExplore God-file (S26 decomposition).
// No React, no canvas: framework-agnostic rules that are cheap to unit-test.
import { TILE } from '../../game/dungeonMap.js';

export const DIR_DELTAS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const isWalkable = (t) => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS_UP || t === TILE.STAIRS_DOWN;

const norm = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase();

// Pull random questions from the active tome's quiz pool, excluding any
// already-used questions in this run.
export function pickQuestions(courseSet, count, excludeIds = new Set()) {
  const quizPool = (courseSet?.quiz || []).filter(
    (q) => !excludeIds.has(q.id) && (q.type === 'multiplechoice' || q.type === 'truefalse'),
  );
  // Shuffle and take.
  const arr = quizPool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// Pick a single question, preferring un-used ones but falling back to the full
// pool if the run has burned through every question. Used by the open-ended
// gauntlet — each wrong answer pulls a fresh prompt instead of advancing toward
// a fixed end-of-trial.
export function pickOneQuestion(courseSet, excludeIds = new Set()) {
  const filtered = pickQuestions(courseSet, 1, excludeIds);
  if (filtered.length > 0) return filtered[0];
  const anyOf = pickQuestions(courseSet, 1, new Set());
  return anyOf[0] || null;
}

// Grade a quiz/dungeon answer. multiplechoice compares the chosen index to
// correctIndex; truefalse accepts either a numeric correctIndex or a string
// correctAnswer ('true'/'false'). Pure.
export function checkAnswerCorrect(question, choice) {
  if (!question) return false;
  if (question.type === 'multiplechoice') {
    return choice === question.correctIndex;
  }
  if (question.type === 'truefalse') {
    if (typeof question.correctIndex === 'number') return choice === question.correctIndex;
    if (typeof question.correctAnswer === 'string') {
      return norm(question.correctAnswer) === norm(choice === 0 ? 'true' : 'false');
    }
  }
  return false;
}
