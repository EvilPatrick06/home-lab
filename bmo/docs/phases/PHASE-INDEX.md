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
| 01 | [`PHASE-01-backend-route-correctness.md`](./completed/PHASE-01-backend-route-correctness.md) | bmo | — | done |
| 02 | [`PHASE-02-realtime-reliability.md`](./completed/PHASE-02-realtime-reliability.md) | bmo | 01 (soft) | done |
| 03 | [`PHASE-03-dashboard-ux-round.md`](./completed/PHASE-03-dashboard-ux-round.md) | bmo | 01, 02 (soft) | done |
| 04 | [`PHASE-04-realtime-cloudflare-auth.md`](./completed/PHASE-04-realtime-cloudflare-auth.md) | bmo | — | done |
| 05 | [`PHASE-05-calendar-token-and-health-truth.md`](./completed/PHASE-05-calendar-token-and-health-truth.md) | bmo | — | done |
| 06 | [`PHASE-06-dashboard-ux-platform-hygiene.md`](./completed/PHASE-06-dashboard-ux-platform-hygiene.md) | bmo | — | done |
| 07 | [`PHASE-07-list-endpoint-request-robustness.md`](./completed/PHASE-07-list-endpoint-request-robustness.md) | bmo | — | done |
| 08 | [`PHASE-08-deploy-runtime-version-truth.md`](./completed/PHASE-08-deploy-runtime-version-truth.md) | bmo | — | done |
| 09 | [`PHASE-09-chat-agent-module-init.md`](./completed/PHASE-09-chat-agent-module-init.md) | bmo | — | done |
| 10 | [`PHASE-10-service-health-truth.md`](./completed/PHASE-10-service-health-truth.md) | bmo | — | done |
| 11 | [`PHASE-11-dashboard-ux-round.md`](./completed/PHASE-11-dashboard-ux-round.md) | bmo | — | done |
| 12 | [`PHASE-12-dashboard-ux-correctness.md`](./completed/PHASE-12-dashboard-ux-correctness.md) | bmo | — | done |
| 13 | [`PHASE-13-ide-tv-doc-truth.md`](./completed/PHASE-13-ide-tv-doc-truth.md) | bmo | — | done |
| 14 | [`PHASE-14-ide-font-csp-and-redirect-doc-truth.md`](./completed/PHASE-14-ide-font-csp-and-redirect-doc-truth.md) | bmo | — | done |
| 15 | [`PHASE-15-chat-transcript-management.md`](./completed/PHASE-15-chat-transcript-management.md) | bmo | — | done |
| 16 | [`PHASE-16-chat-agent-action-execution-truth.md`](./completed/PHASE-16-chat-agent-action-execution-truth.md) | bmo | — | done |
| 17 | [`PHASE-17-dashboard-health-signal-ux-truth.md`](./completed/PHASE-17-dashboard-health-signal-ux-truth.md) | bmo | — | done |
| 18 | [`PHASE-18-plan-agent-prompt-format-crash.md`](./completed/PHASE-18-plan-agent-prompt-format-crash.md) | bmo | — | done |
| 19 | [`PHASE-19-destructive-and-noop-control-actions.md`](./completed/PHASE-19-destructive-and-noop-control-actions.md) | bmo | — | done |
| 20 | [`PHASE-20-dashboard-layout-music-notifications-ux.md`](./completed/PHASE-20-dashboard-layout-music-notifications-ux.md) | bmo | 17 (soft) | done |
| 21 | [`PHASE-21-docs-auth-surface-and-csp-truth.md`](./completed/PHASE-21-docs-auth-surface-and-csp-truth.md) | bmo | — | done |
| 22 | [`PHASE-22-chat-model-quota-fallback.md`](./PHASE-22-chat-model-quota-fallback.md) | bmo | — | pending |
| 23 | [`PHASE-23-calendar-reauth-flow-truth.md`](./PHASE-23-calendar-reauth-flow-truth.md) | bmo | — | pending |
| 24 | [`PHASE-24-control-state-truth.md`](./PHASE-24-control-state-truth.md) | bmo | 19, 20 (soft) | pending |
| 25 | [`PHASE-25-dashboard-hygiene-copy-round.md`](./PHASE-25-dashboard-hygiene-copy-round.md) | bmo | 17, 20, 24 (soft) | pending |

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


> **Provenance of this batch (04–06):** PHASE-04..06 were consolidated from
> `QA/QA-report-2026-06-24-2.md` (the second 2026-06-24 pass, against
> `origin/master@12c655a8`) by the bmo phase-maker on 2026-06-25, verified against
> `origin/master@53163f4b`. Same layer split as 01–03: **04** = realtime auth over
> Cloudflare (the socket.io handshake is rejected for CF-Access browsers — chat +
> IDE terminal; supersedes PHASE-02's transport hypothesis); **05** = calendar token
> persistence + health-signal truth (refreshed token not persisted → monitor false
> "down" while reads work; birthday-event 400 guard); **06** = dashboard UX & platform
> hygiene (list-row error/touch affordances, geolocation Permissions-Policy guard,
> Places loader residual, voice-canary unit path). Dependencies are **soft** — the
> three touch disjoint files and can land in any order; 04→05→06 (high→high/med→med/low)
> is the recommended order. **Note:** the second QA pass tested a commit
> (`12c655a8`) that predated the PHASE-01..03 merges, so its list-404, music-500-storm,
> and music-double-poll findings were already fixed at HEAD and are NOT re-planned here
> (see PHASE-06 "Already-fixed findings"). The bmo-phase-executer updates the Status
> column (`pending` → `in progress` → `done`) as it ships each plan.


> **Provenance of this batch (07–08):** PHASE-07..08 were consolidated from the
> third and fourth 2026-06-24 QA passes (`QA/QA-report-2026-06-24-3.md` @ `8c6811d5`
> and `QA/QA-report-2026-06-24-4.md` @ `53163f4b`, now in `QA/completed/`) by the bmo
> phase-maker on 2026-06-24, verified against `origin/master@3c89d787`. **07** = list-endpoint
> request-parsing robustness (the report-4 `415` on bodyless `…/check` + `…/clear`, plus the
> sibling add-item path); **08** = deploy/runtime version truth on `/api/v1/health` (the
> report-3 deploy↔restart skew made self-diagnosing by surfacing the boot-captured running SHA +
> asset build stamp + uptime, and — per report-4 §6 — the calendar token TTL on `/health/full`).
> Dependencies are **soft** — disjoint files, any order. **Not re-planned as code phases:** report-3/4's
> dominant **High** ("browser-rendered QA blocked" — `BMO_API_KEY` gate + off-Pi automation browsers)
> is an automation/infra coverage gap (attach a Pi-local browser), not bmo app code, so it is an
> owner/QA-infra item, not a phase; report-3's deploy-restart structural ask is already in
> `docs/logs/BMO-ISSUES-LOG.md` (08 adds only the code-side *observability*); and report-3's lo


> **Provenance of this batch (12–13):** PHASE-12..13 were consolidated from
> `QA/QA-report-2026-06-28-2.md` (the **second** 2026-06-28 pass, live process
> `655a930f` / `origin/master@a2d87c53`, now in `QA/completed/`) by the bmo
> phase-maker on 2026-06-29, verified against `origin/master@af795b36`. Run 2's two
> headline findings — the chat agent down and the calendar OAuth revoked — were
> **already planned** (chat = PHASE-09; calendar health/UX = PHASE-10/11; the reauth
> is an owner action) and are **not** re-planned; this batch covers only the **new**
> dashboard/backend defects run 2 surfaced. Same layer split as prior batches:
> **12** = frontend UX correctness (the `x-init="init()"` double-bootstrap, calendar
> create/update success-gating + retain-on-failure, timer-preset label, TV pairing
> affordance + friendly error copy); **13** = backend/IDE/doc truth (the unbounded
> `_tv_cmd` worker read → ~30s pairing hang, the IDE terminal opening in the deploy
> checkout while the explorer is on the dev tree, the blank-until-keypress terminal,
> and the `SERVICES.md`/`bmo-ide.service` `:5001`-vs-`/ide`-on-`:5000` doc reconciliation
> that extends PHASE-11 11F). Dependencies are **soft** — disjoint files, any order;
> 12→13 (frontend→backend) is the recommended order. **Coordinate, don't collide:**
> 12A vs 11E (geolocation double-log — different files), 12B vs 11C (same calendar
> handlers, different lines), and 12D/13A vs 11D (TV pairing, from the UI/backend
> sides). **Not re-planned as code phases:** the calendar refresh-token reauth and the
> missing `GOOGLE_VISION_API_KEY` are owner/log items, and the header-clock TZ
> divergence is intentional per `DESIGN-CONSTRAINTS` (the report itself reclassifies
> it). The bmo-phase-executer updates the Status column (`pending` → `in progress`
> → `done`) as it ships each plan.

> **Provenance of this batch (14-15):** PHASE-14..15 were consolidated from
> `QA/QA-report-2026-06-28-3.md` (the **third** 2026-06-28 pass, live process
> `f51d9dc3` driven against `origin/master@d9dccc65` over the Pi loopback, now in
> `QA/completed/`) by the bmo phase-maker on 2026-06-29. Run 3's two headline
> findings are **not** re-planned: the chat-agent outage (`/api/chat` 500 / agent
> `None`) is **already planned and merged as PHASE-09** (the `sys.modules` alias +
> `_app()` belt + None-agent guards) and the run-3 live 500 is **deploy-lag** (the
> tested process `f51d9dc3` predates the merge); the Google Calendar OAuth
> unauthenticated/`needs_auth` state is an **owner reauth action** (framed by
> PHASE-05 / PHASE-10), not a code defect. This batch covers only the **new**
> findings run 3 surfaced, split by surface: **14** = IDE surface (the `/ide`
> Google-Fonts CSP violation + the dashboard IDE-tab-is-a-redirect doc-truth note,
> extending PHASE-13 13D / PHASE-11 11F); **15** = chat transcript management
> (a discoverable clear-chat button over the existing `/api/chat/clear` flow +
> a new per-message delete — the affordances PHASE-09 09C's orphan-stub hygiene
> did not provide). Dependencies are **soft** — disjoint files, any order;
> 14->15 is fine. **Not re-planned as code phases:** the chat-agent outage
> (PHASE-09, merged; awaiting deploy), the chat seed/probe noise (already swept by
> PHASE-09 09C, merged; awaiting deploy), and the calendar OAuth reauth (owner
> action). The bmo-phase-executer updates the Status column (`pending` ->
> `in progress` -> `done`) as it ships each plan.

> **PHASE-14/15 duplicate-authoring reconciliation (2026-07-03).** A stale
> second `auto/bmo-phase-maker` run (tip `2b41551c`) re-authored these same
> two phases from the same `QA-report-2026-06-28-3` under different slugs
> (`PHASE-14-ide-csp-and-tab-doc-truth.md` / `PHASE-15-chat-history-hygiene.md`),
> which is why it would not merge (duplicate PHASE-14/15 index rows). The
> **merged pair above is canonical**; the second run's improvements are already
> captured here — PHASE-14's CSP fix serves the fonts from the already-allowlisted
> `cdn.jsdelivr.net` (no CSP widening), and PHASE-15 reuses the existing
> `/api/chat/clear` flow plus a new bounded per-message delete endpoint. Nothing
> unique to `2b41551c` remains unported (it carried only the duplicate phase
> docs, no code), and it has **no remaining remote/local branch** — the stale
> `auto/bmo-phase-maker` ref was already deleted, so there is nothing left to
> delete. Resolves BMO-ISSUES-LOG [2026-06-29] `auto/bmo-phase-maker` won't-merge.


> **Provenance of this batch (16-17):** PHASE-16..17 were consolidated from the
> two 2026-06-29 QA passes (`QA/QA-report-2026-06-29.md`, run 1, live `605e712f`,
> and `QA/QA-report-2026-06-29-2.md`, run 2, live `7a266d22`, both now in
> `QA/completed/`) by the bmo phase-maker on 2026-06-29, verified against
> `origin/master@937f89f7`. Both runs' headline **High** is one trust failure —
> the chat agent confirms real-world actions that silently failed — so its three
> root causes are consolidated into **16**: the LED service-key mismatch
> (`led_controller` vs registered `leds`), the `_execute_command` success flag
> derived from a truthy error string + non-informational control errors dropped
> from the reply, and the latent `create_alarm` timezone `.key` `AttributeError`.
> **17** = the two dashboard-frontend findings 16 doesn't cover: the
> degraded/warning health pill + System Status summary never naming the failing
> subsystem (the `critical` branch already does), and the narrow-viewport header
> wrap. Dependencies are **soft** — disjoint files (16 = `agent.py`/`app.py`/
> `timer_service.py`; 17 = `bmo.js`/`index.html`), any order; 16->17 (high->low)
> recommended. **Not re-planned as code phases:** the **weather forecast ⚡ icon**
> (investigated — `WMO_CODES` is complete and defaults to *clear* not storm, so
> three storm icons = a real all-thunderstorm forecast, not a fallback bug); the
> **alarm create-vs-list TZ display** (intentional Pi-system-vs-location-TZ
> reconciliation per `DESIGN-CONSTRAINTS`); the **README `:5001` reference**
> (already corrected by PHASE-11 11F / PHASE-13 13D — HEAD already qualifies it as
> experimental/loopback-only/stalled); the **`/ide` Google-Fonts CSP** (already
> PHASE-14); the **"Hello from BMO!" chat-seed pollution** (owner one-time
> `recent_chat.json` cleanup per `DESIGN-CONSTRAINTS` 01E; the new-leak guard
> landed in PHASE-09 09C); the **Google Calendar OAuth reauth** and the missing
> **`GOOGLE_VISION_API_KEY`** (owner/ops actions, tracked in the logs); and the
> **Conversation-agent personality deflections** (intended BMO personality). The
> bmo-phase-executer updates the Status column (`pending` -> `in progress` ->
> `done`) as it ships each plan.
> **Provenance of this batch (18-21):** PHASE-18..21 were consolidated from
> `QA/QA-report-2026-07-02.md` (run 4, live deploy `4c7bcd82`, now in
> `QA/completed/`) by the bmo phase-maker on 2026-07-02, verified against
> `origin/master@b1128097`. Layer split: **18** = the headline **High** — the
> Plan agent crashes on every request (`KeyError: 'state'` from unescaped
> literal braces in `DESIGN_PROMPT`, a regression of the 2026-05-17 Phase 39
> fix class; bug -> auto-implement) plus the missing prompt-render unit test
> that let it ship. **19** = destructive & no-op control-action truth (calendar
> Del with no confirm; the silent-play "Unmute" CTA that cannot fix volume-0;
> camera-offline raw-exception leak + the Snap toast painted *behind* the
> same-z-index camera overlay; OLED expression POST claiming success while
> disabled). **20** = dashboard layout/music/notification-history UX (header
> unshrinkable at 375 px — finishes 17B by adding `min-w-0` at the flex-group
> level; bottom-nav overflow affordance; `formatTime` missing an hours branch;
> the Queue panel binding a `musicState.queue` field no code path populates;
> Home-Upcoming vs Week now-forward consistency; bell history seeded from
> `/api/alerts/history`). **21** = docs/config truth (the "localhost + LAN are
> exempt" claim — stale twice over now that the transport source gate rejects
> plain-LAN peers; the README `bmo-ide` service-table row for a unit that does
> not exist; the Places-loader CSP contradiction). Dependencies are **soft** —
> disjoint files (18 = `plan_agent.py`+tests; 19 = `app.py`/`system_api.py`/
> frontend; 20 = frontend only; 21 = docs + CSP): any order; 18->19->20->21
> (high->medium->low) recommended. 20 lists 17 as a soft dependency only because
> it extends 17B's header work. **Not re-planned as code phases:** the
> **Pi-TZ vs location-config mismatch** (owner action item — the report itself
> notes either side could be the stale one) and the **`/ide` AudioContext
> console flood** (unverified — likely a headless-test-browser artifact; re-check
> in a real browser next run). The bmo-phase-executer updates the Status column
> (`pending` -> `in progress` -> `done`) as it ships each plan.

> **Provenance of this batch (22-25):** PHASE-22..25 were consolidated from
> `QA/QA-report-2026-07-15.md` (run 5, live deploy `d6699d52`, runtime identical
> to `e03664fa`, now in `QA/completed/`) by the bmo phase-maker on 2026-07-15,
> verified against `origin/master@f2300ac8`. Layer split: **22** = the headline
> **High** — Plan-tier agents are pinned to `gemini-3.1-pro` whose free-tier
> quota is 0, with no 429 fallback (quota ladder Pro->Flash->local, stop
> poisoning the global cloud flag on 4xx, structured chat-error events +
> cause-specific copy). **23** = the second **High** — the in-dashboard calendar
> re-auth is broken end-to-end (dead OOB manual mode replaced with the
> paste-redirect-URL flow, popup-failure surfacing, needs-auth vs offline copy
> split, refresh-flood circuit breaker, `[cal] recovered` gating); registering
> the loopback/CF redirect URIs on the OAuth client is an **owner console
> action**, called out in the plan. **24** = control-surface state truth (the
> LED mode/enabled contract desync; the TV worker`s empty-string errors that
> 200 through every truthiness check + disconnected-remote affordance; status
> summary as-of stamps and the localStorage pill seed). **25** = the low/info
> hygiene round (health-pill detail popover, quip-vs-pending-request interleave
> + retiring the no-timers nudge, playlist view-count-as-tracks mapping, the
> `yt3.ggpht.com` img-src CSP gap, the form-less Wi-Fi password input, and the
> copy nit batch: alarm-toast culprit, whole-header tap-target, chrome-flags
> caveat). Dependencies are **soft** — 24 touches `app.py`/`bmo.js` lines near
> pending 19/20 work and 25A/25F share header lines with 20A, so re-anchor and
> coordinate; any order lands. 22->23->24->25 (high->high->medium->low) is the
> recommended order. **Not re-planned as code phases:** the calendar token
> reauth itself and the OAuth redirect-URI registration (owner actions; the
> latter is called out in PHASE-23), the Pi thermal margin / PSU
> "throttled since boot" flags (hardware/owner item — 24C only makes reporting
> honest), and the re-verified findings already planned in pending phases: the
> Unmute CTA (19B), OLED-disabled face acks (19D), the always-empty Queue panel
> (20C), narrow-viewport header/nav (20A/20B), and the Places-loader CSP
> contradiction (21C). The bmo-phase-executer updates the Status column
> (`pending` -> `in progress` -> `done`) as it ships each plan.
