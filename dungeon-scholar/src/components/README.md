# `src/components/` layout

Placement rule (documented per suggestion S20):

- **`src/components/ui/`** — generic, app-agnostic presentational modals and
  primitives (e.g. `ConfirmModal`, `ResetConfirmModal`, `AchievementsModal`,
  `TitlesModal`, `PromptModal`, `MergeChooser`). No app-specific business state.
- **`src/components/` (root)** — app-stateful chrome and shared widgets
  (`AccountPanel`, `SignInButton`, `ProfileChip`, `SyncStatusDot`,
  `ErrorBoundary`, banners, `RichContent`, `TomeNotes`).
- **`src/features/<area>/`** — feature-specific components (e.g. the library
  paste/import/share modals live under `features/library/`).
- **`src/hooks/`** — cross-cutting reusable hooks (e.g. `useDialogA11y`,
  `useAuth`, `usePlayerState`). Feature-local hooks may stay in their feature.

When adding a modal: if it is generic and presentational, put it in
`components/ui/`; if it carries app state/chrome, the root; if it is tied to one
feature, that feature folder.

## Test-file extension convention

Co-located tests take the extension of the **module they import/assert against**:

- `*.test.js` for a plain-JS module (`srs.js` -> `srs.test.js`, `dungeonMap.js` -> `dungeonMap.test.js`).
- `*.test.jsx` when the test renders React / asserts against a `.jsx` component (`DungeonExplore.jsx` -> `DungeonExplore.smoke.test.jsx`).

So a single component never carries both a `.test.js` and a `.test.jsx` — pick the one matching what the file actually exercises. (This is why `dungeonMap.js`'s suite, once misfiled as `components/dungeon/DungeonExplore.test.js`, now lives at `game/dungeonMap.test.js` as a `.test.js` — it tests a `.js` module.)

Codebase-wide **guard** tests (no single module under test) are the exception: they live in [`../__guards__/`](../__guards__/README.md) as `*.guard.test.js(x)`.