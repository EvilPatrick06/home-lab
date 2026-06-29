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
> (`QA/QA-report-*.md`) by the dungeon-scholar phase-maker, going forward. The
> numbering below is **local to this folder** (it restarts at PHASE-01) — it is not a
> continuation of the dnd-app phase numbers.

| # | Plan file | Domain | Depends on | Status |
|---|---|---|---|---|
| 01 | [`PHASE-01-routing-pwa-update-resilience.md`](./PHASE-01-routing-pwa-update-resilience.md) | dungeon-scholar | — | done |
| 02 | [`PHASE-02-load-noise-ux-docs-round.md`](./PHASE-02-load-noise-ux-docs-round.md) | dungeon-scholar | — | done |
| 03 | [`PHASE-03-light-theme-dark-on-dark-contrast.md`](./PHASE-03-light-theme-dark-on-dark-contrast.md) | dungeon-scholar | — | pending |
| 04 | [`PHASE-04-import-deck-ingestion-robustness.md`](./PHASE-04-import-deck-ingestion-robustness.md) | dungeon-scholar | — | pending |
| 05 | [`PHASE-05-interaction-recovery-dialogs-oracle-copy.md`](./PHASE-05-interaction-recovery-dialogs-oracle-copy.md) | dungeon-scholar | — | pending |

> **Source (01-02):** both plans were consolidated from `QA/QA-report-2026-06-24.md` (now in
> `QA/completed/`) by the dungeon-scholar phase-maker. PHASE-01 carries the report's
> only High (a lazy-route navigation crashing into the error boundary after a deploy —
> the dungeon-scholar analogue of dnd-app PHASE-44C); PHASE-02 bundles the five
> low-severity findings (Supabase token-refresh console noise, the 404-ing README
> URL, the delve viewport overflow, the unit-less quest gold reward, and the
> "streak broken" devotion copy). Neither depends on the other; run PHASE-01 first
> by severity.
>
> **Source (03-05):** consolidated from `QA/QA-report-2026-06-24-2.md` (run 2, the fuller
> pass) + `QA/QA-report-2026-06-24-3.md` (run 3, the content-creation supplement) — both
> now in `QA/completed/`. **PHASE-03** carries the reports' two Highs (the systemic
> light-theme dark-on-dark: flashcard card, Lab trial cards, Mistake-Vault prompt — same
> amber-ramp-inversion root cause — plus the misleading theme-picker copy). **PHASE-04**
> bundles the import-layer robustness gaps (quiz answer-key validation/normalization;
> the CSV/Quizlet delimiter detection that silently drops comma rows; the new
> CSV/Quizlet + Occlusion importers being unreachable once a tome is active).
> **PHASE-05** bundles the remaining interaction/quality items (the error boundary not
> resetting on navigation; the Library bulk Tag/Banish native dialogs; the Oracle full-KB
> payload that 413s on large tomes; the Shop "Phase 14/18" dev-copy leak). None of 03-05
> depend on each other; run by severity — **PHASE-03 first** (the two Highs). PHASE-05's
> F1 touches `ErrorBoundary.jsx` (also modified by PHASE-01 01B) and its new modal/notice
> surfaces should follow PHASE-03's contrast pattern, so PHASE-03 before PHASE-05 is the
> natural order.
>
> **Already covered — not re-authored:** runs 2 + 3 also **re-confirmed** findings already
> planned in the done phases — the stale-service-worker navigation crash (PHASE-01 F1, still
> observed on the current build for already-cached users) and the Supabase token-refresh
> loop + the README live-URL 404 (PHASE-02 F1/F2). These re-confirmations are a fix-forward
> matter for the executer/integrator, not new plans. The reports' incremental Supabase note
> ("don't initialize the auth client / clear the stale token when no sign-in UI is exposed")
> is a small hardening on top of PHASE-02's refresh-gating; fold it into a future
> load-noise round if it persists after PHASE-02 ships.
>
> Add a row per future plan (numeric order), list prerequisites in **Depends on**, and
> update **Status** (`pending` → `in progress` → `done`) as the ds-phase-executer ships each one.
