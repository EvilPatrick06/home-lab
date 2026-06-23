# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

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
