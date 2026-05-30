# Phase 34 — i18n full string sweep

> Authored 2026-05-30. Builds on the 34a foundation (shipped). Follow
> `INSTRUCTIONS.md`. Per rule 163 this sweep is done in full, file by file —
> not sampled, not foundation-only.

## Context
34a shipped the i18n foundation: `react-i18next` wired in `i18n/{config,index,
use-translation,types}.ts`, initialized in `main.tsx`, with a single
`translation` namespace whose resources are `locales/en.json` (currently only a
seeded `common.*` subtree). Keys are full dotted paths (`t('common.actions.save')`).
There are **no `useT()` consumers yet** — every user-facing string in the 398
renderer `.tsx` files (+ user-facing strings thrown/returned from services,
stores, hooks) is still a hard-coded English literal.

Phase 34 sweeps those literals onto the i18n pipeline:
- **Components** use the `useT()` hook: `const { t } = useT()` then `t('ns.key')`.
- **Non-component code** (services, stores, plain functions where hooks are
  illegal) uses the exported instance: `import { i18n } from '../i18n'` →
  `i18n.t('ns.key')`.
- **Each English value in `en.json` exactly equals the original literal**, so the
  rendered output is unchanged and text-assertion tests (`getByText('Save')`)
  keep passing. Interpolation: `` `Hi ${name}` `` → `t('ns.greeting', { name })`
  with value `"Hi {{name}}"`.

## Depends on / blocks
- **Depends on:** 34a foundation (shipped).
- **Blocks:** nothing (Phase 36 is independent).

## Mechanism — area-scoped sweeps + en.json fragments
The sweep is partitioned by area. To avoid one giant serialized edit (and
concurrent-edit conflicts on `en.json`), each area sweep writes its translation
subtree to a fragment file `i18n/locales/_fragments/<area>.json` under a unique
top-level namespace, and edits only its own `.tsx`/`.ts` files. After all sweeps
land, the fragments are merged into `en.json` (34j) and the `_fragments/` dir is
removed; the TranslationKeys generator (34k) then derives the literal-union type.

**Namespacing:** one top-level key per area (`pages`, `ui`, `lobby`, `campaign`,
`game`, `misc`, …); within it, group by component (`game.initiativeTracker.title`).
Reuse `common.*` for truly generic words (Save/Cancel/Close/Delete/Confirm/
Loading/empty/error) instead of duplicating them per area.

**Out of scope for wrapping** (leave as literals): code comments, `logger.*`
messages, dev-only/debug strings, test files, IPC channel names, data keys,
className strings, and any non-user-visible identifier.

## Sub-phases
- **34b** — `components/lobby` (reference implementation; establishes conventions).
- **34c** — `components/ui` + `components/campaign`.
- **34d** — `pages/` (split across agents as needed).
- **34e–34h** — `components/game/**` (340 files; split by subdirectory).
- **34i** — remaining user-facing strings in `services/`, `stores/`, `hooks/`,
  `components/*` not covered above (toasts, thrown errors surfaced to the user).
- **34j** — merge `_fragments/*` into `en.json`; remove the fragments dir.
- **34k** — TranslationKeys generator: derive a literal union from `en.json`
  (`types.ts` stops being a `string` stub) + a script/test that fails if a
  `t('…')` key is missing from `en.json`.
- **34l** — docs: short i18n contributor note (how to add a string/key).

## Constraints
- en.json values are byte-identical to the original literals (English unchanged).
- `useT()` obeys the Rules of Hooks (top of the component, above any early return).
- No behavior change; the 4-gate (lint/tsc/vitest) stays green. Text-assertion
  tests keep passing because the resolved English equals the old literal.
- One end-of-phase commit; one release.

## Completed
- 34a — foundation (pre-shipped): `i18n/` module + `useT()` + `en.json` seed +
  `main.tsx` init.
- 34b–34i — string sweep DONE across the whole renderer via area-scoped
  fragments (deep-merged into `en.json` by `scripts/i18n/merge-fragments.mjs`):
  `lobby`, `pages` (×2), `ui`, `campaign`, `game` (×7: bottom/cloud/dice3d/
  game-layout/map/modal-groups/player + modals×3 + overlays + dm + sidebar),
  `builder`, `sheet` (×2), `levelup`, `library`, `settings`, and `notify`
  (non-component toasts/DM-alerts via `i18n.t`). ~290 components + 14 non-component
  sites; **5,905 keys** in `en.json`. Generic words reuse `common.*`. en values are
  byte-identical to the originals (rendered text unchanged → text-assertion tests
  pass). Added `src/test-setup.ts` (vitest `setupFiles`) so `useT()` resolves in
  test renders. Fixed a `library-boundary` false-positive by renaming the colliding
  `{ level }` interpolation var → `{ lvl }` in AsiModal/ExpertiseModal/FeatureCard5e.
- 34j — DONE: `merge-fragments.mjs` rebuilds `en.json` deterministically (fragments
  authoritative for their namespaces; `common` seed preserved); `_fragments/` removed
  after merge.
- 34k — DONE: `scripts/i18n/check-keys.mjs` flattens `en.json` + scans 903 source
  files for static `t()`/`i18n.t()` calls, failing on any missing key (gated by
  `i18n/key-check.test.ts` in CI). **Literal-union `TranslationKeys` rejected** — a
  ~5,900-member union bloats compile time + forces regen on every added string; the
  runtime key-check catches the same bug class at no compile cost. `types.ts` stays
  `string` (decision documented in `i18n/README.md`).
- 34l — DONE: `i18n/README.md` contributor guide (useT vs i18n.t, interpolation,
  the shape-key var caveat, adding keys, the check-keys gate).
