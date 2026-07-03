# Changelog — dungeon-scholar

> **This file is a pointer, not a maintained per-release changelog.**
>
> dungeon-scholar has **no release/tag cadence**: the daily integrator's merge to
> `master` continuously auto-deploys the live GitHub-Pages site
> (`dungeon-scholar-deploy.yml`), and `package.json` stays at `0.1.0`. There is no
> "cut a versioned section when a release is tagged" trigger to hang a Keep-a-Changelog
> file on, so this file was frozen shortly after it was seeded (2026-06-23).
>
> **The living changelog for dungeon-scholar is, in order of granularity:**
>
> - **Completed phase plans** — [`docs/phases/completed/`](./docs/phases/completed/)
>   (each shipped `PHASE-NN-<slug>.md` is a feature/fix that landed), indexed by
>   [`docs/phases/PHASE-INDEX.md`](./docs/phases/PHASE-INDEX.md).
> - **Resolved issues/suggestions** —
>   [`../docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](../docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md),
>   each entry stamped with its resolution.
> - **The git history of `dungeon-scholar/`** — the authoritative record.
>
> This mirrors how dnd-app treats its GitHub Releases page as its changelog
> (see the repo-root `CHANGELOG.md`): the release/phase artifacts *are* the log, so
> there is nothing to hand-maintain here and no fabricated history is introduced.
>
> The historical Keep-a-Changelog seed (the original `[0.1.0]` snapshot and the
> aspirational `[Unreleased]` list it shipped with) is preserved below verbatim as an
> **archive**. It is not updated going forward — consult the three sources above for
> anything after 2026-06-23.

---

## Archived seed (frozen 2026-06-23 — do not update; see the pointer above)

### [Unreleased] (as seeded)

#### Added
- PWA study reminders / re-engagement notifications (due cards, streak-at-risk).
- Dedicated study-stats "Scholar's Ledger" dashboard (accuracy trend, study time, per-domain mastery).
- Keyboard-accessible Dungeon Delve — a non-pointer / screen-reader path for the canvas game.
- Card / term search across a tome and the library.
- Practice-exam flag-for-review plus a question-navigator grid.
- Read-aloud (text-to-speech) for flashcards and questions.
- In-app tome authoring / editor (previously the only path was hand-writing JSON).
- Additional starter tomes from the bundled provider prompt sets.
- Minimal internationalization scaffold (`services/i18n.js` + `locales/en.js`); first chrome strings migrated through `t()`.

#### Changed
- Dungeon canvas now honors `prefers-reduced-motion` (WCAG 2.3.3) in the render loop, not just CSS.
- Architecture cleanup: `DungeonExplore` God-file split into the React component, `components/dungeon/tileRenderer.js`, and `game/dungeonMap.js`; `DungeonExplore.jsx` colocated under `components/dungeon/`.
- `App.jsx` de-godded: tutorial auto-condition logic moved to `game/tutorial.js`, a screen registry added at `router/screens.js`, and the modal-visibility cluster moved behind a `useAppModals()` hook.

#### Infrastructure
- PR-time CI gate added for dungeon-scholar / oracle-worker.

### [0.1.0] - 2025

#### Added
- Initial dungeon-scholar study app: tome-based study modes (Quiz, Flashcards, Lab, Chat, Practice Exam), the Dungeon Delve mini-game, progression (XP, titles, achievements, quests), Supabase auth + cloud sync, and SRS scheduling.