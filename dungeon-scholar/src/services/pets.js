// Pet familiars (Phase 18). Each pet hatches from a Stable egg, levels via
// per-delve XP, and grants a passive that scales with its level. The
// dungeon renders a sprite trailing the player using `spriteKey`.
//
// Passives are read by DungeonExplore via a small effect lookup keyed on
// pet.passive. See DungeonExplore.jsx for the per-stat math.

export const PETS = {
  wise_owl: {
    id: 'wise_owl', name: 'Wise Owl', icon: '🦉', spriteKey: 'owl',
    biome: 'tower', fromEgg: 'wise_owl_egg',
    lore: 'Hatched from an egg sealed in the highest archive. It hoots in cipher.',
    passive: 'xp_pct',         // +X% XP from this delve
    base: 5, perLevel: 2,      // L1 +5%, +2%/lvl  -> L5 = +13%
  },
  ember_dragon: {
    id: 'ember_dragon', name: 'Ember Dragon', icon: '🐉', spriteKey: 'dragon',
    biome: 'halls', fromEgg: 'dragon_hatchling',
    lore: 'A hatchling of forge-flame. Its scales grow brighter with every felled foe.',
    passive: 'shield_bonus',   // +N starting shields
    base: 1, perLevel: 0,      // flat +1 shield (level scales mob_score instead)
    secondary: 'mob_score', secondaryBase: 0, secondaryPerLevel: 1,
  },
  mimic_pup: {
    id: 'mimic_pup', name: 'Mimic Pup', icon: '🪙', spriteKey: 'mimic',
    biome: 'crypt', fromEgg: 'mimic_pup',
    lore: 'A treasure-hoarder in pup form. It sniffs out coin even buried in ciphertext.',
    passive: 'gold_pct',
    base: 10, perLevel: 3,     // L1 +10%, L5 +22%
  },
  glade_fox: {
    id: 'glade_fox', name: 'Glade Fox', icon: '🦊', spriteKey: 'fox',
    biome: 'wastes', fromEgg: 'fox_kit',
    lore: 'A nimble forager from the wastes. Doubles plant harvests on a whim.',
    passive: 'plant_double_pct',
    base: 15, perLevel: 5,     // L1 15% chance, L5 35%
  },
  sewer_imp: {
    id: 'sewer_imp', name: 'Sewer Imp', icon: '👹', spriteKey: 'imp',
    biome: 'sewers', fromEgg: 'sewer_imp_egg',
    lore: 'A pact-bound trickster. It eats the first wrong answer — once per delve.',
    passive: 'first_wrong_free',
    base: 1, perLevel: 0,
  },
};

// XP thresholds per pet level. Index = level reached when total XP >= entry.
// L1 starts at 0 (a freshly hatched pet is L1).
export const PET_LEVEL_XP = [0, 100, 300, 700, 1500];
export const PET_MAX_LEVEL = PET_LEVEL_XP.length;

export const petLevelFromXp = (xp) => {
  let lvl = 1;
  for (let i = 0; i < PET_LEVEL_XP.length; i++) {
    if (xp >= PET_LEVEL_XP[i]) lvl = i + 1;
  }
  return Math.min(lvl, PET_MAX_LEVEL);
};

export const findPet = (id) => PETS[id] || null;
