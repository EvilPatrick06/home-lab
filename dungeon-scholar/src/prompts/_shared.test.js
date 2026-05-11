import { describe, it, expect } from 'vitest';
import {
  SHARED_HEADER,
  SHARED_SCHEMA,
  SHARED_STYLE_RULES,
  SHARED_FOOTER,
} from './_shared.js';

describe('shared prompt sections', () => {
  it('SHARED_HEADER is a non-empty string and contains app name', () => {
    expect(typeof SHARED_HEADER).toBe('string');
    expect(SHARED_HEADER.length).toBeGreaterThan(100);
    expect(SHARED_HEADER).toMatch(/Dungeon Scholar/);
  });

  it('SHARED_HEADER sets a high quality bar', () => {
    expect(SHARED_HEADER).toMatch(/QUALITY BAR/);
    expect(SHARED_HEADER).toMatch(/indistinguishable|exam vendor publishes/i);
  });

  it('SHARED_SCHEMA documents every required field', () => {
    expect(SHARED_SCHEMA).toMatch(/metadata/);
    expect(SHARED_SCHEMA).toMatch(/knowledgeBase/);
    expect(SHARED_SCHEMA).toMatch(/flashcards/);
    expect(SHARED_SCHEMA).toMatch(/quiz/);
    expect(SHARED_SCHEMA).toMatch(/labs/);
    expect(SHARED_SCHEMA).toMatch(/objective/);
    expect(SHARED_SCHEMA).toMatch(/=== Domain/);
  });

  it('SHARED_SCHEMA requires per-question domain tagging for the heatmap', () => {
    expect(SHARED_SCHEMA).toMatch(/domain/i);
    expect(SHARED_SCHEMA).toMatch(/tags/i);
    expect(SHARED_SCHEMA).toMatch(/DOMAIN TAGGING/i);
    expect(SHARED_SCHEMA).toMatch(/heatmap/i);
  });

  it('SHARED_SCHEMA documents metadata.domainWeights for exam-blueprint percentages (25e2)', () => {
    expect(SHARED_SCHEMA).toMatch(/domainWeights/);
    expect(SHARED_SCHEMA).toMatch(/percent|%/i);
    expect(SHARED_SCHEMA).toMatch(/match.+domain|same.+domain/i);
  });

  it('SHARED_SCHEMA enforces volume minimums of 120/120/12', () => {
    // Prompt overhaul: bump from ≥80/≥80/≥8 to ≥120/≥120/≥12 to give cert
    // prep tomes enough breadth to mirror real-exam item counts.
    expect(SHARED_SCHEMA).toMatch(/120 flashcards/i);
    expect(SHARED_SCHEMA).toMatch(/120 quiz items/i);
    expect(SHARED_SCHEMA).toMatch(/12 labs/i);
  });

  it('SHARED_SCHEMA includes the proportional-coverage rule with example math', () => {
    // Prompt overhaul: items per domain must roughly match domainWeights
    // (±5%), not just hit a flat per-domain minimum. A 30%-weight domain
    // with only 5 items is a failure mode the rule prevents.
    expect(SHARED_SCHEMA).toMatch(/Proportional/i);
    expect(SHARED_SCHEMA).toMatch(/±5/);
  });

  it('SHARED_SCHEMA documents quiz type mix percentages', () => {
    // Prompt overhaul: default mix is 65-75% MC, 10-15% T/F, 10-15% fillblank.
    expect(SHARED_SCHEMA).toMatch(/65-75%/);
    expect(SHARED_SCHEMA).toMatch(/multiplechoice/);
    expect(SHARED_SCHEMA).toMatch(/truefalse/);
    expect(SHARED_SCHEMA).toMatch(/fillblank/);
  });

  it('SHARED_SCHEMA defines item-level difficulty 1-5 scale', () => {
    // Prompt overhaul: every flashcard/quiz/lab carries a 1-5 difficulty.
    expect(SHARED_SCHEMA).toMatch(/ITEM DIFFICULTY/i);
    expect(SHARED_SCHEMA).toMatch(/1-5/);
    expect(SHARED_SCHEMA).toMatch(/Trivial recall/i);
    expect(SHARED_SCHEMA).toMatch(/Expert judgment/i);
  });

  it("SHARED_SCHEMA defines item-level bloomLevel with all six tiers", () => {
    // Prompt overhaul: every flashcard/quiz/lab step carries a Bloom's level.
    expect(SHARED_SCHEMA).toMatch(/BLOOM'S LEVEL/i);
    expect(SHARED_SCHEMA).toMatch(/"remember"/);
    expect(SHARED_SCHEMA).toMatch(/"understand"/);
    expect(SHARED_SCHEMA).toMatch(/"apply"/);
    expect(SHARED_SCHEMA).toMatch(/"analyze"/);
    expect(SHARED_SCHEMA).toMatch(/"evaluate"/);
    expect(SHARED_SCHEMA).toMatch(/"create"/);
  });

  it('SHARED_SCHEMA requires KB coverage discipline for every tested concept', () => {
    // Prompt overhaul: every quiz/flashcard concept must have a KB paragraph
    // so the Oracle RAG can retrieve context when the student asks.
    expect(SHARED_SCHEMA).toMatch(/KB COVERAGE DISCIPLINE/i);
  });

  it('SHARED_STYLE_RULES forbids fantasy in technical fields and permits it in explanation/hint', () => {
    expect(SHARED_STYLE_RULES).toMatch(/explanation/);
    expect(SHARED_STYLE_RULES).toMatch(/hint/);
    expect(SHARED_STYLE_RULES).toMatch(/technical/i);
    expect(SHARED_STYLE_RULES).toMatch(/fantasy/i);
  });

  it('SHARED_STYLE_RULES enforces explanation depth (must address each distractor)', () => {
    // Prompt overhaul: explanations must address every wrong option by content,
    // not just say why the right one is right.
    expect(SHARED_STYLE_RULES).toMatch(/EXPLANATION DEPTH/i);
    expect(SHARED_STYLE_RULES).toMatch(/each wrong option|each distractor/i);
  });

  it('SHARED_STYLE_RULES defines distractor quality bar', () => {
    // Prompt overhaul: every distractor must be plausible to a 70%-prepared
    // candidate; combination-option traps and "All/None of the above" banned.
    expect(SHARED_STYLE_RULES).toMatch(/DISTRACTOR QUALITY/i);
    expect(SHARED_STYLE_RULES).toMatch(/70% prepared|70%-prepared/i);
    expect(SHARED_STYLE_RULES).toMatch(/All of the above/i);
  });

  it('SHARED_STYLE_RULES defines hint quality patterns', () => {
    // Prompt overhaul: hints follow one of four structured patterns
    // (elimination, key-word, common-trap, reverse-lookup) rather than
    // generic "trust thy gut" filler.
    expect(SHARED_STYLE_RULES).toMatch(/HINT QUALITY/i);
    expect(SHARED_STYLE_RULES).toMatch(/Elimination/i);
    expect(SHARED_STYLE_RULES).toMatch(/Common-trap/i);
  });

  it('SHARED_STYLE_RULES authorizes fenced inline artifacts (diagrams / code / logs) — 26f', () => {
    // Phase 26f: the reader renders triple-backtick fenced blocks; the
    // prompt must invite the AI to use them so diagrams, CLI snippets,
    // configs, and log lines render as monospace artifacts instead of
    // collapsing into unreadable prose.
    expect(SHARED_STYLE_RULES).toMatch(/INLINE ARTIFACTS/i);
    expect(SHARED_STYLE_RULES).toMatch(/fenced code blocks/i);
    expect(SHARED_STYLE_RULES).toMatch(/diagram/);
    expect(SHARED_STYLE_RULES).toMatch(/ascii/);
    expect(SHARED_STYLE_RULES).toMatch(/bash/);
    expect(SHARED_STYLE_RULES).toMatch(/yaml|json/);
    // Spans use single backticks for inline code (commands, IDs, paths)
    expect(SHARED_STYLE_RULES).toMatch(/inline backticks?/i);
    // Caveats — keep ascii aligned + bounded line/column counts
    expect(SHARED_STYLE_RULES).toMatch(/spaces only/i);
  });

  it('SHARED_STYLE_RULES lists explicit anti-patterns', () => {
    // Prompt overhaul: 10 anti-patterns spelled out so the AI rejects
    // low-effort question shapes that creep in by default.
    expect(SHARED_STYLE_RULES).toMatch(/ANTI-PATTERNS/i);
    expect(SHARED_STYLE_RULES).toMatch(/Pure-recall trivia/i);
    expect(SHARED_STYLE_RULES).toMatch(/Combination-option traps/i);
    expect(SHARED_STYLE_RULES).toMatch(/Throwaway distractors/i);
  });

  it('SHARED_FOOTER mentions output format and validation', () => {
    expect(SHARED_FOOTER).toMatch(/JSON/);
    expect(SHARED_FOOTER).toMatch(/code block|file/i);
    expect(SHARED_FOOTER).toMatch(/Validate before responding/i);
  });
});
