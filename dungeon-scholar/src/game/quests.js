import { petLevelFromXp } from '../services/pets.js';
import { formatYmd } from '../utils/date.js';
import { BESTIARY_ENTRIES } from './bestiary.js';

// === Daily Quest System ===
// Each quest template specifies a target count and a counter source. The counter
// source is a function (state) -> number that returns a monotonically increasing
// value. A quest is complete when (currentCount - baselineCount) >= target.

export const DAILY_QUEST_POOL = [
  {
    id: 'study_scrolls',
    title: 'Study the Sacred Scrolls',
    description: 'Review {target} scrolls of knowledge',
    icon: '📜',
    target: 10,
    xp: 75,
    counter: 'cardsReviewed',
  },
  {
    id: 'solve_riddles',
    title: "Solve the Sphinx's Riddles",
    description: 'Answer {target} quiz riddles',
    icon: '🔮',
    target: 10,
    xp: 75,
    counter: 'quizAnswered',
  },
  {
    id: 'correct_streak',
    title: 'A Mind Unbroken',
    description: 'Get {target} correct answers',
    icon: '✨',
    target: 15,
    xp: 100,
    counter: 'totalCorrect',
  },
  {
    id: 'complete_run',
    title: 'Brave the Dungeon',
    description: 'Complete {target} dungeon delve(s)',
    icon: '⚔️',
    target: 1,
    xp: 100,
    counter: 'runsCompleted',
  },
  {
    id: 'defeat_boss',
    title: 'Slay a Dungeon Lord',
    description: 'Defeat {target} dungeon lord(s)',
    icon: '🐉',
    target: 1,
    xp: 150,
    counter: 'bossesDefeated',
  },
  {
    id: 'complete_lab',
    title: 'Endure the Trials',
    description: 'Complete {target} trial of skill',
    icon: '⚗️',
    target: 1,
    xp: 75,
    counter: 'labsCompleted',
  },
  {
    id: 'banish_foes',
    title: 'Banish the Forsaken',
    description: 'Remove {target} foes from thy Tome of Failures',
    icon: '🗡️',
    target: 3,
    xp: 60,
    counter: 'vaultBanished',
  },
  {
    id: 'consult_oracle',
    title: "Seek the Oracle's Wisdom",
    description: 'Send {target} messages to the Oracle or Tome Search',
    icon: '🪄',
    target: 3,
    xp: 50,
    counter: 'oracleMessages',
  },
  {
    id: 'flawless_streak',
    title: 'Path of the Pure',
    description: 'Build a {target}-answer correct streak',
    icon: '🔥',
    target: 5,
    xp: 80,
    counter: 'maxStreakToday',
    absolute: true,
  },
  {
    id: 'big_correct',
    title: 'Trial by Hundreds',
    description: 'Get {target} correct answers',
    icon: '💯',
    target: 30,
    xp: 200,
    counter: 'totalCorrect',
  },
  {
    id: 'mode_master',
    title: 'The Versatile Path',
    description: 'Use {target} different study modes',
    icon: '🎭',
    target: 3,
    xp: 75,
    counter: 'modesUsedToday',
    // modesUsedToday resets each day, so the diff-from-baseline math (built
    // for cumulative counters) double-counts yesterday's modes. absolute
    // compares the live (already today-only) count directly against target.
    absolute: true,
  },
  {
    id: 'card_marathon',
    title: "Scholar's Marathon",
    description: 'Review {target} scrolls',
    icon: '📚',
    target: 25,
    xp: 150,
    counter: 'cardsReviewed',
  },
  // 25j: post-Phase-16 daily variants — devotion, pet, spellcast.
  {
    id: 'claim_devotion',
    title: 'Kindle the Daily Flame',
    description: "Claim today's devotion offering",
    icon: '🕯️',
    target: 1,
    xp: 50,
    counter: 'totalLogins',
  },
  {
    id: 'level_familiar',
    title: 'Train a Familiar',
    description: 'Level up any familiar',
    icon: '🐾',
    target: 1,
    xp: 80,
    counter: 'petLevelsTotal',
  },
  {
    id: 'cast_spell',
    title: 'Loose an Incantation',
    description: 'Cast a spell within the dungeon',
    icon: '✨',
    target: 1,
    xp: 60,
    counter: 'spellsCast',
  },
];

// Get the counter value from current player state for a given counter id.
export const getCounterValue = (state, counterId) => {
  switch (counterId) {
    case 'cardsReviewed':
      return (state.library || []).reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0);
    case 'quizAnswered':
      return (state.library || []).reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0);
    case 'labsCompleted':
      return (state.library || []).reduce((s, t) => s + (t.progress?.labsCompleted || 0), 0);
    case 'runsCompleted':
      return (state.library || []).reduce((s, t) => s + (t.progress?.runsCompleted || 0), 0);
    case 'bossesDefeated':
      return (state.library || []).reduce((s, t) => s + (t.progress?.bossesDefeated || 0), 0);
    case 'oracleMessages':
      return (state.library || []).reduce(
        (s, t) => s + (t.progress?.chatHistory || []).filter((m) => m.role === 'user').length,
        0,
      );
    case 'totalCorrect':
      return state.totalCorrect || 0;
    case 'vaultBanished':
      return state.vaultBanished || 0;
    case 'currentStreak':
      return state.currentStreak || 0;
    case 'maxStreakToday':
      return state.maxStreakToday || 0;
    case 'maxStreakWeek':
      return state.maxStreakWeek || 0;
    case 'modesUsedToday':
      return (state.modesUsedToday || []).length;
    // 25j: post-Phase-16 counters powering the refreshed quest pool. All
    // are monotonically non-decreasing (cumulative) except equippedSpells
    // count and biomeBossesDefeated, which are 'absolute' on the quest
    // template so the diff-against-baseline math is bypassed.
    case 'totalLogins':
      return state.totalLogins || 0;
    case 'ascensions':
      return state.ascensions || 0;
    case 'petLevelsTotal':
      return Object.values(state.pets || {}).reduce((s, p) => s + petLevelFromXp(p?.xp || 0), 0);
    case 'spellsCast':
      return state.spellsCast || 0;
    case 'plantsHarvested':
      return state.plantsHarvested || 0;
    case 'equippedSpellsCount':
      return (state.equippedSpells || []).filter(Boolean).length;
    case 'biomeBossesDefeated': {
      const biomes = new Set();
      Object.entries(state.bestiary || {}).forEach(([kind]) => {
        const entry = BESTIARY_ENTRIES[kind];
        if (entry && entry.tier === 'boss') biomes.add(entry.biome);
      });
      return biomes.size;
    }
    default:
      return 0;
  }
};

// Pick N unique quests from the pool using a date-based deterministic shuffle.
export const pickDailyQuests = (dateStr, n = 3) => {
  // Simple seeded shuffle so a given date always returns the same set.
  const seed = dateStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const arr = [...DAILY_QUEST_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
};

// === Weekly Quest Pool ===
export const WEEKLY_QUEST_POOL = [
  {
    id: 'weekly_dungeons',
    title: 'Conqueror of the Depths',
    description: 'Complete {target} dungeon delves',
    icon: '🏰',
    target: 5,
    xp: 500,
    counter: 'runsCompleted',
  },
  {
    id: 'weekly_correct',
    title: 'A Week of Wisdom',
    description: 'Get {target} correct answers',
    icon: '📖',
    target: 100,
    xp: 600,
    counter: 'totalCorrect',
  },
  {
    id: 'weekly_bosses',
    title: 'Vanquisher of Lords',
    description: 'Defeat {target} dungeon lords',
    icon: '👑',
    target: 3,
    xp: 700,
    counter: 'bossesDefeated',
  },
  {
    id: 'weekly_labs',
    title: 'Master of the Trials',
    description: 'Complete {target} trials of skill',
    icon: '⚗️',
    target: 5,
    xp: 500,
    counter: 'labsCompleted',
  },
  {
    id: 'weekly_cards',
    title: 'The Devoted Reader',
    description: 'Study {target} sacred scrolls',
    icon: '📜',
    target: 75,
    xp: 500,
    counter: 'cardsReviewed',
  },
  {
    id: 'weekly_streak',
    title: 'Path of the Unbroken',
    description: 'Build a {target}-answer streak',
    icon: '⭐',
    target: 20,
    xp: 600,
    counter: 'maxStreakWeek',
    absolute: true,
  },
  // 25j: post-Phase-16 weekly variants — ascension, spell slots, harvest,
  // biome bosses. The two `absolute` quests check the current value
  // directly rather than the diff-from-baseline, so already-prepared
  // players (e.g. spell slots already full) can claim immediately.
  {
    id: 'weekly_ascend',
    title: 'Renew the Cycle',
    description: 'Ascend once this week',
    icon: '🌟',
    target: 1,
    xp: 800,
    counter: 'ascensions',
  },
  {
    id: 'weekly_spell_slots',
    title: 'Arsenal of the Arcane',
    description: 'Equip {target} spells in thy cast slots',
    icon: '✦',
    target: 3,
    xp: 400,
    counter: 'equippedSpellsCount',
    absolute: true,
  },
  {
    id: 'weekly_harvest',
    title: "The Herbalist's Sweep",
    description: 'Harvest {target} plants in the dungeon',
    icon: '🌿',
    target: 10,
    xp: 400,
    counter: 'plantsHarvested',
  },
  {
    id: 'weekly_biome_bosses',
    title: 'Walker of Every Hall',
    description: 'Defeat the lord of all {target} biomes',
    icon: '🏰',
    target: 5,
    xp: 1200,
    counter: 'biomeBossesDefeated',
    absolute: true,
  },
];

// Pick weekly quests deterministically from week-start date.
export const pickWeeklyQuests = (weekStartStr, n = 3) => {
  const seed = weekStartStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 7);
  const arr = [...WEEKLY_QUEST_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
};

// Get the start of the current week (Monday) as a date string.
export const currentWeekStartStr = () => {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day; // Monday-based
  d.setDate(d.getDate() + diff);
  return formatYmd(d);
};

// === Story Quest Chains ===
// Each chain is a sequence of steps. Steps unlock in order. Each step has
// a counter requirement (cumulative since chain started) or a special trigger.
export const STORY_CHAINS = [
  {
    id: 'apprentice_path',
    title: "The Apprentice's Path",
    description: 'A long journey from humble apprentice to seasoned scholar.',
    icon: '🌟',
    rewardTitleId: 'pathwalker',
    rewardXp: 1000,
    rewardGold: 250,
    steps: [
      {
        id: 'ap_step1',
        title: 'The First Page',
        narrative:
          '"Every great scholar begins with a single page turned. Read your first scroll, and the journey shall begin."',
        target: 1,
        counter: 'cardsReviewed',
        xp: 50,
      },
      {
        id: 'ap_step2',
        title: 'A Riddle Tested',
        narrative: '"The Sphinx watches all who would learn. Prove thy mind by answering five riddles correctly."',
        target: 5,
        counter: 'totalCorrect',
        xp: 75,
      },
      {
        id: 'ap_step3',
        title: 'The Trial Begun',
        narrative:
          '"Knowledge alone is not enough. Endure the trials and learn what hands-on mastery feels like — complete a single trial."',
        target: 1,
        counter: 'labsCompleted',
        xp: 100,
      },
      {
        id: 'ap_step4',
        title: 'Into the Dungeon',
        narrative:
          '"Now thou must prove thy courage. Brave the dungeon and emerge victorious — survive a single delve."',
        target: 1,
        counter: 'runsCompleted',
        xp: 150,
      },
      {
        id: 'ap_step5',
        title: "The Dragon's Fall",
        narrative: '"The dungeon lords are the true test. Defeat one and earn thy first laurels of glory."',
        target: 1,
        counter: 'bossesDefeated',
        xp: 200,
      },
      {
        id: 'ap_step6',
        title: 'Wisdom Through Repetition',
        narrative:
          '"True mastery comes from devotion. Study fifty scrolls, and the bond between thee and thy tome shall deepen."',
        target: 50,
        counter: 'cardsReviewed',
        xp: 200,
      },
      {
        id: 'ap_step7',
        title: "The Sphinx's Champion",
        narrative: '"Answer fifty riddles correctly, and the Sphinx herself shall name thee a worthy adversary."',
        target: 50,
        counter: 'totalCorrect',
        xp: 250,
      },
      {
        id: 'ap_step8',
        title: 'The Walker of the Path',
        narrative:
          '"Five dungeons cleared. Three trials endured. Thy apprenticeship draws to a close — and a greater journey awaits beyond."',
        target: 5,
        counter: 'runsCompleted',
        xp: 300,
        finalStep: true,
      },
    ],
  },
];

// Maps a story-step counter id to a player-facing action description, used by
// StoryStepCard to tell the user what to actually DO for the current step.
export const COUNTER_ACTIONS = {
  cardsReviewed: { icon: '📜', verb: 'Study', noun: 'sacred scroll' },
  totalCorrect: { icon: '✨', verb: 'Get', noun: 'correct answer' },
  quizAnswered: { icon: '🔮', verb: 'Answer', noun: 'riddle' },
  labsCompleted: { icon: '⚗️', verb: 'Complete', noun: 'trial of skill' },
  runsCompleted: { icon: '⚔️', verb: 'Complete', noun: 'dungeon delve' },
  bossesDefeated: { icon: '🐉', verb: 'Defeat', noun: 'dungeon lord' },
  oracleMessages: { icon: '🪄', verb: 'Consult', noun: 'Oracle whisper' },
  vaultBanished: { icon: '🗡️', verb: 'Banish', noun: 'vault foe' },
  currentStreak: { icon: '⭐', verb: 'Build', noun: 'answer streak' },
};

export const formatStoryAction = (counter, target) => {
  const a = COUNTER_ACTIONS[counter];
  if (!a) return `Reach ${target} progress`;
  const noun = target === 1 ? a.noun : `${a.noun}s`;
  return `${a.icon} ${a.verb} ${target} ${noun}`;
};
