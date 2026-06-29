# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

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

