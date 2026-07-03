# `dnd-app/scripts/` — script index

Tooling for building, releasing, validating, and maintaining the D&D VTT. This
index exists so dead/one-off scripts stay visible (the `submit/` cleanup below is
exactly the kind of rot an index surfaces).

## Conventions

- **`.mjs`** — plain Node ESM, run directly with `node scripts/…`. Used for
  build/release/lint/maintenance tooling that does not need type-checking.
- **`.ts`** — run with `tsx` (`tsx scripts/…`), type-checked. Used for
  content/schema tooling that shares the app's types.
- Scripts are treated as **knip entry points** via the `scripts/**` glob in
  `knip.json`, so `npm run dead-code` does **not** flag unused scripts. That is
  why an unreferenced script can rot unnoticed — audit this directory by hand
  (grep for the filename in `package.json` and across `scripts/`) rather than
  relying on the dead-code gate.

## Sub-areas

| Directory | Purpose |
|---|---|
| `audit/` | 5e content validation (cross-refs, schema-vs-content, homebrew). |
| `build/` | Build + packaging helpers: chunk index, prerelease clean, IPC-surface + doc-count generators, web/embed finalizers, Ollama fetch, postinstall, build verify. |
| `dev/` | Local dev helpers (multi-window launcher). |
| `i18n/` | Locale + translation-key tooling (key union, locale parity, fragment merge). |
| `lib/` | Shared helpers imported by other scripts (e.g. 5e refs path). |
| `lint/` | Custom lint checks beyond biome (forbidden patterns, file-size budget). |
| `maintenance/` | Repo maintenance (Electron EOL check, bundle-size budget). |
| `release/` | `cut.mjs` (single-command tag + push) and `auto-release.mjs`. |
| `schemas/` | Zod schema definitions per 5e system, used to validate content. |
| `smoke/` | Smoke tests (headless boot). |
| `submit/` | Per-system Anthropic Batch API submission. **Currently empty** — the phase-era `submit-*-batch.ts` scripts were retired (git history retains them); the intended per-`<system-id>` layout is documented in `docs/PLUGIN-SYSTEM.md` for future content systems. |
| `check-circular.mjs` (top level) | Circular-dependency check (`npm run circular`). |

## Wired vs ad-hoc

**Wired** = invoked from `package.json` scripts (and therefore by CI / release).
**Ad-hoc** = present in the tree but not referenced from `package.json`; run
manually when needed. Ad-hoc does not mean dead — but any ad-hoc script with no
callers anywhere is a cleanup candidate.

### Wired into `package.json`

| Script | Invoked by |
|---|---|
| `build/build-chunk-index.mjs` | `build:index` |
| `build/postinstall.mjs` | `postinstall` |
| `build/prerelease-clean.mjs` | `prerelease` |
| `build/verify-build.mjs` | `verify:build` |
| `build/gen-ipc-surface.mjs` | `gen:ipc-surface` (also called by `release/cut.mjs`) |
| `build/sync-doc-counts.mjs` | `sync:doc-counts`, `check:full` |
| `build/finalize-web.mjs` | `build:web` |
| `build/finalize-embed.mjs` | `build:embed` |
| `build/fetch-ollama.mjs` | Windows CI build step |
| `release/cut.mjs` | `release:cut` |
| `release/auto-release.mjs` | `release:auto` |
| `audit/check-5e-cross-refs.mjs` | `validate:5e` |
| `audit/validate-content-vs-schemas.ts` | `validate:content` |
| `i18n/gen-key-union.mjs` | `i18n:gen-keys` |
| `i18n/check-locale-parity.mjs` | `i18n:check-parity`, `check:full` |
| `lint/forbidden-patterns.mjs` | `lint:forbidden`, `check:full` |
| `lint/file-size-budget.mjs` | `lint:file-size` |
| `maintenance/electron-eol-check.mjs` | `check:electron-eol` |
| `maintenance/check-bundle-size.mjs` | `check:bundle-size` |
| `check-circular.mjs` | `circular`, `check:full` |

### Ad-hoc / on-demand (no `package.json` caller)

- `audit/dump-dead-refs.mjs`, `audit/ultimate-audit.ts`, `audit/validate-homebrew.ts`, `audit/shared-5e-sync.test.ts` (the `.test.ts` runs under vitest)
- `build/build-blank-jsons.ts`, `build/build-data-architecture.ts` (content scaffolding)
- `dev/two-windows-test.bat` (Windows dev launcher)
- `i18n/check-keys.mjs`, `i18n/merge-fragments.mjs`
- `lib/5e-refs-path.ts` (imported by other scripts, not run directly)
- `schemas/*.ts` (imported by audit/validate tooling, not run directly)
- `smoke/headless-boot.mjs`
