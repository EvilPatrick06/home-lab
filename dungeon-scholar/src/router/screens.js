// Screen registry — the single source of truth for dungeon-scholar's top-level
// screens and their gating rules. Created to address the App.jsx God-component
// entry: previously the valid-screen list lived in `useHashRoute.js` ("copied
// from the App render switch") and the course-set / sealed gating arrays were
// inline literals in `App.jsx`. Centralizing them here removes that duplication
// and gives new screens one declarative place to register.

// All valid top-level screen ids, in nav/registration order.
export const SCREENS = Object.freeze([
  'home',
  'library',
  'shop',
  'inventory',
  'crafting',
  'bestiary',
  'stable',
  'spellbook',
  'calendar',
  'ascension',
  'history',
  'quests',
  'domainStudy',
  'vault',
  'dungeon',
  'flashcards',
  'quiz',
  'lab',
  'chat',
  'practiceExam',
  'ledger',
]);

const SCREEN_SET = new Set(SCREENS);

// Screens that read decrypted tome content and therefore require an active
// `courseSet`. With no tome loaded they bounce to home (PHASE-39 39G).
export const COURSE_SET_GATED = Object.freeze(['dungeon', 'flashcards', 'quiz', 'lab', 'chat', 'practiceExam']);

const COURSE_SET_GATED_SET = new Set(COURSE_SET_GATED);

// Screens that, when the active tome is sealed-but-locked, render the unlock
// prompt instead of the screen (PHASE-41 41B). Superset of COURSE_SET_GATED
// plus the content screens that have their own null-courseSet handling.
export const SEALED_GATED = Object.freeze([
  'flashcards',
  'quiz',
  'lab',
  'chat',
  'practiceExam',
  'dungeon',
  'vault',
  'domainStudy',
]);

const SEALED_GATED_SET = new Set(SEALED_GATED);

export const isValidScreen = (id) => SCREEN_SET.has(id);
export const screenRequiresCourseSet = (id) => COURSE_SET_GATED_SET.has(id);
export const screenSealedGated = (id) => SEALED_GATED_SET.has(id);
