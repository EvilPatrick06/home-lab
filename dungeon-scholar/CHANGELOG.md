# Changelog

All notable changes to **dungeon-scholar** (the D&D-themed study app) are
documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file was seeded from `docs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md` and the phase
history (`dnd-app/docs/phases/`). Keep it updated on each release; group new work
under `[Unreleased]` and cut a dated, versioned section when a release is tagged.

## [Unreleased]

### Added
- PWA study reminders / re-engagement notifications (due cards, streak-at-risk).
- Dedicated study-stats "Scholar's Ledger" dashboard (accuracy trend, study time, per-domain mastery).
- Keyboard-accessible Dungeon Delve — a non-pointer / screen-reader path for the canvas game.
- Card / term search across a tome and the library.
- Practice-exam flag-for-review plus a question-navigator grid.
- Read-aloud (text-to-speech) for flashcards and questions.
- In-app tome authoring / editor (previously the only path was hand-writing JSON).
- Additional starter tomes from the bundled provider prompt sets.
- Minimal internationalization scaffold (`services/i18n.js` + `locales/en.js`); first chrome strings migrated through `t()`.

### Changed
- Dungeon canvas now honors `prefers-reduced-motion` (WCAG 2.3.3) in the render loop, not just CSS.
- Architecture cleanup: `DungeonExplore` God-file split into the React component, `components/dungeon/tileRenderer.js`, and `game/dungeonMap.js`; `DungeonExplore.jsx` colocated under `components/dungeon/`.
- `App.jsx` de-godded: tutorial auto-condition logic moved to `game/tutorial.js`, a screen registry added at `router/screens.js`, and the modal-visibility cluster moved behind a `useAppModals()` hook. The screen router now renders through that registry via a single `screenViews` dispatch (with an `App.test.jsx` smoke test) instead of a ~21-branch inline `screen === ...` ladder.

### Infrastructure
- PR-time CI gate added for dungeon-scholar / oracle-worker.

## [0.1.0] - 2025

### Added
- Initial dungeon-scholar study app: tome-based study modes (Quiz, Flashcards, Lab, Chat, Practice Exam), the Dungeon Delve mini-game, progression (XP, titles, achievements, quests), Supabase auth + cloud sync, and SRS scheduling.

[Unreleased]: https://example.invalid/dungeon-scholar/compare/v0.1.0...HEAD
[0.1.0]: https://example.invalid/dungeon-scholar/releases/tag/v0.1.0
