// Tutorial logic — pure helpers only. UI lives in App.jsx.

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'The Scholar Awakens',
    description: 'Welcome to Dungeon Scholar, brave one. Thy quest for knowledge begins now. Press onward to learn the ways of this realm.',
    completionLabel: 'Continue',
    autoComplete: false,
    xp: 10,
  },
  {
    id: 'forge_tome',
    title: 'Behold the Spell of Tome Creation',
    description: 'Knowledge is sealed within sacred tomes. Open the Spell of Tome Creation to reveal the incantation that turns thy study materials into a tome any AI may forge.',
    completionLabel: 'Open the Spell',
    autoComplete: false,
    xp: 25,
    actionLabel: 'Open the Spell',
  },
  {
    id: 'inscribe_tome',
    title: 'Inscribe Thy First Tome',
    description: 'Now bring forth a tome. Use the Spell of Tome Creation with any AI familiar (Claude, ChatGPT, Gemini), then return here to inscribe the result. Or import a friend\'s share code, or upload an existing tome file.',
    completionLabel: 'Awaiting thy first tome...',
    autoComplete: true,
    autoCondition: 'has_tome',
    xp: 50,
  },
  {
    id: 'library_tour',
    title: 'The Sacred Library',
    description: 'Within the Sacred Library thou mayest hold many tomes. Switch betwixt them, share their codes with kin, or inscribe new ones whensoever the mood strikes.',
    completionLabel: 'Visit thy Library',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Visit thy Library',
  },
  {
    id: 'study_scroll',
    title: 'Read a Sacred Scroll',
    description: 'Open the Scrolls of Knowledge and study at least one scroll. Rate thy mastery to focus thy practice.',
    completionLabel: 'Open the Scrolls',
    autoComplete: true,
    autoCondition: 'studied_card',
    xp: 30,
  },
  {
    id: 'solve_riddle',
    title: 'Solve a Riddle',
    description: 'The Sphinx awaits with riddles to test thy wisdom. Answer one correctly to prove thyself.',
    completionLabel: 'Face the Sphinx',
    autoComplete: true,
    autoCondition: 'solved_quiz',
    xp: 30,
  },
  {
    id: 'face_trial',
    title: 'Face a Trial of Skill',
    description: 'Trials of Skill demand hands-on prowess. Engage with one trial — finish it or fall trying — to prove thy mettle.',
    completionLabel: 'Enter the Trials',
    autoComplete: true,
    autoCondition: 'lab_step',
    xp: 30,
  },
  {
    id: 'vault_intro',
    title: 'The Tome of Failures',
    description: 'Foes that have bested thee gather in the Tome of Failures, awaiting redemption. Banish them by answering true to clear thy slate.',
    completionLabel: 'Visit the Vault',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Visit the Vault',
  },
  {
    id: 'consult_oracle',
    title: 'Consult the Oracle',
    description: 'The Oracle and the Tome Search await thy questions. Ask one question of either to learn how their wisdom flows from thy tome.',
    completionLabel: 'Speak to the Oracle',
    autoComplete: true,
    autoCondition: 'oracle_used',
    xp: 30,
  },
  {
    id: 'quest_board',
    title: 'The Quest Board',
    description: 'Daily quests await on the Quest Board. Complete them as thou dost study to claim experience as thy bonus reward.',
    completionLabel: 'Visit the Quest Board',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Visit the Quest Board',
  },
  {
    id: 'enter_dungeon',
    title: 'Enter the Dungeon',
    description: 'The grand quest awaits. Step into the Dungeon Delve — five chambers and a dungeon lord lie within. Win or fall, the experience shall steel thee.',
    completionLabel: 'Brave the Dungeon',
    autoComplete: true,
    autoCondition: 'dungeon_completed',
    xp: 100,
  },
  {
    id: 'view_achievements',
    title: 'The Hall of Glory',
    description: 'The Hall of Glory holds thy achievements — milestones earned through valor, and those yet to claim. Behold thy progress.',
    completionLabel: 'Open the Hall of Glory',
    autoComplete: false,
    xp: 20,
    actionLabel: 'Open the Hall of Glory',
  },
  {
    id: 'view_titles_levels',
    title: 'Of Levels and Titles',
    description: 'Each XP earned advances thy stature. Reach new levels to unlock titles to wear with pride. Special titles await those who achieve great deeds.',
    completionLabel: 'View thy Stature',
    autoComplete: false,
    xp: 20,
    actionLabel: 'View thy Stature',
  },
  {
    id: 'manage_saga',
    title: 'Manage Thy Saga',
    description: 'Within the Manage Your Saga panel below thou mayest replay this Awakening, sign in to safeguard thy saga across devices, or begin anew if thy heart craves fresh ground. Thou hast walked every hall. Step forth, Initiated.',
    completionLabel: 'Complete the Awakening',
    autoComplete: false,
    xp: 20,
  },
];

// Old 8-step Awakening order, used to remap saved tutorialStepIndex
// values from journals exported before the overhaul. The new TUTORIAL_STEPS
// reorders + inserts steps; we look up the old step's id at the saved
// position and find its new index.
const OLD_TUTORIAL_ORDER = [
  'welcome',
  'forge_tome',
  'inscribe_tome',
  'study_scroll',
  'solve_riddle',
  'face_trial',
  'consult_oracle',
  'enter_dungeon',
];

export const migrateTutorialIndex = (savedIndex) => {
  const max = TUTORIAL_STEPS.length - 1;
  if (typeof savedIndex !== 'number' || Number.isNaN(savedIndex)) return 0;
  if (savedIndex < 0) return 0;
  if (savedIndex < OLD_TUTORIAL_ORDER.length) {
    const id = OLD_TUTORIAL_ORDER[savedIndex];
    const newIdx = TUTORIAL_STEPS.findIndex(s => s.id === id);
    return newIdx >= 0 ? newIdx : 0;
  }
  if (savedIndex > max) return max;
  return savedIndex;
};

export const snapshotBaselines = (state) => {
  const lib = state.library || [];
  return {
    libraryCount: lib.length,
    cardsReviewed: lib.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0),
    quizAnswered: lib.reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0),
    labsAttempted: lib.reduce((s, t) => s + (t.progress?.labsAttempted || 0), 0),
    oracleMessages: lib.reduce((s, t) => s + ((t.progress?.chatHistory || []).filter(m => m.role === 'user').length), 0),
    dungeonAttempts: state.dungeonAttempts || 0,
  };
};
