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
| 03 | [`PHASE-03-light-theme-dark-on-dark-contrast.md`](./PHASE-03-light-theme-dark-on-dark-contrast.md) | dungeon-scholar | — | pending |
| 04 | [`PHASE-04-import-deck-ingestion-robustness.md`](./PHASE-04-import-deck-ingestion-robustness.md) | dungeon-scholar | — | pending |
| 05 | [`PHASE-05-interaction-recovery-dialogs-oracle-copy.md`](./PHASE-05-interaction-recovery-dialogs-oracle-copy.md) | dungeon-scholar | — | pending |
| 06 | [`PHASE-06-vault-redeemed-unlock-gate.md`](./PHASE-06-vault-redeemed-unlock-gate.md) | dungeon-scholar | — | pending |
| 07 | [`PHASE-07-import-toast-exam-copy.md`](./PHASE-07-import-toast-exam-copy.md) | dungeon-scholar | — | pending |
| 08 | [`PHASE-08-routing-hero-exam-jank-oracle-sources-auth-circuit-breaker.md`](./PHASE-08-routing-hero-exam-jank-oracle-sources-auth-circuit-breaker.md) | dungeon-scholar | — | pending |

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
> **Source (06-07) + 2026-06-28 additions:** consolidated from `QA/QA-report-2026-06-28.md` (now in
> `QA/completed/`) by the dungeon-scholar phase-maker — tested @ deployed `index-Dy2bw_1f.js` / src `8a8891fb`,
> cross-checked `origin/master` `43e4be93`. **PHASE-06** carries the report's highest-severity *new* finding (a
> Medium): the Mistake-Vault "The Redeemed" title + the `vault_clear` achievement (+50 gold) unlocking just by
> *opening* an empty — or tomeless — vault (an effect that runs before the `!courseSet` early-return and treats a
> never-populated vault as "all foes banished"). **PHASE-07** bundles the report's two Lows: the inconsistent /
> (when a tome is active) contradictory post-import toasts across the CSV and paste import paths, and the
> Practice-Exam "too few riddles" gate telling non-AI (CSV / pasted / starter) decks to "regenerate with the
> updated prompt." Neither 06 nor 07 depends on the other or on 03-05; run by severity — **PHASE-06 first**.
>
> **Already covered — not re-authored (2026-06-28 run):** the report's two other Mediums + one Low were already
> planned or tracked. The Light-theme **flashcard question/answer dark-on-dark** is **PHASE-03 F1 / 03B**
> (re-confirmed on `index-Dy2bw_1f.js`). The Light-theme **Oracle/Chat answer light-on-light** was **folded into
> PHASE-03 as the new F5 / sub-phase 03G** rather than given its own plan — it is the same light-theme contrast
> family but a *distinct inverse root cause* (a theme-aware *lightening* `--surface-amber` bubble under a
> hardcoded *non-inverting* light inline `color: '#fef3c7'`), which PHASE-03's existing F2/03E dark-on-dark grep
> would not catch, so 03G fixes it by darkening the text rather than the (already-correct) background. The
> **Supabase token-refresh console-noise loop** is **PHASE-02 F1** (done) — re-confirmed on the current build, a
> fix-forward matter for the executer/integrator, not a new plan. The report's other "could not test" items are
> environment blockers (no file download/upload, no viewport resize, no offline toggle), not findings.

>
> **Source (08) + 2026-06-29 additions:** consolidated from the two 2026-06-29 reports - [`QA-report-2026-06-29.md`](./QA/completed/QA-report-2026-06-29.md) (full pass, deployed `index-C2MmghGQ.js` / src `d5377b3e`, `origin/master` `605e712f`) and [`QA-report-2026-06-29-2.md`](./QA/completed/QA-report-2026-06-29-2.md) (post-#39 regression pass, src `dc85f35f`) - by the dungeon-scholar phase-maker. **PHASE-08** bundles the round's five *new* Low findings, none AI/content-creation copy or light-theme contrast (those fold into 03/07 below): the `#/tome/<bad-id>/<screen>` deep link honouring the screen segment against the stale tome (report 2 section 1); the full player-stats hero rendering on every screen, not just home (report 1 section 1); the practice-exam answer-click main-thread stall (corrected root cause: a per-`setState` full-blob `JSON.stringify` + `BroadcastChannel` post, ~4x per answer - **not** the already-debounced localStorage write) (report 1 section 3); the Oracle attaching "SOURCES FROM THE TOME" to out-of-tome answers (report 1 section 3); and the Supabase refresh circuit-breaker + stale-token quarantine - the hardening this index anticipated "on top of PHASE-02" now that the storm has persisted across the 06-28 and both 06-29 passes with a confirmed host-unreachable root cause (report 1 section 6 / report 2 section 0). PHASE-08 has no prerequisites; run any order (all Low).
>
> **Amended, not re-authored (2026-06-29):** new findings that belong to an existing systemic phase were folded in rather than given new plans. The Light-theme **Library tag chips + tome-subject label + sealed badge** low-contrast (report 1 section 7) is the same theme-aware-lightening-surface + non-inverting-inline-hex family as the Chat bubbles, so it became **PHASE-03 F6 / sub-phase 03H** (fix = invert the text, not the background; leave the on-dark author/difficulty chips alone). The "regenerate with the updated prompt" copy that PHASE-07 F2 fixes in Practice Exam was found in **two more** places - the **Domain Codex** empty-weights notice and the **Flashcards** domain-filter empty state - so PHASE-07 gained **F3 / sub-phase 07C** (a three-screen copy sweep). PHASE-03 03B also gained a note that the flashcard card gradient is a `background-image` (not `background-color`), so a `background-color`-only Light override won't cover it (report 2 section 3).
>
> **Already covered - not re-authored (2026-06-29):** several findings re-confirmed already-planned items and are fix-forward matters, not new plans. The Light-theme **flashcard dark-on-dark** is **PHASE-03 F1/03B** (re-confirmed on `index-C2MmghGQ.js`). The Light-theme **Chat/Oracle + user-bubble light-on-light** is **PHASE-03 F5/03G** (which already covers *both* bubbles - the run-1 "broader, user bubble too" note adds nothing new). The **paste-import non-activation / inconsistent toast** is **PHASE-07 F1**. The **Supabase token-refresh console noise** baseline is **PHASE-02 F1** (done), with the *new* circuit-breaker/quarantine hardening now planned as PHASE-08 F5. Info-only baselines (lucide-react 1.22.0 icon-regression clean, the 21-screen route sweep clean, flashcard-question contrast scan clean in run 1, "could not reproduce the Redeemed title", and the screenshot-capture hang) need no plan; the capture hang is a CDP/extension artifact, not an app defect.
>

> Add a row per future plan (numeric order), list prerequisites in **Depends on**, and
> update **Status** (`pending` → `in progress` → `done`) as the ds-phase-executer ships each one.
