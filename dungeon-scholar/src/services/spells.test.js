import { describe, it, expect } from 'vitest';
import { SPELLS, findSpell } from './spells.js';

describe('SPELLS catalog', () => {
  it('has the expected 6 incantations', () => {
    expect(Object.keys(SPELLS).sort()).toEqual([
      'bolt_of_truth',
      'glyph_of_mending',
      'lance_of_lumens',
      'riftstep',
      'sigil_of_clarity',
      'ward_of_aegis',
    ]);
  });

  it('every spell declares id, name, icon, cost, biome, accent, desc, effect', () => {
    Object.values(SPELLS).forEach((spell) => {
      expect(spell.id).toBeTruthy();
      expect(spell.name).toBeTruthy();
      expect(spell.icon).toBeTruthy();
      expect(typeof spell.cost).toBe('number');
      expect(spell.cost).toBeGreaterThan(0);
      expect(spell.biome).toBeTruthy();
      expect(spell.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(spell.desc).toBeTruthy();
      expect(spell.effect).toBeTruthy();
    });
  });

  it('every spell cost fits within a reasonable mana pool (1-5)', () => {
    Object.values(SPELLS).forEach((spell) => {
      expect(spell.cost).toBeGreaterThanOrEqual(1);
      expect(spell.cost).toBeLessThanOrEqual(5);
    });
  });

  it('id matches the dictionary key', () => {
    Object.entries(SPELLS).forEach(([key, spell]) => {
      expect(spell.id).toBe(key);
    });
  });
});

describe('findSpell', () => {
  it('returns the definition for a known id', () => {
    expect(findSpell('glyph_of_mending')).toBe(SPELLS.glyph_of_mending);
  });

  it('returns null for an unknown id', () => {
    expect(findSpell('nope')).toBeNull();
    expect(findSpell(undefined)).toBeNull();
  });
});
