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
