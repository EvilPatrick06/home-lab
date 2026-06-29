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

### [2026-06-28] New `dnd-e2e.yml` workflow violates two established repo-wide CI conventions (literal Node pin + unpinned/mutable action tags)

- **Category:** config
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** Automated cross-cutting scan of `.github/workflows/` for action-pinning and Node-version-pinning consistency across the monorepo.

**Description:**
`.github/workflows/dnd-e2e.yml` (added 2026-06-28 in `71859ade`, the Playwright e2e smoke harness) was authored without the two CI conventions the rest of the repo standardized days earlier, making it the lone holdout on both:

1. **Mutable, unpinned action tags.** It uses `actions/checkout@v4` and `actions/setup-node@v4`. Every other workflow in `.github/workflows/` pins third-party/first-party actions to a full commit SHA with a trailing `# vN` comment (e.g. `actions/checkout@9c091bb… # v7`, `actions/setup-node@48b55a… # v6`, `tailscale/github-action@306e68a… # v4`). dnd-e2e is the only workflow using a floating major-version tag, so it (a) is the single supply-chain-hardening gap — a mutable tag can be repointed upstream, which SHA-pinning exists to prevent — and (b) is not managed consistently by the `github-actions` Dependabot ecosystem the way the SHA-pinned `# vN` comments are.
2. **Literal Node pin instead of `.nvmrc`.** It hardcodes `node-version: 22` rather than `node-version-file: .nvmrc`. This re-introduces exactly the drift the 2026-06-22 `.nvmrc` consolidation and the 2026-06-24 follow-up ("Monorepo Node pin incomplete — 4 CI jobs still hardcode node-version") eliminated repo-wide. It is now the ONLY `node-version:` literal in the repo (every other setup-node step reads `.nvmrc`). Harmless while `.nvmrc` is `22`, but a future bump silently strands the e2e job on Node 22. It also falsifies the standing claim in `docs/logs/SUGGESTIONS-LOG.md` (2026-06-24 Python-pin entry) that "**every** Node workflow reads it via `node-version-file: .nvmrc`."

**Hypothesis / root cause:** New workflow authored from memory/an old template rather than by copying a current sibling workflow. The 2026-06-24 node-pin resolution explicitly **deferred** the optional CI grep-guard that would forbid re-introducing a literal `node-version:` pin ("left as a future enhancement"), and there is no guard forbidding mutable action tags either — so nothing caught the regression at commit time. (dnd-e2e is non-blocking / PR+dispatch-only, which is why no required gate flagged it.)

**Proposed fix / improvement:**
- [ ] In `dnd-e2e.yml`, replace `actions/checkout@v4` / `actions/setup-node@v4` with the same SHA-pinned `# vN` references the sibling workflows use.
- [ ] Replace `node-version: 22` with `node-version-file: .nvmrc` (and add `cache: npm` / `cache-dependency-path: dnd-app/package-lock.json` to match siblings).
- [ ] Land the deferred CI grep-guard(s) so re-introducing a literal `node-version:` pin or a mutable (non-SHA) action tag fails CI, preventing the next instance of this drift.

**Related files:** `.github/workflows/dnd-e2e.yml`, `.nvmrc`, `.github/dependabot.yml` (github-actions ecosystem)

**Related entries:** RESOLVED-ISSUES.md [2026-06-24] "Monorepo Node pin incomplete — 4 CI jobs still hardcode node-version"; SUGGESTIONS-LOG.md [2026-06-24] "No `.python-version` analog to `.nvmrc`" (asserts every Node workflow reads `.nvmrc`).

