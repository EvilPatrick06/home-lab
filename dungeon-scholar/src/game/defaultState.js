
export const DEFAULT_STATE = {
  level: 1,
  xp: 0,
  totalXp: 0,
  totalCorrect: 0,
  totalAnswered: 0,
  longestStreak: 0,
  oracleMessages: 0,
  vaultBanished: 0,
  modesUsed: [],
  achievements: [],
  unlockedTitles: [],
  selectedTitle: null,
  lastStudyDate: null,
  studyStreak: 0,
  dailyChallengeDate: null,
  dailyChallengeCompleted: false,
  // Phase 34b QA P10: theme preference. 'dark' (default) | 'light' | 'system'.
  // 'system' tracks prefers-color-scheme. Applied via data-theme on the root.
  // Light theme is intentionally PARTIAL — only the body background swaps to
  // off-white; the dungeon panels stay dark by design.
  theme: 'dark',
  // Library system
  library: [],
  activeTomeId: null,
  // Tutorial
  tutorialStepIndex: 0,
  tutorialCompleted: false,
  tutorialStarted: false,
  tutorialPanelCollapsed: false,
  tutorialBaselines: null,
  // Per-surface visit flags for tutorial action-button steps. Each of the
  // action-button steps advances only after the player navigates back /
  // closes the modal — credit on engagement, not on click.
  tutorialVisits: {
    library: false,
    vault: false,
    quests: false,
    achievements: false,
    titles: false,
    // 25e2: tracks first visit to the Domain Study screen.
    domain_study_visited: false,
    // 25g: post-Phase-16 features.
    bestiary: false,
    stable: false,
    spellbook: false,
    calendar: false,
    crafting: false,
    ascension: false,
  },
  // Dungeon attempt counter (any started run, including defeats)
  dungeonAttempts: 0,
  // Daily Quests
  dailyQuests: null,           // { date, quests: [{ id, baseline, claimed }] }
  modesUsedToday: [],          // tracked separately so it can reset daily
  // Weekly Quests
  weeklyQuests: null,          // { weekStart, quests: [{ id, baseline, claimed }] }
  // Story Quest Chains — keyed by chain id
  storyProgress: {},           // { [chainId]: { stepIndex, baseline, completed, claimedSteps: [] } }
  // Phase 17: Bestiary defeat tracker. { [kind]: { defeats, firstDefeatedAt } }
  bestiary: {},
  // Phase 18: Stable. Pets hatched from purchased eggs. The pet currently
  // walking with the scholar lives in equipped.pet (the petId string).
  // { [petId]: { hatchedAt, xp } } — level is derived from xp via PET_LEVEL_XP.
  pets: {},
  // Phase 19: Spellbook + casting setup. spellbook stores known spells
  // (one-time learn from arcanum scrolls). equippedSpells holds three
  // quick-slot spell ids (hotkeys Z/X/C inside the dungeon). maxMana is
  // the per-delve mana pool (mana itself is not persisted — it resets
  // each delve in DungeonExplore).
  spellbook: {},                 // { [spellId]: { learnedAt } }
  equippedSpells: [null, null, null],
  maxMana: 3,
  // Phase 20: Daily Devotion calendar. The scholar earns devotion by
  // logging in each day. lastClaimedDate is YYYY-MM-DD; loginStreak
  // increments by 1 if the previous claim was yesterday, resets to 1
  // on a gap. cycleDay is 1..7 — index into DAILY_REWARDS cycle.
  // Devotion is a soft currency for the Devotion section of the shop.
  devotion: 0,
  lastClaimedDate: null,
  lastClaimedAt: null, // M13 (17E): epoch-ms monotone fence; null for legacy saves (treated as no fence)
  loginStreak: 0,
  longestLoginStreak: 0,
  totalLogins: 0,
  cycleDay: 0,
  // Phase 23: Prestige & Ascension. Ascending resets level/xp/gold/items
  // but preserves titles, achievements, bestiary, pets, and spellbook.
  // Each ascension grants +1 token; tokens are spent on the Celestial
  // section of the shop. Players can ascend once they reach level 50.
  ascensions: 0,
  ascensionTokens: 0,
  lastAscendedAt: null,
  // 25j: cumulative counters powering the post-Phase-16 quest variants.
  // spellsCast bumps in DungeonExplore's pay() on every successful cast;
  // plantsHarvested bumps in harvestHere whenever a lootable deco yields
  // (the gold-only no-item path still counts as a harvest action).
  spellsCast: 0,
  plantsHarvested: 0,
  // Currency & Inventory
  gold: 0,
  inventory: {},               // { [itemId]: count } — consumables and cosmetics
  // Currently-equipped item ids per slot. Equipment grants in-dungeon
  // bonuses (HP, shields, XP/gold mults) and renders on the player sprite.
  // potions is a 3-element array — quick-use slots usable from hotkeys 1/2/3
  // inside the dungeon.
  equipped: {
    weapon: null,
    head: null,
    cloak: null,
    pet: null,
    potions: [null, null, null],
  },
  permUpgrades: {              // Sanctum stacks; raw counts (multiply by step for actual percent)
    maxHp: 0,
    goldDropPct: 0,
    startingPotions: 0,
    xpBonusPct: 0,
    rareDropPct: 0,
  },
};
