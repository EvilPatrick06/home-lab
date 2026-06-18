
// === Difficulty Tiers (Phase 8) ===
// Each tier scales waves, lives, available power-ups, and XP/gold multipliers.
// Apprentice is always unlocked; higher tiers gate on level/runs/achievements
// per the unlock predicate. Tier-specific rewards (achievement + special title)
// fire on first completion at that tier.
export const DIFFICULTIES = {
  apprentice: {
    label: 'Apprentice',
    icon: '🛡️',
    color: 'sapphire',
    lives: 3,
    waves: 5,
    powerups: { fiftyfifty: 2, hint: 2, freeze: 1 },
    xpMultiplier: 1,
    goldMultiplier: 1,
    description: 'The path of the novice. Three lives, five chambers, all aids permitted.',
    unlockText: null,
    completeAchievement: null,
    rewardTitleId: null,
  },
  adept: {
    label: 'Adept',
    icon: '⚔️',
    color: 'purple',
    lives: 3,
    waves: 7,
    powerups: { fiftyfifty: 1, hint: 1, freeze: 0 },
    xpMultiplier: 1.5,
    goldMultiplier: 1.25,
    description: "A seasoned reader's gauntlet. Seven chambers, fewer aids, sharper teeth.",
    unlockText: 'Reach level 10 — or complete 5 dungeon delves.',
    completeAchievement: 'adept_complete',
    rewardTitleId: 'adeptVeteran',
  },
  master: {
    label: 'Master',
    icon: '👑',
    color: 'amber',
    lives: 2,
    waves: 10,
    powerups: { fiftyfifty: 1, hint: 0, freeze: 0 },
    xpMultiplier: 2,
    goldMultiplier: 1.5,
    description: "A master's trial. Two lives, ten chambers, but a single aid in thy hand.",
    unlockText: 'Reach level 25 — or earn both Dragonslayer and Flawless Victory.',
    completeAchievement: 'master_complete',
    rewardTitleId: 'masterSlayer',
  },
  mythic: {
    label: 'Mythic',
    icon: '🌟',
    color: 'rose',
    lives: 1,
    waves: 12,
    powerups: { fiftyfifty: 0, hint: 0, freeze: 0 },
    xpMultiplier: 3,
    goldMultiplier: 2,
    description: 'A trial of legend. One life, twelve chambers, no quarter — only glory or oblivion.',
    unlockText: 'Reach level 50 — or complete a Master delve.',
    completeAchievement: 'mythic_complete',
    rewardTitleId: 'mythicSage',
  },
};


export const DIFFICULTY_ORDER = ['apprentice', 'adept', 'master', 'mythic'];


// === Boss Variety (Phase 9) ===
// One archetype is rolled at the start of each dungeon delve. Each carries its
// own mechanic, narrative, and a first-defeat achievement. The BossEncounter
// component renders the appropriate sub-flow on the final wave.
export const BOSS_TYPES = {
  lich: {
    id: 'lich',
    name: 'The Lich',
    icon: '💀',
    color: 'purple',
    flavor: 'A skeletal sorcerer wreathed in violet flame, tethered to centuries of forbidden lore.',
    mechanic: 'Chain five correct answers in a row. Any wrong answer breaks the chain to zero — but thy lives endure.',
    victoryText: 'The Lich crumbles to dust as thy knowledge unmakes its bindings.',
    defeatText: 'Thy lives ran dry before the chain could close. The Lich cackles in the dark.',
    achievement: 'first_lich',
    chainTarget: 5,
  },
  hydra: {
    id: 'hydra',
    name: 'The Hydra',
    icon: '🐉',
    color: 'emerald',
    flavor: 'Three serpentine heads writhe in unison, fangs bared, breathing ruin.',
    mechanic: 'Three riddles posed at once. Answer all three correctly — any miss costs a life and reshapes the heads.',
    victoryText: 'All three heads fall as one. The Hydra collapses with a final shriek.',
    defeatText: 'Thy lives ran dry under the Hydra\'s unceasing gaze.',
    achievement: 'first_hydra',
    headCount: 3,
  },
  riddler: {
    id: 'riddler',
    name: 'The Riddler',
    icon: '🃏',
    color: 'amber',
    flavor: 'A masked trickster who wagers the path on words alone.',
    mechanic: 'Three fill-in-the-blank riddles. No aids of magic or sage permitted.',
    victoryText: 'The Riddler bows to thy unaided wit and dissolves into mist.',
    defeatText: 'The Riddler twirls his cane. "Better luck in the next life, scholar."',
    achievement: 'first_riddler',
    riddleCount: 3,
  },
  sphinx: {
    id: 'sphinx',
    name: 'The Sphinx',
    icon: '🦁',
    color: 'sapphire',
    flavor: 'A regal beast whose patience is measured in falling sand.',
    mechanic: 'Three riddles, fifteen heartbeats each. Hesitation is its own answer — and the wrong one.',
    victoryText: 'The Sphinx rises and steps aside. The path is thine.',
    defeatText: 'The hourglass emptied before thy answer formed. The Sphinx remains.',
    achievement: 'first_sphinx',
    riddleCount: 3,
    secondsPerRiddle: 15,
  },
  behemoth: {
    id: 'behemoth',
    name: 'The Behemoth',
    icon: '🪨',
    color: 'rose',
    flavor: 'A mountain of muscle and bone, scarred by ages of battle.',
    mechanic: 'Seven blows to fell — but each missed strike costs TWO lives.',
    victoryText: 'The Behemoth topples like a felled oak. The earth shakes with its passing.',
    defeatText: 'The Behemoth\'s roar shakes the chamber. Thy strength is spent.',
    achievement: 'first_behemoth',
    hitsToFell: 7,
    lifeCost: 2,
  },
};


export const BOSS_ORDER = ['lich', 'hydra', 'riddler', 'sphinx', 'behemoth'];


export const rollBoss = () => BOSS_ORDER[Math.floor(Math.random() * BOSS_ORDER.length)];


// Returns true if the player meets the unlock requirement for a difficulty.
// Apprentice is always unlocked. Higher tiers gate on level / runs / specific
// achievements per the spec.
export const isDifficultyUnlocked = (state, diffId) => {
  if (diffId === 'apprentice') return true;
  const totalRuns = (state.library || []).reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0);
  const ach = state.achievements || [];
  if (diffId === 'adept') {
    return (state.level || 1) >= 10 || totalRuns >= 5;
  }
  if (diffId === 'master') {
    return (state.level || 1) >= 25 || (ach.includes('flawless') && ach.includes('first_boss'));
  }
  if (diffId === 'mythic') {
    return (state.level || 1) >= 50 || ach.includes('master_complete');
  }
  return false;
};
