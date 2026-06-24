// Phase 46d: `theme` field added so the Choose Thy Title modal can
// surface a short teaser on locked '???' rows (hover/focus title attr).
// The theme is purely flavor — every rank title unlocks the same way
// (reach the listed level) — but it lets a glance at the modal tell the
// user "this one's scholarly" or "this one's martial".
export const TITLES = [
  { min: 1, max: 4, name: 'Apprentice', theme: 'Novice rank' },
  { min: 5, max: 9, name: 'Squire', theme: 'Martial novice' },
  { min: 10, max: 14, name: 'Adventurer', theme: 'Dungeon delver' },
  { min: 15, max: 19, name: 'Scholar of the Arcane', theme: 'Arcane learner' },
  { min: 20, max: 24, name: 'Loremaster', theme: 'Keeper of lore' },
  { min: 25, max: 29, name: 'Battle Mage', theme: 'Combat caster' },
  { min: 30, max: 39, name: 'Knight of the Codex', theme: 'Battle-sworn guardian' },
  { min: 40, max: 49, name: 'Arcane Sage', theme: 'Authority on the arcane' },
  { min: 50, max: 59, name: 'High Wizard', theme: 'Master of the arts' },
  { min: 60, max: 74, name: 'Grand Magister', theme: 'Wizardry leader' },
  { min: 75, max: 89, name: 'Archmage', theme: 'Apex caster' },
  { min: 90, max: 99, name: 'Lord of the Tomes', theme: 'Library lord' },
  { min: 100, max: 9999, name: 'Mythic Demigod', theme: 'Transcendent — beyond mortal rank' },
];

export const SPECIAL_TITLES = {
  flawless: { name: 'The Flawless', desc: 'Conquer a dungeon without a single mistake' },
  speedrunner: { name: 'The Swift', desc: 'Average under 5 seconds per riddle in a run' },
  vaultkeeper: { name: 'The Redeemed', desc: 'Banish all foes from your Tome of Failures' },
  bossslayer: { name: 'Dragonslayer', desc: 'Defeat a dungeon lord without losing a life' },
  centurion: { name: 'The Centurion', desc: 'Answer 100 riddles correctly' },
  streaker: { name: 'The Devoted', desc: 'Maintain a 7-day study streak' },
  initiated: { name: 'The Initiated', desc: "Complete the Scholar's Awakening tutorial" },
  pathwalker: { name: 'Pathwalker', desc: "Complete The Apprentice's Path story chain" },
  adeptVeteran: { name: 'Adept Veteran', desc: 'Complete a dungeon delve on Adept difficulty' },
  masterSlayer: { name: 'Master Slayer', desc: 'Complete a dungeon delve on Master difficulty' },
  mythicSage: { name: 'Mythic Sage', desc: 'Complete a dungeon delve on Mythic difficulty' },
};

export const xpForLevel = (lvl) => Math.floor(100 * lvl ** 1.5);

export const getTitle = (level, selectedSpecial, unlockedSpecials) => {
  if (selectedSpecial && unlockedSpecials.includes(selectedSpecial)) {
    return SPECIAL_TITLES[selectedSpecial].name;
  }
  const t = TITLES.find((t) => level >= t.min && level <= t.max);
  return t ? t.name : 'Apprentice';
};
