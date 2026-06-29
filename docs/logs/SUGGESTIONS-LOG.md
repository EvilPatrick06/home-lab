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

