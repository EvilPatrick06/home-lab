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
    // Polish: per-question domain field on quiz/lab items.
    expect(SHARED_SCHEMA).toMatch(/domain/i);
    expect(SHARED_SCHEMA).toMatch(/tags/i);
    expect(SHARED_SCHEMA).toMatch(/DOMAIN TAGGING/i);
    expect(SHARED_SCHEMA).toMatch(/heatmap/i);
  });

  it('SHARED_SCHEMA documents metadata.domainWeights for exam-blueprint percentages (25e2)', () => {
    // 25e2: Domain Study screen needs exam-weight percentages alongside the
    // existing per-question domain field. domainWeights lives on metadata
    // and mirrors the published cert blueprint.
    expect(SHARED_SCHEMA).toMatch(/domainWeights/);
    // Schema must spell out that values are percentages summing to ~100.
    expect(SHARED_SCHEMA).toMatch(/percent|%/i);
    // Schema must call out that domainWeights keys must match per-question
    // domain strings — otherwise the Domain Study screen can't join them.
    expect(SHARED_SCHEMA).toMatch(/match.+domain|same.+domain/i);
  });

  it('SHARED_STYLE_RULES forbids fantasy in technical fields and permits it in explanation/hint', () => {
    expect(SHARED_STYLE_RULES).toMatch(/explanation/);
    expect(SHARED_STYLE_RULES).toMatch(/hint/);
    expect(SHARED_STYLE_RULES).toMatch(/technical/i);
    expect(SHARED_STYLE_RULES).toMatch(/fantasy/i);
  });

  it('SHARED_FOOTER mentions output format', () => {
    expect(SHARED_FOOTER).toMatch(/JSON/);
    expect(SHARED_FOOTER).toMatch(/code block|file/i);
  });
});
