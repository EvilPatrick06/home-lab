import { describe, it, expect } from 'vitest';
import { ORG_PROMPTS } from './index.js';

describe('ORG_PROMPTS', () => {
  it('is an array', () => {
    expect(Array.isArray(ORG_PROMPTS)).toBe(true);
  });

  it('every entry has the required metadata shape', () => {
    for (const p of ORG_PROMPTS) {
      expect(typeof p.id).toBe('string');
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(typeof p.name).toBe('string');
      expect(typeof p.emoji).toBe('string');
      expect(typeof p.subtitle).toBe('string');
      expect(typeof p.examTargetPlaceholder).toBe('string');
      expect(Array.isArray(p.commonExams)).toBe(true);
      expect(typeof p.prompt).toBe('string');
    }
  });

  it('every id is unique', () => {
    const ids = ORG_PROMPTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every prompt contains the EXAM TARGET line', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/EXAM TARGET:/);
    }
  });

  it('every prompt contains the shared schema marker', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/=== JSON SCHEMA ===/);
    }
  });

  it('every prompt mentions the Domain knowledge-base requirement', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/=== Domain/);
    }
  });

  it('every prompt mentions the fantasy-leak rule', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/fantasy/i);
    }
  });

  it('every prompt contains both a good and a bad exemplar', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/✅ GOOD/);
      expect(p.prompt).toMatch(/❌ BAD|❌ FANTASY LEAK|❌ NEVER/);
    }
  });
});

describe('CompTIA prompt', () => {
  it('is registered in ORG_PROMPTS', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'comptia');
    expect(c).toBeDefined();
    expect(c.name).toBe('CompTIA');
    expect(c.commonExams).toContain('Security+ SY0-701');
  });

  it('CompTIA prompt mentions PBQ and BEST/MOST qualifiers', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'comptia');
    expect(c.prompt).toMatch(/PBQ|performance-based/i);
    expect(c.prompt).toMatch(/BEST|MOST|FIRST/);
  });
});
