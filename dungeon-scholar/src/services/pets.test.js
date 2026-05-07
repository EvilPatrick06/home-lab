import { describe, it, expect } from 'vitest';
import {
  PETS,
  PET_LEVEL_XP,
  PET_MAX_LEVEL,
  petLevelFromXp,
  findPet,
} from './pets.js';

describe('PETS catalog', () => {
  it('has the expected 5 familiars', () => {
    expect(Object.keys(PETS).sort()).toEqual([
      'ember_dragon', 'glade_fox', 'mimic_pup', 'sewer_imp', 'wise_owl',
    ]);
  });

  it('every pet declares id, name, icon, biome, fromEgg, passive, base, perLevel', () => {
    Object.values(PETS).forEach((pet) => {
      expect(pet.id).toBeTruthy();
      expect(pet.name).toBeTruthy();
      expect(pet.icon).toBeTruthy();
      expect(pet.biome).toBeTruthy();
      expect(pet.fromEgg).toBeTruthy();
      expect(pet.passive).toBeTruthy();
      expect(typeof pet.base).toBe('number');
      expect(typeof pet.perLevel).toBe('number');
      expect(pet.spriteKey).toBeTruthy();
    });
  });

  it('every pet biome maps to one of the dungeon biome ids', () => {
    const validBiomes = new Set(['crypt', 'sewers', 'tower', 'halls', 'wastes']);
    Object.values(PETS).forEach((pet) => {
      expect(validBiomes.has(pet.biome)).toBe(true);
    });
  });
});

describe('PET_LEVEL_XP', () => {
  it('has 5 thresholds in strictly ascending order starting at 0', () => {
    expect(PET_LEVEL_XP[0]).toBe(0);
    expect(PET_LEVEL_XP).toHaveLength(5);
    for (let i = 1; i < PET_LEVEL_XP.length; i++) {
      expect(PET_LEVEL_XP[i]).toBeGreaterThan(PET_LEVEL_XP[i - 1]);
    }
  });

  it('PET_MAX_LEVEL matches the table length', () => {
    expect(PET_MAX_LEVEL).toBe(PET_LEVEL_XP.length);
  });
});

describe('petLevelFromXp', () => {
  it('returns 1 for fresh hatch (xp = 0)', () => {
    expect(petLevelFromXp(0)).toBe(1);
  });

  it('returns 1 for xp just below the L2 threshold', () => {
    expect(petLevelFromXp(PET_LEVEL_XP[1] - 1)).toBe(1);
  });

  it('returns 2 exactly at the L2 threshold', () => {
    expect(petLevelFromXp(PET_LEVEL_XP[1])).toBe(2);
  });

  it('returns the max level for xp far above the highest threshold', () => {
    expect(petLevelFromXp(PET_LEVEL_XP[PET_LEVEL_XP.length - 1] * 10)).toBe(PET_MAX_LEVEL);
  });

  it('hits each level boundary cleanly', () => {
    PET_LEVEL_XP.forEach((threshold, idx) => {
      expect(petLevelFromXp(threshold)).toBe(idx + 1);
    });
  });

  it('treats negative xp as L1 (defensive — not a real game state)', () => {
    expect(petLevelFromXp(-1)).toBe(1);
    expect(petLevelFromXp(-99999)).toBe(1);
  });
});

describe('findPet', () => {
  it('returns the pet definition for a known id', () => {
    expect(findPet('wise_owl')).toBe(PETS.wise_owl);
  });

  it('returns null for an unknown id', () => {
    expect(findPet('nonexistent_pet')).toBeNull();
    expect(findPet(undefined)).toBeNull();
    expect(findPet('')).toBeNull();
  });
});
