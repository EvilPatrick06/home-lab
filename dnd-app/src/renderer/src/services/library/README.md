# Library Service — Contract

The library is the single source of truth for all D&D content (spells, monsters, items, classes, …). Consumers — Character Builder, Character Sheet, Level Up, in-game UIs, Bastion, encounter builder, chat tab-complete — never embed library data. They hold **references** to entries and let the hydration hooks splice the live entry in at render time.

## The three concepts

| Concept | Lives where | Example | Sync behavior |
|---|---|---|---|
| `EntryRef` | A field on a consumer record | `{ entryType: 'magic-items', entryId: 'wand-of-magic-missiles', overrides: { name: 'Pew Pew' } }` | Persists with the consumer; broadcasts on player-intent changes |
| Instance state | A sibling field on the same consumer record | `state: { magicItemAttuned: { wand123: true }, magicItemCharges: { wand123: 5 } }` | Persists with the consumer; hot-path sync during play |
| Library entry | `useLibraryStore.entries[category][id]` | `entries.spells.fireball.description = 'A bright streak…'` | One read, one write, every consumer sees the new value next render |

Never mix them. Current HP never goes in `overrides`. A renamed magic item never goes in `state`.

## How to read library data

Three hooks, three patterns:

```ts
import { useLibraryEntry, useLibraryEntries, useHydratedRef } from '@/services/library/use-library-entry'

// 1. Hydrate a single ref (95% of consumers do this)
const wand = useHydratedRef(character.magicItemRefs[0].ref)
// wand is LibraryMagicItemEntry with overrides applied, or null if unresolved

// 2. Read a raw entry by id (no overrides)
const fireball = useLibraryEntry('spells', 'fireball')

// 3. List all entries (with optional filter)
const allFeats = useLibraryEntries('feats')
const sneakOnly = useLibraryEntries('feats', (f) => f.name.includes('Sneak'))
```

All three return `null` / `[]` when entries don't exist (bootstrap, deleted, orphan). Consumers MUST handle null — render explicit "missing item" / "orphan — pick a replacement" UI. Don't crash; don't render placeholder data.

## Merge semantics

`useHydratedRef` walks `ref.overrides` recursively via `deepMergeObjects`:

| Override value | Behavior |
|---|---|
| Plain object | Merge key-by-key with the corresponding library value |
| Array | Replace atomically — customized list is the player's; no auto-merge |
| Primitive | Replace |
| `undefined` | Skip — base value retained |
| `null` | Replace — explicit null is meaningful (e.g. "remove a default tag") |

Removing an override (`delete ref.overrides.name`) restores the library default on next render with no data lost.

## Forbidden patterns

A vitest boundary spec fails the build on these outside the allowlist (`services/library/**`, `stores/use-library-store.ts`, `services/library-service.ts`, `services/adventure-loader.ts`):

```ts
// ❌ DON'T — raw JSON import
import spells from '/public/data/5e/spells/spells.json'

// ❌ DON'T — fetch the JSON directly
const r = await fetch('/data/5e/spells/spells.json')

// ❌ DON'T — inline a library entry on a consumer record
character.knownSpells = [{ name: 'Fireball', level: 3, description: '…' }]

// ❌ DON'T — branch on source
if (sourceOf[uid] === 'homebrew') { /* … */ }
```

Inline opt-out: add `// boundary-allow: <reason>` (reason required after the colon) on the offending line. Reviewers still own architectural review — the test catches the obvious case.

## React vs. non-React reads

| Context | API | Why |
|---|---|---|
| React component | hooks (`useLibraryEntry`, `useLibraryEntries`, `useHydratedRef`) | Render-cycle subscribed; mutations re-render automatically |
| Service / main process / migration | `useLibraryStore.getState().getEntry(category, id)` / `.getEntries(category)` | Hooks need a React tree; services don't. Same store, no hook plumbing. |

`services/data-provider.ts` is the official imperative façade — non-React callers (loaders, migration framework, main-process IPC) go through it. Its 83 `load5eX()` exports are thin wrappers around `useLibraryStore.loadCategory` + `getEntries`.

## Three sources, one store

`entries` holds official + homebrew + plugin entries together. `sourceOf[uid]` tags by provenance — read-only for Library page badges. Consumers don't branch on source.

| Source | Loader | Tag |
|---|---|---|
| Official | `loadCategory` walks `public/data/5e/**` | `sourceOf[uid] = 'official'` |
| Homebrew | `loadHomebrew` walks `userData/homebrew/**` | `sourceOf[uid] = 'homebrew'` |
| Plugin | `loadPluginContent` walks installed manifests | `sourceOf[uid] = 'plugin'` + `pluginId` |

Same Zod schema (`SCHEMA_REGISTRY[category]`) validates all three. Plugins can't ship "lite" entries — invalid raw is rejected at load with a warning.

Collisions: official ids are protected (plugin shipping `{ id: 'fireball' }` rejected at load); plugin ids are namespaced (`plugin:plugin-a:fireball`); homebrew rejected against an official id with "use a different id".

## Performance

- `getEntry(cat, id)` is O(1) — two object-property lookups
- `getEntries(cat, filter)` is O(n) per category (largest: `spells` ~500 entries)
- Hooks compose `useCallback`-stabilized selectors with Zustand's structural-equality selector — re-renders only on the changed `(category, id)` pair
- Runtime reads skip Zod validation; the cache is trusted

## Migration

> **DORMANT until the v3.0.0 release.** `CURRENT_SCHEMA_VERSION` is pinned at **3**, so `MIGRATIONS[4]` never fires yet — the v4 refs+state shape is additive and runs alongside the legacy v3 fields. The migration framework + `MigrationReportModal` + orphan detection are built but wired off; they activate when the schema version is bumped to 4 at the v3.0.0 cut. See the dormancy comment in `src/shared/migrations/v4-character-refs.ts`.

When active, `MIGRATIONS[4]` rewrites pre-Phase-15 saves to the refs + state shape on first load, snapshots the prior file to `<save>.pre-phase-15.bak`, and writes a per-character report at `app.getPath('userData')/migration-report.json` surfaced via `MigrationReportModal`. Idempotent: re-running on already-v4 data is a no-op.

Rollback: quit, locate `<save>.pre-phase-15.bak`, rename back over the original, downgrade.

## See also

- `docs/phases/phase-15-plan.md` — full phase plan + sub-phase mapping
- `docs/phases/bastion-data-rule.md` — Bastion contributor rules
- `schemas/registry.ts` — `SCHEMA_REGISTRY` + `validateEntry` / `safeValidateEntry`
- `merge.ts` — `deepMergeObjects` (override merge semantics)
- `library-boundary.test.ts` — the build-guard spec that enforces this contract
