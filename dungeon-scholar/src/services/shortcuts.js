// Single source of truth for the keyboard shortcuts surfaced by the in-app
// ShortcutHelpModal (opened with `?`). The study/dungeon modes implement these
// bindings in their own keydown handlers; this map is the human-readable
// catalogue so the help overlay can't silently drift — when a binding changes,
// update it here too. Each group is a mode; each item pairs the key chord(s)
// with what they do.
export const SHORTCUT_GROUPS = [
  {
    title: 'Everywhere',
    items: [
      { keys: ['?'], action: 'Open this keyboard shortcuts help' },
      { keys: ['Esc'], action: 'Close a dialog / leave the current screen' },
      { keys: ['Ctrl', 'Z'], action: 'Undo the last action offered by a toast (e.g. theme change, vault banish)' },
    ],
  },
  {
    title: 'Scrolls of Knowledge (Flashcards)',
    items: [
      { keys: ['Space'], alt: ['Enter'], action: 'Flip the scroll' },
      { keys: ['1', '–', '4'], action: 'Rate recall after flipping (Again / Hard / Good / Easy)' },
      { keys: ['←'], action: 'Previous scroll' },
      { keys: ['→'], action: 'Next scroll' },
    ],
  },
  {
    title: 'Riddles of the Sphinx (Quiz)',
    items: [
      { keys: ['Enter'], alt: ['Space'], action: 'Advance to the next riddle' },
      { keys: ['1', '2', '3'], action: 'Set confidence (Low / Medium / High)' },
      { keys: ['T'], action: 'Answer True (true/false riddles)' },
      { keys: ['F'], action: 'Answer False (true/false riddles)' },
    ],
  },
  {
    title: 'Trials of Skill (Lab)',
    items: [
      { keys: ['1', '–', '9'], action: 'Select an answer option by number' },
      { keys: ['A', '–', 'Z'], action: 'Select an answer option by letter' },
    ],
  },
  {
    title: 'The Trial of Hours (Practice Exam)',
    items: [
      { keys: ['T'], action: 'Answer True (true/false questions)' },
      { keys: ['F'], action: 'Answer False (true/false questions)' },
    ],
  },
  {
    title: 'Dungeon Delve',
    items: [
      { keys: ['W', 'A', 'S', 'D'], alt: ['Arrows'], action: 'Move' },
      { keys: ['E'], action: 'Interact / face a foe' },
      { keys: ['Z', 'X', 'C'], action: 'Cast equipped spells (slots 1–3)' },
      { keys: ['1', '2', '3'], action: 'Quaff a potion from a quick slot' },
      { keys: ['Esc'], action: 'Leave the delve' },
    ],
  },
];
