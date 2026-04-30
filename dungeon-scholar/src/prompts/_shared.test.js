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
