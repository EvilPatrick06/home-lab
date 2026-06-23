// S16: bundled starter decks so a new install isn't an empty shelf. Kept small
// and factually safe (app usage + well-established study science) — NOT
// fabricated certification content, which should be authored/vetted by a human.
// The Library surfaces these in a "Starter decks" catalog that imports one on click.
const c = (id, front, back, domain) => ({ id, front, back, domain });
const q = (id, question, options, correctIndex, explanation) => ({ id, question, options, correctIndex, explanation });

export const STARTER_DECKS = [
  {
    id: 'starter-getting-started',
    title: 'Getting Started with Dungeon Scholar',
    description: 'Learn how the study modes work — a safe first deck to try every feature.',
    data: {
      metadata: { title: 'Getting Started with Dungeon Scholar', subject: 'App basics', author: 'Dungeon Scholar', description: 'How the study modes work.' },
      flashcards: [
        c('gs1', 'What does Flashcards mode use to schedule reviews?', 'Spaced repetition (SRS) — each card you rate is scheduled for a future day based on how well you knew it.', 'Modes'),
        c('gs2', 'How do you rate a flashcard?', 'Flip it (Space), then pick Again / Hard / Good / Easy (keys 1–4). Harder ratings bring the card back sooner.', 'Modes'),
        c('gs3', 'What is the Dungeon Delve?', 'A top-down RPG view of the same study queue — answer questions to defeat foes and reach the boss.', 'Modes'),
        c('gs4', 'What is Practice Exam mode for?', 'A timed, proctored-style exam: flag questions for review, use the navigator grid, and submit for a graded score.', 'Modes'),
        c('gs5', 'Where do you back up your progress?', 'The Account panel — Export journal downloads a save file; Import journal restores one. Cloud sync is optional.', 'App'),
      ],
      quiz: [
        q('gsq1', 'Which key flips a flashcard?', ['Space', 'Escape', 'Tab', 'Shift'], 0, 'Space (or Enter) flips the card; 1–4 then rate it.'),
        q('gsq2', 'What does a higher SRS rating (Easy) do?', ['Schedules the card further out', 'Deletes the card', 'Shows it again immediately', 'Marks the tome complete'], 0, 'Easier recall = longer interval before the next review.'),
      ],
      labs: [],
    },
  },
  {
    id: 'starter-study-skills',
    title: 'Study Skills & Spaced Repetition',
    description: 'Evidence-based learning techniques you can apply to any subject.',
    data: {
      metadata: { title: 'Study Skills & Spaced Repetition', subject: 'Learning science', author: 'Dungeon Scholar', description: 'Well-established study techniques.' },
      flashcards: [
        c('ss1', 'What is active recall?', 'Retrieving information from memory (testing yourself) rather than re-reading — it strengthens retention more than passive review.', 'Techniques'),
        c('ss2', 'What is spaced repetition?', 'Reviewing material at increasing intervals over time, which improves long-term retention compared to cramming.', 'Techniques'),
        c('ss3', 'What is interleaving?', 'Mixing different topics or problem types in one study session, which improves discrimination and transfer.', 'Techniques'),
        c('ss4', 'What is the testing effect?', 'The finding that taking practice tests improves later recall more than spending the same time restudying.', 'Techniques'),
        c('ss5', 'Why is cramming less effective for long-term memory?', 'Massed practice fades quickly; spaced, retrieval-based practice produces more durable learning.', 'Techniques'),
      ],
      quiz: [
        q('ssq1', 'Which is generally most effective for long-term retention?', ['Spaced retrieval practice', 'Highlighting text', 'Re-reading notes', 'Cramming the night before'], 0, 'Spacing + active recall consistently outperform passive review.'),
        q('ssq2', 'Interleaving means…', ['Mixing topics within a session', 'Studying one topic to mastery first', 'Only studying at night', 'Skipping hard material'], 0, 'Interleaving mixes problem types, aiding discrimination.'),
      ],
      labs: [],
    },
  },
];
