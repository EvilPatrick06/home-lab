# `src/features/` — feature folders

Each subfolder is **one screen group** for a distinct area of the app. A feature
folder owns its screen component(s) plus any hooks/modals that only that area
uses; shared presentation primitives live in [`../components/`](../components/README.md)
and framework-agnostic logic lives in [`../services/`](../services/README.md) or
[`../game/`](../game/). Screens are `React.lazy`-loaded (one chunk each) from
`App.jsx` via the router, keeping the initial bundle small.

## The folders

| Folder | Owns |
|---|---|
| `home/` | `HomeScreen` + the `AudioPanel` / `ThemePanel` it hosts |
| `study/` | The study modes — `FlashcardsMode`, `QuizMode`, `LabMode`, `ChatMode`, `ExamMode`, `MistakeVault`, `DomainStudyScreen` (+ `oracleSources` helper) |
| `library/` | `LibraryScreen` + the share / import / paste / metadata modals |
| `progression/` | The in-world progression screens — Shop, Inventory, Crafting, Bestiary, Stable, Spellbook, Calendar, Ascension, RunHistory |
| `quests/` | `QuestBoard` |
| `tutorial/` | `WelcomeModal`, `TutorialPanel` |
| `player/` | `usePlayerActions` — the hook that holds every player-state mutator |

## Placement rule

A new screen goes in the feature folder for its area (add a folder if it is a
genuinely new area). Co-locate its `*.test.jsx` next to it. A hook/modal used by
only one screen lives beside that screen; if two features need it, promote it to
`../components/` or `../hooks/`. Repo-wide convention-guard tests (e.g.
`phase11Guards.test.js` here) are the exception — see [`../__guards__/README.md`](../__guards__/README.md).
