// Active spells (Phase 19). Each has a mana cost and an effect kind that
// DungeonExplore consumes via SPELL_EFFECTS.
//
// Players learn spells by purchasing one-time scrolls in the Arcanum
// (a shop category) — purchasing flips a flag in playerState.spellbook.
// Up to 3 known spells can be quick-slotted (hotkeys Q/W/E) for casting
// inside a delve. Mana starts at maxMana each delve and regenerates +1
// per correct answer (capped by maxMana).

export const SPELLS = {
  glyph_of_mending: {
    id: 'glyph_of_mending', name: 'Glyph of Mending', icon: '✨',
    cost: 2, biome: 'crypt', accent: '#34d399',
    desc: 'Restore 1 HP. Cannot exceed thy maximum.',
    effect: 'heal', amount: 1,
  },
  lance_of_lumens: {
    id: 'lance_of_lumens', name: 'Lance of Lumens', icon: '⚡',
    cost: 3, biome: 'tower', accent: '#60a5fa',
    desc: 'Smite the nearest mob outright — but bosses laugh at thy lance.',
    effect: 'smite_nearest_mob',
  },
  ward_of_aegis: {
    id: 'ward_of_aegis', name: 'Ward of Aegis', icon: '🛡️',
    cost: 2, biome: 'halls', accent: '#fbbf24',
    desc: 'Conjure a single shield bond. Useless if thou art already at max.',
    effect: 'shield', amount: 1,
  },
  bolt_of_truth: {
    id: 'bolt_of_truth', name: 'Bolt of Truth', icon: '📖',
    cost: 3, biome: 'sewers', accent: '#10b981',
    desc: 'In a battle, auto-resolve the current question correctly. Once per cast.',
    effect: 'auto_correct',
  },
  riftstep: {
    id: 'riftstep', name: 'Riftstep', icon: '🌀',
    cost: 2, biome: 'wastes', accent: '#a78bfa',
    desc: 'Slip back to the spawn chamber. Useful when surrounded by foes.',
    effect: 'teleport_spawn',
  },
  sigil_of_clarity: {
    id: 'sigil_of_clarity', name: 'Sigil of Clarity', icon: '👁️',
    cost: 1, biome: 'crypt', accent: '#f472b6',
    desc: 'Reveal the answer to the current battle question for one heartbeat.',
    effect: 'reveal_answer',
  },
};

export const findSpell = (id) => SPELLS[id] || null;
