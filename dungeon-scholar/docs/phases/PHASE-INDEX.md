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
| 01 | [`completed/PHASE-01-routing-pwa-update-resilience.md`](./completed/PHASE-01-routing-pwa-update-resilience.md) | dungeon-scholar | — | done |
| 02 | [`completed/PHASE-02-load-noise-ux-docs-round.md`](./completed/PHASE-02-load-noise-ux-docs-round.md) | dungeon-scholar | — | done |
| 03 | [`completed/PHASE-03-light-theme-dark-on-dark-contrast.md`](./completed/PHASE-03-light-theme-dark-on-dark-contrast.md) | dungeon-scholar | — | done |
| 04 | [`completed/PHASE-04-import-deck-ingestion-robustness.md`](./completed/PHASE-04-import-deck-ingestion-robustness.md) | dungeon-scholar | — | done |
| 05 | [`completed/PHASE-05-interaction-recovery-dialogs-oracle-copy.md`](./completed/PHASE-05-interaction-recovery-dialogs-oracle-copy.md) | dungeon-scholar | — | done |
| 06 | [`completed/PHASE-06-vault-redeemed-unlock-gate.md`](./completed/PHASE-06-vault-redeemed-unlock-gate.md) | dungeon-scholar | — | done |
| 07 | [`completed/PHASE-07-import-toast-exam-copy.md`](./completed/PHASE-07-import-toast-exam-copy.md) | dungeon-scholar | — | done |
| 08 | [`completed/PHASE-08-routing-hero-exam-jank-oracle-sources-auth-circuit-breaker.md`](./completed/PHASE-08-routing-hero-exam-jank-oracle-sources-auth-circuit-breaker.md) | dungeon-scholar | — | done |
| 09 | [`completed/PHASE-09-user-facing-date-format-consistency.md`](./completed/PHASE-09-user-facing-date-format-consistency.md) | dungeon-scholar | — | done |
| 10 | [`completed/PHASE-10-light-theme-accent-text-danger-button-contrast.md`](./completed/PHASE-10-light-theme-accent-text-danger-button-contrast.md) | dungeon-scholar | — | done |
| 11 | [`completed/PHASE-11-routing-headings-vault-exam-quest-copy-round.md`](./completed/PHASE-11-routing-headings-vault-exam-quest-copy-round.md) | dungeon-scholar | — | done — F1/F2/F3/F5 + F4/11D (11D landed 2026-07-03, owner-approved) |
| 12 | [`PHASE-12-light-theme-active-tome-panel-accent-contrast.md`](./completed/PHASE-12-light-theme-active-tome-panel-accent-contrast.md) | dungeon-scholar | — | done |
| 13 | [`PHASE-13-deeplink-reset-race-auth-refresh-reachability-probe.md`](./completed/PHASE-13-deeplink-reset-race-auth-refresh-reachability-probe.md) | dungeon-scholar | — | done |
| 14 | [`PHASE-14-sealed-export-strip-occlusion-fallback-qa-docs-round.md`](./PHASE-14-sealed-export-strip-occlusion-fallback-qa-docs-round.md) | dungeon-scholar | — | pending |


> **Provenance narrative moved.** The per-run `Source (NN)` provenance blockquotes
> (which QA report each phase came from, what was folded vs. re-authored) now live in
> [`PHASE-PROVENANCE.md`](./PHASE-PROVENANCE.md), keeping this file the lean
> dependency-manifest table. When the phase-maker authors a plan from a QA report it
> **first checks the table above for an existing plan consolidated from the same
> report** (to avoid duplicate-number races), adds the row here, and appends the
> `Source (NN)` narrative to `PHASE-PROVENANCE.md`.

> Add a row per future plan (numeric order), list prerequisites in **Depends on**, and
> update **Status** (`pending` → `in progress` → `done`) as the ds-phase-executer ships each one.

