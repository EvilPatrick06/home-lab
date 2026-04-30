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
    description: 'Trials of Skill demand hands-on prowess. Complete a single stage of any trial — full completion is not required.',
    completionLabel: 'Enter the Trials',
    autoComplete: true,
    autoCondition: 'lab_step',
    xp: 30,
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
    id: 'enter_dungeon',
    title: 'Enter the Dungeon',
    description: 'The grand quest awaits. Brave one full Dungeon Delve to claim the Initiated title and complete thy awakening.',
    completionLabel: 'Brave the Dungeon',
    autoComplete: true,
    autoCondition: 'dungeon_completed',
    xp: 100,
  },
];

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
