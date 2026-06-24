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
| 01 | [`PHASE-01-backend-route-correctness.md`](./PHASE-01-backend-route-correctness.md) | bmo | — | pending |
| 02 | [`PHASE-02-realtime-reliability.md`](./PHASE-02-realtime-reliability.md) | bmo | 01 (soft) | pending |
| 03 | [`PHASE-03-dashboard-ux-round.md`](./PHASE-03-dashboard-ux-round.md) | bmo | 01, 02 (soft) | pending |

> **Provenance of this batch:** PHASE-01..03 were consolidated from
> `QA/QA-report-2026-06-24.md` (now in `QA/completed/`) by the bmo phase-maker on
> 2026-06-24. They split the report's findings by layer: **01** = server-side
> route/service correctness (the 404/500s: list, music, calendar, monitoring,
> seeded chat data); **02** = realtime reliability over Cloudflare (chat send
> watchdog, IDE terminal, socket.io WS upgrade); **03** = dashboard UX & frontend
> resilience (clock TZ, Places warning, notes Enter, timer/alarm UX, poll backoff).
> Dependencies are **soft** — the layers touch disjoint files and can land in any
> order, but 01→02→03 is the recommended order (fix structure before polish). The
> bmo-phase-executer updates the Status column (`pending` → `in progress` → `done`)
> as it ships each plan.
