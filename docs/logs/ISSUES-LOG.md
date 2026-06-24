# Issues log (split by domain)

This file is a **compatibility pointer**. Active bugs and tech debt are logged in three places by domain:

- **BMO** (Pi, Discord bots, voice, agents): [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
- **dnd-app** (Electron VTT, 5e data): [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
- **dungeon-scholar** (Vite/React study app, Supabase): [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)

`Domain: both` items are **mirrored in both** logs — fix once, remove from both.

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

# Cross-cutting issues (logged here by overall-errors scanner)

> Repo-wide / multi-project findings. Per the domain-split triage in `LOG-INSTRUCTIONS.md` these are `Domain: both`; recorded here in the compatibility-pointer log.


### [2026-06-24] Monorepo Node pin incomplete — 4 CI jobs still hardcode `node-version: "22"` instead of `.nvmrc`

- **Category:** config
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting scan of repo-root configs + GitHub Actions workflows

**Description:**
The "pin one Node version for the whole monorepo" work (RESOLVED-ISSUES-DNDAPP.md / RESOLVED-ISSUES-DUNGEON-SCHOLAR.md, [2026-06-22]) claims it "switched all 8 `node-version: 22` pins across 6 workflows … to `node-version-file: .nvmrc`" so "the toolchain version now lives in one place." It did not finish: **4 hardcoded `node-version: "22"` pins still remain**, none of which read the root `.nvmrc`:
- `.github/workflows/oracle-worker-ci.yml:34`
- `.github/workflows/oracle-worker-deploy.yml:28`
- `.github/workflows/security-audit.yml:75` (`oracle-worker-npm-audit` job)
- `.github/workflows/security-audit.yml:91` (`dungeon-scholar-npm-audit` job)

Note the two same-file inconsistencies in `security-audit.yml`: its `dnd-npm-audit` job uses `node-version-file: .nvmrc` (line 39) while the `oracle-worker-npm-audit` and `dungeon-scholar-npm-audit` jobs hardcode `"22"`. And `dungeon-scholar`'s own version pin is split across workflows — `dungeon-scholar-ci.yml` uses `.nvmrc`, but its security-audit twin hardcodes `"22"`.

No live break today (`.nvmrc` currently contains `22`, so all pins agree). The issue is that the single-source-of-truth invariant the resolved work claims is **not** actually in force: a future `.nvmrc` bump (e.g. to 24) will silently leave these 4 jobs on Node 22, so the oracle-worker CI/deploy and the dungeon-scholar/oracle-worker audit jobs would build/test on a different Node than the rest of the repo — exactly the per-workflow drift the `.nvmrc` consolidation was meant to eliminate. `engines.node` is `>=22` in all three package.json files, but `>=` is a floor, not a pin, so it does not catch this skew.

**Hypothesis / root cause:** The [2026-06-22] consolidation enumerated only `dnd-app-ci`, `dnd-web-deploy`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, and `deploy`. It (a) converted only the `dnd-npm-audit` job inside `security-audit.yml` and missed the other two jobs in the same file, and (b) never included `oracle-worker-ci.yml` / `oracle-worker-deploy.yml` in its list at all — so those two workflows were never migrated. The resolved entry's "all 8 pins / one place" claim is therefore inaccurate.

**Proposed fix / improvement:**
- [ ] Replace `node-version: "22"` with `node-version-file: .nvmrc` in `oracle-worker-ci.yml`, `oracle-worker-deploy.yml`, and both remaining jobs in `security-audit.yml` (lines 75 + 91).
- [ ] Optional: a tiny CI guard (or extend `scripts/check-agent-instructions.sh`-style lint) that greps `.github/workflows/` for literal `node-version:` and fails if any pin is not `node-version-file`, so this can't silently regress again.
- [ ] Consider tightening `engines.node` from `>=22` to an exact/`~22` pin if a single toolchain version is truly desired.

**Related files:** `.github/workflows/oracle-worker-ci.yml`, `.github/workflows/oracle-worker-deploy.yml`, `.github/workflows/security-audit.yml`, `.nvmrc`

**Related entries:** RESOLVED-ISSUES-DNDAPP.md / RESOLVED-ISSUES-DUNGEON-SCHOLAR.md [2026-06-22] "Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`"
