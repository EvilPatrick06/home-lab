# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-28] LOG-INSTRUCTIONS.md triage table never names the cross-cutting pointer logs as the home for `Domain: both` items — three docs disagree

- **Category:** docs
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Automated cross-cutting scan of `docs/` organization and repo-wide logging conventions.

**Description:**
Three places describe where a repo-wide `Domain: both` entry should be logged, and they disagree:

1. `docs/LOG-INSTRUCTIONS.md` (the canonical "how to log" doc) — its triage table and Quick-reference say `Domain: both` items are **"mirror[ed] in each relevant log"** (i.e. duplicated across the per-domain `BMO-*` / `*-DNDAPP` / `*-DUNGEON-SCHOLAR` logs). It **never mentions** `ISSUES-LOG.md` or `SUGGESTIONS-LOG.md` as a destination at all.
2. `docs/logs/ISSUES-LOG.md` header — also says *"`Domain: both` items are **mirrored in both** logs — fix once, remove from both."*
3. `docs/README.md` index and the actual files — describe `ISSUES-LOG.md` / `SUGGESTIONS-LOG.md` as the **"cross-cutting pointer"** logs, and both files carry a dedicated `# Cross-cutting issues` / `## Cross-cutting / repo-wide suggestions` section. In practice the cross-cutting scanners write there directly: the `overall-errors` scanner's repo-wide finding sits inline in `ISSUES-LOG.md`, and the `overall-cleanup` scanner (this one) is instructed to append repo-wide suggestions to `SUGGESTIONS-LOG.md`.

So the de-facto convention is "repo-wide `Domain: both` -> the pointer log," but the document that's supposed to teach logging (`LOG-INSTRUCTIONS.md`) tells a reader to mirror into the three domain logs instead, and never surfaces the pointer logs. A future agent following `LOG-INSTRUCTIONS.md` literally will either triplicate a repo-wide item across domain logs or fail to discover the pointer logs entirely.

**Hypothesis / root cause:** The cross-cutting pointer-log pattern (`ISSUES-LOG.md` / `SUGGESTIONS-LOG.md` with explicit cross-cutting sections, fed by the `overall-*` scanners) was introduced after `LOG-INSTRUCTIONS.md`'s domain-split triage table was written, and the triage table / Quick-reference were never updated to add the "repo-wide `Domain: both` -> pointer log" row. The `merge=union` `.gitattributes` globs already cover `ISSUES-LOG*` and `SUGGESTIONS-LOG*`, so the mechanism is wired — only the documentation lags.

**Proposed fix / improvement:**
- [ ] Add a `Domain: both` (repo-wide / cross-cutting) row to the `LOG-INSTRUCTIONS.md` triage table and Quick-reference pointing at `docs/logs/ISSUES-LOG.md` (bugs/debt) and `docs/logs/SUGGESTIONS-LOG.md` (future ideas), describing them as the single home for whole-repo structural/convention items.
- [ ] Reconcile the wording: decide whether genuinely multi-domain (but per-project) items mirror into the domain logs while *repo-wide structural* items go in the pointer logs, and state that distinction once, consistently, in all three places (`LOG-INSTRUCTIONS.md`, `ISSUES-LOG.md` header, `SUGGESTIONS-LOG.md` header).

**Related files:** `docs/LOG-INSTRUCTIONS.md`, `docs/logs/ISSUES-LOG.md`, `docs/logs/SUGGESTIONS-LOG.md`, `docs/README.md`

### [2026-06-28] `docs/superpowers/` orphan recurred — a new implemented design spec re-populated the just-archived dir and is again absent from the docs index

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Automated cross-cutting scan of `docs/` organization (orphaned / unindexed files).

**Description:**
On 2026-06-22 a cleanup moved the six stale `docs/superpowers/{plans,specs}` design docs into `_archive/2026-06-22-completed-docs/superpowers/` (see RESOLVED-ISSUES.md "[2026-06-22] `docs/superpowers/` is an undocumented, opaquely-named plans/specs dir orphaned from the docs index"). One day later (2026-06-23) the **same** directory was re-created with a single new file, `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md`. It reproduces the exact condition the prior cleanup resolved:
- It is referenced by **no** markdown file in the repo (grep for "superpowers" outside `_archive/` and `docs/logs/` returns nothing).
- It is **absent from the `docs/README.md` index** (added 2026-06-23, the same day).
- The dir name "superpowers" names the authoring agent skill, not the content — undiscoverable by a new reader.
- Its own header marks it **"Status: IMPLEMENTED — code complete + verified … pending deploy + cross-device E2E,"** i.e. a completed design doc — exactly the class the `_archive/` convention exists for, the same as its six now-archived siblings.

**Hypothesis / root cause:** The `superpowers` agent skill writes design specs to `docs/superpowers/specs/` by default; the 2026-06-22 archival cleaned out the contents but did not remove/redirect the directory or add a guard, so the next spec landed back in the same orphaned location a day later. This is a recurrence of a just-resolved cleanup, so a one-time move alone won't prevent the next instance.

**Proposed fix / improvement:**
- [ ] Move `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md` into a dated `_archive/.../superpowers/specs/` batch per the `_archive/` convention (it is marked IMPLEMENTED), with a provenance note — OR, if still treated as live design, add it to the `docs/README.md` index and give the dir a self-describing home (e.g. `docs/design-specs/`).
- [ ] Prevent recurrence: either point the `superpowers` skill's spec output at a documented, indexed location, or add a tiny CI/docs check that flags any file under `docs/superpowers/` not referenced by `docs/README.md`.

**Related files:** `docs/superpowers/specs/2026-06-23-user-accounts-cloud-sync-design.md`, `docs/README.md`, `_archive/2026-06-22-completed-docs/superpowers/`, `_archive/README.md`

**Related entries:** RESOLVED-ISSUES.md "[2026-06-22] `docs/superpowers/` is an undocumented, opaquely-named plans/specs dir orphaned from the docs index"

### [2026-06-28] `docs/README.md` index omits `BMO-DEPLOY.md` (and the whole `docs/superpowers/` subtree)

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** Automated cross-cutting scan comparing `docs/*.md` on disk against the `docs/README.md` index.

**Description:**
The `docs/README.md` index (added 2026-06-23 to make the flat `docs/` dir navigable) is already incomplete. Diffing the files present against the index shows `docs/BMO-DEPLOY.md` is **not listed** anywhere in the index, even though it is a tracked, current doc that other docs link to (e.g. `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` references it for the decoupled-deploy checkout). The `docs/superpowers/` subtree is likewise absent (see the companion orphan entry above). The index's value is being the one place to find a doc; an unlisted doc is effectively invisible, and the gap will widen each time a new doc lands without an index row.

**Hypothesis / root cause:** `BMO-DEPLOY.md` existed before the index was authored but was missed when the index was assembled (the "Setup & operations" group lists BACKUP/SETUP/COMMANDS/OLLAMA-TUNING/SECURITY but not the deploy doc). No check enforces index<->file parity, so omissions are silent.

**Proposed fix / improvement:**
- [ ] Add a row for `BMO-DEPLOY.md` to the `docs/README.md` index (likely under "Setup & operations" with a one-line description).
- [ ] Index or relocate the `docs/superpowers/` content (tracked separately above).
- [ ] Optional: add a lightweight CI/docs check that fails when a `docs/*.md` file (excluding `README.md` itself) is not referenced by `docs/README.md`, so the index stays complete automatically.

**Related files:** `docs/README.md`, `docs/BMO-DEPLOY.md`, `docs/superpowers/`
### [2026-06-28] CI workflows duplicate the `setup-node` + `npm ci` block ~10× — extract a composite action

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI review
- **Effort estimate:** 1–2 hours

**Description:**
The identical four-line Node bootstrap — `actions/setup-node@48b55a…# v6` with `node-version-file: .nvmrc` + `cache: npm`, followed by `npm ci` — is copy-pasted across ~10 workflow jobs (`dnd-app-ci`, `dungeon-scholar-ci`, `dungeon-scholar-deploy`, `dnd-web-deploy`, `oracle-worker-ci`, `oracle-worker-deploy`, `dnd-app-validate-5e`, three jobs in `security-audit.yml`, three in `release.yml`). Today every routine change to that bootstrap (e.g. the resolved 2026-06-24 node-pin sweep, or a future `setup-node` SHA bump) has to touch every file, and a single missed copy is exactly how `dnd-e2e.yml` drifted (see `ISSUES-LOG.md` 2026-06-28 dnd-e2e entry). There is no `.github/actions/` dir yet.

**Hypothesis / root cause:** Workflows were authored independently before a shared-step convention existed; no composite/reusable action has ever been introduced.

**Proposed fix / improvement:**
- [ ] Add `.github/actions/setup-node-project/action.yml` (composite) wrapping `actions/checkout` (optional) + SHA-pinned `setup-node` (`.nvmrc` + `cache: npm`) + `npm ci`, taking `working-directory` as an input.
- [ ] Migrate the JS-project workflows to `uses: ./.github/actions/setup-node-project`.
- [ ] Keep the SHA pin + `# vN` comment inside the composite so the `github-actions` Dependabot ecosystem still bumps it in one place.

**Related files:** `.github/workflows/*.yml`, `.nvmrc`, `.github/dependabot.yml`

**Related entries:** This was previously listed only as an unchecked optional follow-up inside resolved CI entries (`RESOLVED-ISSUES-DNDAPP.md`, `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`, `BMO-RESOLVED-ISSUES.md`: "Optionally factor the shared setup-node / npm-ci steps into a composite action") and was never tracked as an open item. Also relates to `ISSUES-LOG.md` 2026-06-28 dnd-e2e convention-drift entry (a composite action would have prevented that drift).

### [2026-06-28] TypeScript type-checking coverage is uneven across the three TS projects — only dnd-app has a `tsc` gate

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI/tooling review

**Description:**
Three of the repo's code areas are TypeScript, but only `dnd-app` is ever type-checked. `dnd-app` runs `tsc --noEmit` (Makefile `typecheck` + `dnd-app-ci`). `dungeon-scholar` has **no `tsconfig*.json` and no typecheck/`check` script at all** — Vite/esbuild transpiles by stripping types without checking them, so a type error there only ever surfaces at runtime. `oracle-worker` has only `check: wrangler deploy --dry-run` (an esbuild bundle, not a full project type-check). So two production TS surfaces ship with zero compiler-enforced type safety, while a third is fully gated — an inconsistency that mirrors the (now-resolved) lint/audit-coverage gaps overall-suggestor previously closed for these same two projects. The Makefile documents the omission ("dungeon-scholar has no tsconfig/tsc step … Revisit if either gains a tsconfig") but it is not tracked as an improvement.

**Hypothesis / root cause:** Both projects were bootstrapped from Vite/Wrangler templates that rely on the bundler for transpile and never added a standalone `tsc` config; the bundler-transpiles-so-no-typecheck assumption was accepted as permanent rather than as debt.

**Proposed fix / improvement:**
- [ ] Add a `tsconfig.json` (strict) + `"typecheck": "tsc --noEmit"` script to `dungeon-scholar`, and a `"typecheck": "tsc --noEmit"` (or `wrangler types` + tsc) to `oracle-worker`.
- [ ] Extend Makefile `typecheck` to fan out to all three TS projects (today it covers dnd-app only, by design-note).
- [ ] Wire the new typecheck step into `dungeon-scholar-ci` / `oracle-worker-ci`.
- [ ] Optionally add a shared `tsconfig.base.json` at repo root (parallel to the existing `biome.base.json`) so the three projects share compiler-strictness defaults.

**Related files:** `dungeon-scholar/package.json`, `oracle-worker/package.json`, `Makefile`, `.github/workflows/dungeon-scholar-ci.yml`, `.github/workflows/oracle-worker-ci.yml`, `biome.base.json`

### [2026-06-28] `dnd-app/mobile` is excluded from both the root Makefile fan-out and all CI despite having `lint` + `typecheck` scripts

- **Category:** future-idea, portability
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI/tooling review

**Description:**
The React Native / Expo subproject `dnd-app/mobile` has its own lockfile (Dependabot was given a dedicated `/dnd-app/mobile` npm entry after its Expo/EAS toolchain accumulated unremediated security alerts) and defines `"lint": "biome check src/"` and `"typecheck": "tsc --noEmit"`. But **no workflow under `.github/workflows/` references `mobile`** (`grep mobile` → nothing), and the **root `Makefile` never touches it** — `install`/`lint`/`test`/`build` fan out to `dnd-app`, `dungeon-scholar`, `oracle-worker`, and `bmo/pi`, but not `dnd-app/mobile`. So it is the only code area in the repo with declared lint+typecheck scripts that no `make` target and no CI gate ever runs — its quality bar is enforced by nobody, even though its dependencies are kept fresh by Dependabot. This breaks the repo-wide "every subproject is covered by `make` + CI" invariant the resolved oracle-worker CI-wiring and Makefile-fan-out entries established.

**Hypothesis / root cause:** Mobile was added as a nested package under `dnd-app/` after the Makefile fan-out and the per-project CI workflows were written; Dependabot coverage was retrofitted (the dependabot.yml comment confirms this) but the build/CI fan-out was not.

**Proposed fix / improvement:**
- [ ] Add `dnd-app/mobile` to the root Makefile `install` (`npm ci`), `lint`, and `typecheck` targets.
- [ ] Add a `mobile` CI job (or extend `dnd-app-ci`, path-filtered to `dnd-app/mobile/**`) running `npm ci` + `biome check` + `tsc --noEmit`, using the same SHA-pinned `setup-node` + `.nvmrc` convention as its siblings (or the composite action proposed in the 2026-06-28 composite-action entry above).
- [ ] Decide whether mobile gets a `security-audit` job like the other npm projects.

**Related files:** `dnd-app/mobile/package.json`, `Makefile`, `.github/workflows/dnd-app-ci.yml`, `.github/dependabot.yml`

**Related entries:** Same coverage-parity theme as the resolved cross-cutting entries "oracle-worker is a production component with ZERO CI wiring", "security-audit never runs for dungeon-scholar or oracle-worker", and "Root Makefile lint/typecheck only cover dnd-app".

