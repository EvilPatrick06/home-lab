# PHASE-INDEX — bmo

> Meta-file (never moves to `completed/`, never deleted — see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) Notes).
> The dependency manifest + execution order for the `PHASE-NN-<slug>.md` plans in
> **this** folder (`bmo/docs/phases/`). Each plan is fully self-contained.
>
> **Execution:** per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) — phases run in numeric
> order; cheap targeted checks during sub-phase work, CI (`bmo-pi-pytest.yml` +
> the no-new-prints / docker / codeql guards) is the authoritative gate on push;
> ONE commit + ONE push per phase end on `auto/bmo-phase-executer`; finished plans
> move to `completed/`. **No version-tag release** — the executer never deploys;
> the integrator's merge to `master` is shipped by the owner / `bmo-deploy.yml`
> running `bmo/pi/scripts/deploy.sh` on the Pi (INSTRUCTIONS.md rule 6).
>
> **Scope:** bmo's own surface (the Pi Flask app, dashboard, services, bots'
> infrastructure, deploy mechanics). The AI DM **engine** is `dnd-app`, not bmo.
>
> **Provenance:** bmo's earlier phase plans (PHASE-15 hygiene, PHASE-16 blueprint
> refactor, PHASE-42 deploy automation) were authored and executed under the
> **repo-wide** `dnd-app/docs/phases/` set and live in `dnd-app/docs/phases/completed/`.
> This per-domain index is the home for **new** bmo phase plans authored from the
> bmo QA reports (`QA/QA-report-*.md`) by the bmo phase-maker, going forward.

| # | Plan file | Domain | Depends on | Status |
|---|---|---|---|---|
| _(none yet)_ | — | bmo | — | — |

> **No active plans yet.** New plans land here when the bmo phase-maker consolidates
> a QA report into `PHASE-NN-<slug>.md` files. Add a row per plan (numeric order),
> list prerequisites in **Depends on**, and update **Status** (`pending` →
> `in progress` → `done`) as the bmo-phase-executer ships each one.
