# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-22] Orphaned duplicate `docs/PLUGIN-SYSTEM.md` diverges from canonical `dnd-app/docs/PLUGIN-SYSTEM.md`

- **Category:** docs, debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
Two files are titled "Plugin System — dnd-app": the canonical one at `dnd-app/docs/PLUGIN-SYSTEM.md` (~11 KB, last touched 2026-06-19 — the file the README "Docs index" links and that `dnd-app/docs/phases/completed/PHASE-38-plugin-platform.md` documents) and an older, shorter copy at the repo root `docs/PLUGIN-SYSTEM.md` (~6.6 KB, 2026-06-18). The root copy is **not** linked from the README docs index, and its own body (line ~16) points readers to the dnd-app copy as authoritative — so it is effectively an orphaned, partial duplicate of a project-specific doc parked at repo root. Two divergent copies of the same API doc will drift; a contributor who opens the root copy gets stale/incomplete info.

**Hypothesis / root cause:** the root copy predates moving the plugin doc into `dnd-app/docs/` and was never removed.

**Proposed fix / improvement:**
- [ ] Delete `docs/PLUGIN-SYSTEM.md` (canonical content lives in `dnd-app/docs/PLUGIN-SYSTEM.md`), or reduce it to a one-line pointer if an at-root stub is wanted.
- [ ] While here, audit other dnd-app-only docs parked at repo-root `docs/` (e.g. `docs/OLLAMA-TUNING.md` — "Ollama tuning (dnd-app AI DM)") and consider relocating them under `dnd-app/docs/`, reserving repo-root `docs/` for genuinely cross-project material (`ARCHITECTURE.md`, `DATA-FLOW.md`, `RULES-RETRIEVAL.md` which spans dnd-app+bmo, the logs).

**Related files:** `docs/PLUGIN-SYSTEM.md`, `dnd-app/docs/PLUGIN-SYSTEM.md`, `docs/OLLAMA-TUNING.md`, `README.md`

### [2026-06-22] `docs/superpowers/` is an undocumented, opaquely-named plans/specs dir orphaned from the docs index

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`docs/superpowers/{plans,specs}/` holds six dated design docs from 2026-04-29/30 (dungeon-scholar accounts & cloud-save sync, tutorial overhaul, tome-creation prompt overhaul). The directory is referenced by **no** markdown file in the repo, is absent from the README "Docs index", and its name ("superpowers") refers to the agent skill that authored the plans, not their content — so a new reader cannot discover it or guess what it holds. Several plans appear already implemented (e.g. the accounts/cloud-save plan — dungeon-scholar now ships Supabase auth per the README), making them stale planning artifacts. The repo already has an established convention for finished design docs: `_archive/` (e.g. the existing `_archive/2026-06-10-completed-docs/` batch).

**Proposed fix / improvement:**
- [ ] Confirm implementation status of each plan/spec; move completed ones into a dated `_archive/<date>-completed-docs/` batch per the `_archive/README.md` convention.
- [ ] For any still-active plans, give them a documented home: add the directory to the README "Docs index" and/or rename it to something self-describing (e.g. `docs/plans/`).

**Related files:** `docs/superpowers/`, `README.md` (Docs index), `_archive/README.md`


### [2026-06-22] `oracle-worker/` is a live deployed project absent from the documented project list + logging triage

- **Category:** debt
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`oracle-worker/` is a real, deployed sub-project at the repo root (a Cloudflare Worker — `wrangler.toml`, `src/`, `package.json` with a `wrangler` devDep). It backs `dungeon-scholar`s Oracle proxy (AI grading/chat) and is wired into `.github/workflows/deploy.yml` via `VITE_ORACLE_ENDPOINT`. Yet it is missing from every "what projects live here" surface:
- `README.md` § Projects says "**Three** loosely coupled projects" and lists only dnd-app / bmo / dungeon-scholar.
- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` repo-at-a-glance lists do not include it.
- `docs/LOG-INSTRUCTIONS.md` triage table has no `oracle-worker` row and there is no oracle-worker issues/suggestions log — discoveries about it currently have no documented home (they get filed under bmo/dnd-app by convention, e.g. the existing CI-gate entry).

A new contributor (or agent) reading the canonical docs would not know oracle-worker exists or that it ships to production.

**Hypothesis / root cause:** oracle-worker was added after the "three projects" framing and the docs/triage scaffolding were written; nobody retrofitted the project inventory.

**Proposed fix / improvement:**
- [ ] Add oracle-worker to README § Projects (and bump "Three" → "Four", or reframe as "three apps + one edge worker").
- [ ] Mention it in AGENTS.md / CLAUDE.md / GEMINI.md repo-at-a-glance.
- [ ] Decide its logging home: either add an `oracle-worker` domain (own logs + triage row) or explicitly fold it under dungeon-scholar in `docs/LOG-INSTRUCTIONS.md` (it is dungeon-scholars backend).

**Related files:** `oracle-worker/`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/LOG-INSTRUCTIONS.md`, `.github/workflows/deploy.yml`

### [2026-06-22] `AGENTS.md` (designated canonical AI guide) describes only TWO domains while the repo has 3-4

- **Category:** docs
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`AGENTS.md` opens with "**home-lab** is a monorepo with **two domains** that communicate via HTTP" and then enumerates only `dnd-app/` and `bmo/`. But `README.md`, `CLAUDE.md`, and `GEMINI.md` all describe **three** domains (they include `dungeon-scholar/`), and `oracle-worker/` makes four code areas. AGENTS.md is explicitly labelled the **canonical** AI-agent instructions file ("read by Cursor, Codex, Claude Code, most AI tools"), so the most-trusted guide is the most stale: any agent that reads only AGENTS.md is unaware dungeon-scholar (and oracle-worker) exist. This is a concrete factual error, distinct from the general "four guides drift" observation already logged in the domain suggestion logs — here the canonical file omits an entire shipped project.

**Hypothesis / root cause:** dungeon-scholar was added to the monorepo after AGENTS.md was written; CLAUDE.md/GEMINI.md/README were updated but AGENTS.md was missed.

**Proposed fix / improvement:**
- [ ] Update AGENTS.md "two domains" intro to cover dnd-app + bmo + dungeon-scholar (+ oracle-worker), matching CLAUDE.md/GEMINI.md/README.
- [ ] Consider the already-suggested sync-check so the canonical file cannot silently diverge again.

**Related entries:** see "four overlapping AI-assistant guides" entry in `docs/BMO-SUGGESTIONS-LOG.md` / `docs/SUGGESTIONS-LOG-DNDAPP.md` (general drift).

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`

### [2026-06-22] Compatibility-pointer stubs say logs split "in two places" — omit the dungeon-scholar logs that already exist

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
Three legacy pointer stubs in `docs/` are now stale relative to the actual log layout:
- `docs/ISSUES-LOG.md`: "logged in **two places** by domain" → lists only BMO + dnd-app.
- `docs/SUGGESTIONS-LOG.md`: same, lists only BMO + dnd-app.
- `docs/RESOLVED-ISSUES.md`: same, lists only BMO + dnd-app.

But `docs/` already contains the dungeon-scholar logs (`ISSUES-LOG-DUNGEON-SCHOLAR.md`, `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`, `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`) and `LOG-INSTRUCTIONS.md`s triage table is fully three-way domain-split. So the three back-compat pointers under-document the real structure (a reader following a stub would never discover the dungeon-scholar logs). They also predate oracle-worker.

**Hypothesis / root cause:** the pointers were written during the original two-domain (bmo/dnd-app) split and never updated when dungeon-scholar got its own log set.

**Proposed fix / improvement:**
- [ ] Update the three stub pointers to list all current domain logs (or replace them with a single redirect to `LOG-INSTRUCTIONS.md`s triage table, the actual source of truth).

**Related files:** `docs/ISSUES-LOG.md`, `docs/SUGGESTIONS-LOG.md`, `docs/RESOLVED-ISSUES.md`, `docs/LOG-INSTRUCTIONS.md`

### [2026-06-22] Orphaned `node_modules/` (vite cache) at repo root with no root `package.json`

- **Category:** debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
The repo root has a `node_modules/` directory containing only `.vite/` and `.vite-temp/` (a stray Vite optimize cache) but there is **no** root `package.json` or `package-lock.json` — this is a monorepo of independently-installed sub-projects (dnd-app, dungeon-scholar, oracle-worker each have their own). The root `node_modules/` is gitignored so it is not committed, but its presence is misleading: it implies a root-level npm workspace that does not exist, and the cache can go stale. Likely created by running a Vite/electron-vite command from the repo root by mistake.

**Proposed fix / improvement:**
- [ ] Delete the root `node_modules/` (regenerable) and confirm no tooling expects a root install.
- [ ] If a root-level install is ever intended (e.g. shared dev tooling / a real workspace), add a root `package.json` to make it explicit; otherwise leave none.

**Related files:** `node_modules/` (repo root), `.gitignore`

### [2026-06-22] Root `.editorconfig` only configures `[*.sh]` — no shared editor baseline for the TS/JS/Py/JSON that dominate the repo

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
The repo-root `.editorconfig` declares `root = true` and exactly one section, `[*.sh]` (charset + final newline — added narrowly to stop a shell-script BOM, per `BMO-RESOLVED-ISSUES.md`). EditorConfig is the one config mechanism that cascades to *every* subdirectory and every editor automatically, so it is the natural place for a monorepo-wide baseline — yet it covers none of the languages that actually make up the tree: by tracked-file count the repo is ~3077 JSON, ~1323 TS, ~731 TSX, ~202 PY, ~190 MD, ~106 JS. That baseline matters more here than in a normal repo because the per-project linting is uneven: `dnd-app` ships `biome.json`, but `dungeon-scholar` and `oracle-worker` have no linter/formatter at all (logged separately), and `bmo` is Python. A shared `.editorconfig` covering indent style/size, `charset = utf-8`, `insert_final_newline`, and `trim_trailing_whitespace` for `[*.{ts,tsx,js,jsx,mjs,json,py,md}]` would give all four projects a consistent floor regardless of which (if any) linter each one runs — and costs nothing to add.

**Hypothesis / root cause:** the file was created reactively for a single shell-script fix and never grown into a real cross-project baseline.

**Proposed fix / improvement:**
- [ ] Add language sections to `.editorconfig` (`[*.{ts,tsx,js,jsx,mjs}]`, `[*.{json}]`, `[*.py]`, `[*.md]`) with indent + charset + final-newline + trim-trailing-whitespace, keeping the existing `[*.sh]` rules.
- [ ] Keep settings aligned with `dnd-app/biome.json` so the two don't fight where they overlap.

**Related files:** `.editorconfig`, `dnd-app/biome.json`

### [2026-06-22] `docs/RULES-RETRIEVAL.md` — a genuinely dual-domain (dnd-app + bmo) reference — is missing from the README "Docs index"

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Repo-wide cleanup/reorg scan.

**Description:**
`docs/RULES-RETRIEVAL.md` is, by its own header, "the authoritative reference for the retrieval stack across **both** engines: the TypeScript one in `dnd-app/src/main/ai/` and its Python twin in `bmo/pi/services/rag_search.py`." That makes it one of the few docs that legitimately belongs at the repo-root `docs/` (it spans two domains, unlike `docs/OLLAMA-TUNING.md` / `docs/PLUGIN-SYSTEM.md`, which are dnd-app-only — those are covered by a separate entry). Yet it appears **nowhere** in the README "Docs index" (neither the "Architecture & deep dives" list at lines ~91-100 nor the project-doc lists), and is referenced only by a completed phase doc (`dnd-app/docs/phases/completed/PHASE-24-rules-rag-hybrid.md`) and by `docs/OLLAMA-TUNING.md`. A contributor or agent browsing the README cannot discover the canonical cross-engine retrieval reference, increasing the odds the TS and Python implementations drift without anyone consulting the shared spec.

**Hypothesis / root cause:** the doc was added in PHASE-24 but never wired into the README index when it landed.

**Proposed fix / improvement:**
- [ ] Add `docs/RULES-RETRIEVAL.md` to the README "Docs index" (it sits naturally alongside `ARCHITECTURE.md` / `DATA-FLOW.md` as a cross-engine architecture doc).
- [ ] While editing the index, sweep `docs/` for any other unlinked cross-project docs so the index stays a complete map of repo-root `docs/`.

**Related files:** `README.md` (Docs index, ~lines 91-100), `docs/RULES-RETRIEVAL.md`
### [2026-06-22] No `.github/dependabot.yml` — version-update coverage is implicit/incomplete despite a documented integrator Dependabot workflow

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
The repo has **no** `.github/dependabot.yml` anywhere (searched repo-wide), yet `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 3.B gives the daily `integrator` a whole Dependabot-PR review/merge process, and merged Dependabot PRs already exist in history (e.g. `dependabot/pip/bmo/pi/...`, PR #17). Without a config file, Dependabot only opens *security* update PRs (enabled via repo settings); scheduled *version* updates require the config. So routine version bumps are not guaranteed across the repo's ecosystems — npm in three dirs (`dnd-app/`, `dungeon-scholar/`, `oracle-worker/`), pip in `bmo/pi/` (which uses pip-tools `requirements*.in/.txt`), and `github-actions` (the workflows pin `actions/setup-node@v6`, `actions/setup-python@v6`, etc.). The result is uneven dependency freshness across all projects and a documented integrator process whose input is only partially configured.

**Hypothesis / root cause:** security updates were turned on in repo settings and have been sufficient so far; nobody added an explicit version-update config as projects multiplied.

**Proposed fix / improvement:**
- [ ] Add `.github/dependabot.yml` with `package-ecosystem` entries for each path: `npm` (`/dnd-app`, `/dungeon-scholar`, `/oracle-worker`), `pip` (`/bmo/pi`), and `github-actions` (`/`), with a sensible schedule and grouping; respect bmo's pip-tools lockfile flow (`requirements.in` is the edit surface).
- [ ] OR, if security-only updates are the deliberate policy, document that in `docs/CONTRIBUTING.md` / the integrator doc so the absence of a config is intentional, not an oversight.

**Related files:** `.github/dependabot.yml` (absent), `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (Rule 3.B), `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `bmo/pi/requirements*.in`

### [2026-06-22] Three CI workflows lack a `concurrency` group while six siblings have one — duplicate/superseded runs waste Actions minutes

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
Of the 9 workflows, 6 define a `concurrency:` group (`bmo-deploy`, `bmo-docker-build`, `bmo-pi-pytest`, `codeql`, `deploy`, `release`) but 3 do **not**: `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, `security-audit.yml`. All three trigger on both `push` and `pull_request`, so when a branch with an open PR is pushed, the heavy gates run **twice in parallel** (the dnd-app CI gate is the expensive one: lint → forbidden-patterns → tsc ×2 → full vitest → build → verify). `dnd-app-ci.yml` additionally has **no branch filter on `push`** (only a path filter), so any branch — including the new per-agent `auto/*` worktree branches — that touches `dnd-app/**` triggers a full run, and without `cancel-in-progress` a rapid second push stacks another full run instead of superseding the first. This is pure CI-minute / queue waste and is inconsistent with the 6 workflows that already guard against it.

**Hypothesis / root cause:** `concurrency` was added to the deploy/release/long-running workflows where overlap is obviously harmful, but the everyday push-gated lint/test workflows were never retrofitted; the cost grew after the move to many per-agent `auto/*` branches.

**Proposed fix / improvement:**
- [ ] Add a `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` block to `dnd-app-ci.yml`, `dnd-app-validate-5e.yml`, and `security-audit.yml`, matching the convention the other 6 already use.
- [ ] Consider whether `dnd-app-ci.yml`'s unfiltered-branch `push` trigger should also be scoped (the integrator merges via `master`; per-branch full runs may be redundant with the PR-event run).

**Related files:** `.github/workflows/dnd-app-ci.yml`, `.github/workflows/dnd-app-validate-5e.yml`, `.github/workflows/security-audit.yml`

### [2026-06-22] Root `.editorconfig` is a near-empty `*.sh`-only stub — misses an editor-agnostic baseline for all four code areas

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI / dependency-hygiene scan.

**Description:**
The repo-root `.editorconfig` declares `root = true` but contains only a single `[*.sh]` block (`charset = utf-8`, `insert_final_newline = true`) — it was added narrowly to stop a shell-script BOM regression (see `BMO-RESOLVED-ISSUES.md`). EditorConfig is the one editor-agnostic, no-dependency way to enforce baseline whitespace/charset/final-newline rules consistently across the whole monorepo — TS/React (`dnd-app`, `oracle-worker`), React (`dungeon-scholar`, which ships **no** linter or `.editorconfig` of its own — see `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`), Python (`bmo/pi`), plus JSON/Markdown/YAML across all of them. Today only shell files get any shared editor baseline; everything else relies on each project's own (and in dungeon-scholar's case absent) tooling, so indentation/charset/trailing-whitespace drift across projects has nothing catching it before commit.

**Hypothesis / root cause:** the file was created for one narrow shell-BOM fix and never broadened into the cross-project baseline EditorConfig is designed to be.

**Proposed fix / improvement:**
- [ ] Expand root `.editorconfig` with a `[*]` default (`charset = utf-8`, `insert_final_newline = true`, `trim_trailing_whitespace = true`, `end_of_line = lf`) and per-type indent rules (`[*.{ts,tsx,js,jsx,json,yml,yaml}]` 2-space, `[*.py]` 4-space, `[*.md] trim_trailing_whitespace = false`).
- [ ] Keep it advisory/non-blocking — it complements, not replaces, each project's linter; it just gives a shared floor (especially useful for dungeon-scholar, which has none).

**Related files:** `.editorconfig`, `dnd-app/biome.json`, `dungeon-scholar/` (no linter), `bmo/pi/`, `oracle-worker/`

### [2026-06-22] No repo-root task runner and inconsistent npm-script vocabulary across the three JS projects

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** Cross-cutting CI/tooling review.

**Description:**
There is no single entry point to lint/typecheck/test/build the monorepo: no root `Makefile`, `justfile`, `Taskfile`, or root `package.json` (the root `node_modules/` is just a stray Vite cache — see the existing entry). Each area is driven by its own per-project commands, and the npm-script names are inconsistent: `dnd-app` exposes a rich, well-named set (`lint`, `lint:fix`, `format`, `test`, `test:coverage`, `circular`, `check:full`, ...); `dungeon-scholar` exposes only `dev`/`build`/`preview`/`test`/`test:watch` (no `lint`, `format`, or `typecheck`); `oracle-worker` exposes only `test`; bmo runs via `pytest` (`bmo/pi/pytest.ini`). So a contributor (or the integrator, when it wants a quick "is everything green" pass) has to remember a different command surface per project, and there is no one command that runs the whole repo's checks. A tiny root `Makefile`/`justfile` that fans out to each project's existing commands — plus a shared minimum script vocabulary (`lint`, `typecheck`, `test`, `build`) implemented in each JS `package.json` — would give uniform muscle memory and a single CI-mirroring local command, **without** needing a real npm workspace (which the root-`node_modules` entry deliberately avoids).

**Proposed fix / improvement:**
- [ ] Add a root `Makefile` or `justfile` with targets like `test`, `lint`, `build` that delegate to `dnd-app` / `dungeon-scholar` / `oracle-worker` (npm) and `bmo/pi` (pytest).
- [ ] Standardize a common script vocabulary (`lint`, `typecheck`, `test`, `build`) across the three JS `package.json` files so the root targets are uniform (depends on dungeon-scholar gaining a linter — see related entry).
- [ ] Document the root commands in `README.md` / `docs/CONTRIBUTING.md` as the canonical "run everything" entry point.

**Related entries:** root `node_modules/` (no root workspace) entry above; dungeon-scholar missing-linter entry in `docs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`.

**Related files:** `README.md`, `docs/CONTRIBUTING.md`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`, `bmo/pi/pytest.ini`
