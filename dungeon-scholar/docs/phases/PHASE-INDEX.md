# PHASE-INDEX — dungeon-scholar

> Meta-file (never moves to `completed/`, never deleted — see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) Notes).
> The dependency manifest + execution order for the `PHASE-NN-<slug>.md` plans in
> **this** folder (`dungeon-scholar/docs/phases/`). Each plan is fully
> self-contained (carries its own context, file list, sub-phases, acceptance).
>
> **Execution:** per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) — phases run in numeric
> order; cheap targeted checks during sub-phase work, CI (`dungeon-scholar-ci.yml`)
> is the authoritative gate on push; ONE commit + ONE push per phase end on
> `auto/ds-phase-executer`; finished plans move to `completed/`. **No manual
> release** — the daily integrator's merge to `master` auto-deploys the live
> GitHub-Pages site via `dungeon-scholar-deploy.yml` (INSTRUCTIONS.md rule 6).
>
> **Provenance:** dungeon-scholar's earlier phase plans (PHASE-17/18/19 bug/security/a11y
> rounds; PHASE-39 architecture; PHASE-40 PWA/cloud; PHASE-41 sealed-tomes/theme) were
> authored and executed under the **repo-wide** `dnd-app/docs/phases/` set and live in
> `dnd-app/docs/phases/completed/`. This per-domain index is the home for **new**
> dungeon-scholar phase plans authored from the dungeon-scholar QA reports
> (`QA/QA-report-*.md`) by the dungeon-scholar phase-maker, going forward. The
> numbering below is **local to this folder** (it restarts at PHASE-01) — it is not a
> continuation of the dnd-app phase numbers.

| # | Plan file | Domain | Depends on | Status |
|---|---|---|---|---|
| 01 | [`PHASE-01-routing-pwa-update-resilience.md`](./PHASE-01-routing-pwa-update-resilience.md) | dungeon-scholar | — | done |
| 02 | [`PHASE-02-load-noise-ux-docs-round.md`](./PHASE-02-load-noise-ux-docs-round.md) | dungeon-scholar | — | done |

> **Source:** both plans were consolidated from `QA/QA-report-2026-06-24.md` (now in
> `QA/completed/`) by the dungeon-scholar phase-maker. PHASE-01 carries the report's
> only High (a lazy-route navigation crashing into the error boundary after a deploy —
> the dungeon-scholar analogue of dnd-app PHASE-44C); PHASE-02 bundles the five
> low-severity findings (Supabase token-refresh console noise, the 404-ing README
> URL, the delve viewport overflow, the unit-less quest gold reward, and the
> "streak broken" devotion copy). Neither depends on the other; run PHASE-01 first
> by severity. Add a row per future plan (numeric order), list prerequisites in
> **Depends on**, and update **Status** (`pending` → `in progress` → `done`) as the
> ds-phase-executer ships each one.
