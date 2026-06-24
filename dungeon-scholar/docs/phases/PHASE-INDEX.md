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
> GitHub-Pages site via `deploy.yml` (INSTRUCTIONS.md rule 6).
>
> **Provenance:** dungeon-scholar's earlier phase plans (PHASE-17/18/19 bug/security/a11y
> rounds; PHASE-39 architecture; PHASE-40 PWA/cloud; PHASE-41 sealed-tomes/theme) were
> authored and executed under the **repo-wide** `dnd-app/docs/phases/` set and live in
> `dnd-app/docs/phases/completed/`. This per-domain index is the home for **new**
> dungeon-scholar phase plans authored from the dungeon-scholar QA reports
> (`QA/QA-report-*.md`) by the dungeon-scholar phase-maker, going forward.

| # | Plan file | Domain | Depends on | Status |
|---|---|---|---|---|
| _(none yet)_ | — | dungeon-scholar | — | — |

> **No active plans yet.** New plans land here when the dungeon-scholar phase-maker
> consolidates a QA report into `PHASE-NN-<slug>.md` files. Add a row per plan
> (numeric order), list prerequisites in **Depends on**, and update **Status**
> (`pending` → `in progress` → `done`) as the ds-phase-executer ships each one.
