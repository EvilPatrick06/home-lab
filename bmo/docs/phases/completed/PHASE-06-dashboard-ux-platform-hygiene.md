# PHASE-06 — bmo dashboard UX & platform hygiene round

> Authored 2026-06-25 from `bmo/docs/phases/QA/QA-report-2026-06-24-2.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Clean up the lower-severity, still-outstanding findings from the second QA pass that PHASE-04/05 don't cover: (1) **list check/delete failures are swallowed** — `bmo.js` only `console.warn`s, so a failed mutation looks like a dead control; (2) the **list delete (×) is hover-only** (`opacity-0 group-hover:opacity-100`) and tiny — unreachable on the wall-mounted touch display; (3) the dashboard calls **geolocation that Permissions-Policy blocks**, on load and every 15 minutes, and routes each rejection into the server js-error log (recurring noise); (4) the **Google Places API 503s on every load** (residual after PHASE-03 quieted the warning); and (5) the **`bmo-voice-canary.service` unit fails every run** because its `ExecStart` points at a module path that moved in a refactor.

This is a UX-polish + platform-hygiene round: surgical frontend edits (`bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`) plus one systemd unit one-liner. Each sub-phase is independently shippable and none changes a service contract.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@53163f4b`. Complements PHASE-03 (the first UX round): 06D is the *residual* of PHASE-03 03B (Places), and 06A/06B are list-row items 03 didn't cover.
- **Independent of PHASE-04/05.** Disjoint files; any order.
- **Already-fixed findings this phase deliberately does NOT re-plan** (the second QA pass tested `origin/master@12c655a8`, an integrator merge from 12:17 that predates the PHASE-01..03 merges, so several of its findings were fixed by the time those landed — verified at HEAD):
  - **List items can't be checked off/deleted (404)** — *fixed* by PHASE-01 01A; `ListService._find_item` resolves by id first (`calendar`… see `services/list_service.py:79-93`). The QA's cited "matches by text" pre-state no longer exists at HEAD.
  - **Music tab fully down (500-storm)** — *fixed* (the QA report itself notes Music now works).
  - **Now-playing polled twice per cycle** — *fixed* by PHASE-03 03H; the old `setInterval(fetchMusicState, 2000)` is replaced by a single self-scheduling, tab-scoped backoff loop (`bmo.js:491-504`). No duplicate poller remains at HEAD.
- **Voice-canary already logged:** the unit failure is recorded in `docs/logs/BMO-ISSUES-LOG.md` (`[2026-06-24] bmo-voice-canary.service ExecStart points at stale module path`). The second QA pass re-confirmed it live, so 06E is the fix (and clears the log entry per `docs/LOG-INSTRUCTIONS.md`).
- **Live-Pi boundary (rule 6):** the executer edits the **tracked** unit file in the repo; it does **not** `systemctl daemon-reload`/restart/enable on the live Pi (that's the owner/deploy action). The Google Maps/Places API key state (06D) is owner/cloud-console config — not edited here.

## Verified findings

All citations verified 2026-06-25 against `origin/master@53163f4b`. Dashboard JS: `bmo/pi/web/static/js/bmo.js`; template: `bmo/pi/web/templates/index.html`.

### F1 — List check/delete failures are swallowed (no `res.ok`, no toast)

**Status: confirmed.** `removeListItem` (`bmo.js:4515-4522`) and `checkListItem` (`bmo.js:4524+`) `await fetch(...)` then `await this.fetchLists()`, wrapped in a `try/catch` that only `console.warn`s — no `res.ok` check and no user-visible error. So if a mutation 4xx/5xx's, the row silently doesn't change and the user gets no feedback (the control looks dead). (At HEAD the *backend* 404 is fixed by PHASE-01, but a failed mutation for any other reason — offline, 5xx — is still invisible.)

```bash
sed -n '4515,4535p' bmo/pi/web/static/js/bmo.js   # removeListItem/checkListItem: warn-only, no res.ok/toast
```

### F2 — List delete (×) is hover-only and a tiny touch target

**Status: confirmed.** The per-item remove button is `class="text-xs text-red-400 opacity-0 group-hover:opacity-100 px-1"` (`index.html:247`) — invisible until mouse-hover and only `text-xs px-1`. bmo targets a wall-mounted touch display and phones, neither of which has hover, so the control is effectively unreachable and (when shown) far under a 44 px touch target. The notes delete (`index.html:272`) has the same pattern but the QA finding is scoped to Lists.

```bash
sed -n '242,248p' bmo/pi/web/templates/index.html   # remove × : opacity-0 group-hover, text-xs px-1
```

### F3 — Geolocation is called despite Permissions-Policy blocking it; each failure spams the js-error log

**Status: confirmed.** On init the dashboard schedules `pushDeviceLocation()` at +15 s and **every 15 min** (`setTimeout(...,15000)` + `setInterval(...,900000)`, `bmo.js:556-557`) and starts a `watchPosition` (`startGeoWatch`, `bmo.js:558,585-597`). `pushDeviceLocation` (`bmo.js:2598-2612`) calls `navigator.geolocation.getCurrentPosition` unconditionally; on failure it calls `_logGeolocationIssue` (`bmo.js:2539-2548`), which POSTs to `/api/ide/js-error` (throttled to once / 60 s). Where Permissions-Policy disables geolocation (this CF/kiosk deployment), every call fails with code 1 ("disabled … by permissions policy"), so the log accrues recurring entries the QA observed. There is **no** feature-detect / Permissions-API check before calling, and the 15-min retry never backs off for the known-blocked case.

```bash
sed -n '554,559p' bmo/pi/web/static/js/bmo.js        # +15s once + every 15min + startGeoWatch
sed -n '2539,2548p' bmo/pi/web/static/js/bmo.js       # _logGeolocationIssue → POST /api/ide/js-error (60s throttle)
sed -n '2585,2612p' bmo/pi/web/static/js/bmo.js       # watchPosition + getCurrentPosition, no policy check
```

### F4 — Google Places API 503s on every load (residual)

**Status: confirmed (PHASE-03 quieted the warning; the failed request remains).** `loadPlacesAPI` (`bmo.js:35-45`) injects the Maps JS script when `maps_api_key` is set; PHASE-03 03B made the `onerror` warning informative + once-per-session (`bmo.js:41-44`). But the script tag still loads on every page init and Google returns 503, so the network log shows a failed request each load and the autocomplete is unavailable. The residual fix is to avoid the request when there's no reachable consumer, or accept it as a documented keyed dependency.

```bash
sed -n '35,49p' bmo/pi/web/static/js/bmo.js          # loadPlacesAPI: still injects the script every load
```

### F5 — `bmo-voice-canary.service` fails every run (stale ExecStart module path)

**Status: confirmed (already in BMO-ISSUES-LOG).** The unit's `ExecStart` runs `-m services.voice_canary` (`bmo/pi/systemd/bmo-voice-canary.service:10`), but commit `7ff69808` moved the module into the `services/voice/` subpackage — the importable path is now `services.voice.voice_canary` (the file exists at `bmo/pi/services/voice/voice_canary.py`). So the oneshot dies with `No module named services.voice_canary` on every timer fire (06:30 / 18:30), and the STT-regression canary never runs. `bmo/docs/SYSTEMD.md` documents the same stale path.

```bash
sed -n '1,11p' bmo/pi/systemd/bmo-voice-canary.service   # ExecStart -m services.voice_canary (stale)
ls bmo/pi/services/voice/voice_canary.py                  # actual module location
grep -n "services.voice_canary" bmo/docs/SYSTEMD.md       # doc carries the stale path too
```

## Sub-phases

> Frontend JS/template — no JS unit harness in-repo; verify by diff review against the cited handlers (+ `node --check` on `bmo.js`). The systemd change (06E) is doc/unit text; `bmo-pi-pytest.yml` + the `no-new-prints`/docker/codeql guards cover the push.

### 06A — Surface list mutation failures (res.ok + toast)

**Objective:** a failed list check/delete shows an error and reverts visibly instead of silently no-op'ing.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In `removeListItem` (`bmo.js:4515`) and `checkListItem` (`bmo.js:4524`), capture the response and check `res.ok`; on failure, `this.showNotification('Couldn\x27t update the list — try again.', 'error')` (reuse the existing notification helper used elsewhere, e.g. the camera Snap toast) and skip the optimistic state change / re-fetch to reflect truth. Keep the `catch` for network errors but make it also surface the toast, not just `console.warn`.
2. Confirm `fetchLists()` still runs on success so the row reflects the server. Keep edits to these two functions only.

**Cheap check:** diff review; confirm both handlers check `res.ok` and toast on failure.

**Acceptance:** a failed list check/delete shows a toast and leaves the row in its true state; success still updates; no silent dead control.

### 06B — Make the list delete affordance touch-reachable

**Objective:** the per-item remove control is visible and adequately sized on a touch surface.

**Files:** `bmo/pi/web/templates/index.html`.

**Steps:**

1. On the Lists row remove button (`index.html:247`), drop `opacity-0 group-hover:opacity-100` so it's always visible, and enlarge to a real touch target (mirror the timer/alarm row delete sizing already in the template, e.g. `w-8 h-8`/`min-w-[44px] min-h-[44px] flex items-center justify-center`, with the existing red styling). Keep it visually subordinate (muted until pressed) but never hover-gated.
2. Optionally apply the same to the notes row (`index.html:272`) for parity since it shares the anti-pattern — keep it minimal; the QA finding is Lists, notes is a no-cost parity fix. Note the choice in `## Completed`.

**Cheap check:** diff review; confirm the remove control has no `group-hover` gate and meets a ≥44 px target.

**Acceptance:** the list delete × is always visible and tappable at ≥44 px on touch; layout isn't broken on the wall display width.

### 06C — Guard geolocation behind Permissions-Policy; stop the js-error spam

**Objective:** the dashboard doesn't repeatedly call a policy-blocked geolocation API, and a known-blocked state is recorded once (not as a recurring js-error).

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. Add a one-time capability check before any geolocation call. Prefer the Permissions-Policy signal: if `document.featurePolicy?.allowsFeature?.('geolocation') === false` (or `navigator.permissions?.query({name:'geolocation'})` resolves to `denied`), set a component flag `this._geoBlocked = true` and **skip** scheduling `pushDeviceLocation`/`startGeoWatch` entirely (guard the `setTimeout`/`setInterval`/`startGeoWatch` at `bmo.js:556-558`).
2. Treat the "disabled by permissions policy" rejection as expected, not an error: in the `getCurrentPosition`/`watchPosition` error callbacks (`bmo.js:2590,2606`), if `err.code === 1` and the message matches the policy phrasing (or `this._geoBlocked`), set `this._geoBlocked = true`, `console.info` once, and do **not** POST to `/api/ide/js-error`. Genuine errors (timeout, position-unavailable) keep the existing throttled report.
3. Once `_geoBlocked`, cancel the 15-min interval (`clearInterval`) so it stops retrying a call that can never succeed in this deployment; weather already falls back to the fixed configured location.

**Cheap check:** diff review; confirm geolocation isn't scheduled when policy-blocked and the policy rejection no longer POSTs js-error.

**Acceptance:** in a Permissions-Policy-blocked deployment the dashboard makes at most one geolocation attempt (or none), records the blocked state once, and stops the 15-min retry + js-error spam; where geolocation IS allowed, behaviour is unchanged.

### 06D — Quiet the Google Places loader residual

**Objective:** no recurring failed Maps/Places request when the feature has no reachable consumer; if retained, it's a documented, intentional keyed dependency.

**Files:** `bmo/pi/web/static/js/bmo.js`, `bmo/docs/DESIGN-CONSTRAINTS.md`.

**Steps:**

1. Determine whether Places autocomplete has a live consumer on the current dashboard (`grep -n "initPlacesAutocomplete\|pac-container\|placeChanged" bmo/pi/web/static/js/bmo.js bmo/pi/web/templates/index.html`). If **no** reachable consumer, **don't load the script** — gate `loadPlacesAPI` behind both a key *and* a consumer flag, so the 503 request stops firing on every load.
2. If a consumer exists and the owner wants it, keep the gated load but record the decision (retained, requires a valid key + referrer allowlist incl. `bmo.mybmoai.work` + Maps JS API enabled) in `bmo/docs/DESIGN-CONSTRAINTS.md`, extending the PHASE-03 03B note so the next QA reads the 503 as a known owner-config item rather than a regression.
3. Keep PHASE-03's once-per-session informative warning either way.

**Cheap check:** diff review; confirm the loader only runs with both a key and a consumer, or the retain-decision is documented.

**Acceptance:** the dashboard no longer fires a failing Places request every load (or the keyed dependency is explicitly documented as intentional); no new console noise.

### 06E — Fix the voice-canary unit ExecStart (and the doc)

**Objective:** `bmo-voice-canary.service` runs its oneshot successfully so the STT-regression canary is live again.

**Files:** `bmo/pi/systemd/bmo-voice-canary.service`, `bmo/docs/SYSTEMD.md` (+ `bmo/pi/README.md` if it repeats the path).

**Steps:**

1. Update `ExecStart` (`bmo-voice-canary.service:10`) from `... -m services.voice_canary` to `... -m services.voice.voice_canary` (the post-`7ff69808` module path; file at `bmo/pi/services/voice/voice_canary.py`).
2. Fix the same stale path in `bmo/docs/SYSTEMD.md` (and `bmo/pi/README.md` if it lists the command). Confirm via `grep -rn "services.voice_canary" bmo/` that no other tracked file carries the old path.
3. Update the `docs/logs/BMO-ISSUES-LOG.md` entry's checkbox / move it to `docs/logs/BMO-RESOLVED-ISSUES.md` per `docs/LOG-INSTRUCTIONS.md` (these logs union-merge). **Owner action (rule 6, not executed):** after merge+deploy, the owner runs `systemctl --user daemon-reload` (or the system equivalent) so the corrected unit takes effect — the executer never reloads/restarts the live Pi.

**Cheap check:** `grep -rn "services.voice_canary" bmo/` returns no hits (only `services.voice.voice_canary`); `ruff`/pytest unaffected (no Python changed).

**Acceptance:** the tracked unit + docs reference `services.voice.voice_canary`; no stale path remains; the log entry is resolved; the live daemon-reload is documented as the owner step.

## Research notes

- **Surface, don't swallow (06A):** a `try/catch` that only `console.warn`s turns a failed network mutation into a control that silently does nothing — the fix is the same `res.ok` + toast discipline PHASE-02/03 applied to music search and the camera Snap, reused for list rows.
- **Touch-first affordances (06B):** `opacity-0 group-hover:opacity-100` is a mouse-only idiom; on a hover-less wall display it hides the only delete control. Always-visible (subordinate) controls at ≥44 px are the standard touch target, matching the timer/alarm rows already in the template.
- **Feature-detect before you call (06C):** calling a Permissions-Policy-disabled API guarantees a rejection every time; the correct pattern is to check `featurePolicy.allowsFeature`/the Permissions API first and treat a policy rejection as an expected, log-once condition — never as a reported runtime error on a 15-minute loop. This stops a self-inflicted log-spam feedback loop (the page reports its own expected failure to its own error endpoint).
- **Don't request what can't succeed (06D):** loading a third-party script that reliably 503s on every page init is wasted work + recurring noise; gate it on an actual consumer, or document it as an intentional keyed dependency so it reads as expected.
- **Unit paths drift with refactors (06E):** moving a module into a subpackage silently breaks any `ExecStart -m old.path`; the same drift hides in docs. A grep sweep for the old dotted path catches every copy, and the log/resolved-log bookkeeping keeps the issue ledger honest.

## Test plan

- **06A–06D** — frontend JS/template; verified by diff review against the cited handlers + behavioural acceptance; `node --check` on `bmo.js` as a syntax gate.
- **06E** — unit/doc text; `grep` sweep for the stale path; no Python touched.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + `no-new-prints`/docker/codeql guards are the gate. No live-Pi deploy / daemon-reload (rule 6).

## Acceptance criteria

- [ ] List check/delete failures show a toast and leave the row in its true state; success still updates.
- [ ] The list delete × is always visible and ≥44 px on touch (no `group-hover` gate); layout intact on the wall display.
- [ ] In a Permissions-Policy-blocked deployment the dashboard stops retrying geolocation and stops POSTing the policy rejection to js-error; allowed deployments unchanged.
- [ ] The dashboard no longer fires a failing Google Places request every load (or the keyed dependency is documented as intentional).
- [ ] `bmo-voice-canary.service` + docs reference `services.voice.voice_canary`; no stale path remains; the issues-log entry is resolved; daemon-reload documented as the owner step.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Re-fixing the list 404, the music 500-storm, or the music double-poll** — all fixed at HEAD by PHASE-01/03 (the QA tested a pre-merge commit); see Dependencies.
- **Editing the Google Maps API key / cloud-console billing/referrer** — owner/cloud config (rule 6); 06D only stops the needless request or documents the dependency.
- **`systemctl daemon-reload`/restart/enable of the voice-canary unit on the live Pi** — owner/deploy action (rule 6).
- **Narrow (~375 px) phone-viewport layout verification** — QA couldn't capture it (the headless viewport stuck at 1662 CSS px); needs a real phone-width QA pass — logged for a future run.
- **Realtime auth (chat/IDE)** — PHASE-04. **Calendar token/health** — PHASE-05.

## Completed

- **06A** (2026-06-28) — `removeListItem` and `checkListItem` (`bmo/pi/web/static/js/bmo.js`) now check `res.ok` and show an error toast (`showNotification(..., 'error')`) on failure (network or HTTP) instead of only `console.warn`; success still re-fetches. No more silent dead control.
- **06B** (2026-06-28) — The Lists row remove × (`bmo/pi/web/templates/index.html`) dropped `opacity-0 group-hover:opacity-100` and is now always visible at a ≥44px touch target (`min-w-[44px] min-h-[44px] flex items-center justify-center`), with `title`/`aria-label`. Applied the same parity fix to the notes row delete (shared anti-pattern).
- **06C** (2026-06-28) — Geolocation is now guarded by Permissions-Policy. Added `_geolocationAllowed()` (checks `document.featurePolicy.allowsFeature('geolocation')`); init only schedules `pushDeviceLocation`/`startGeoWatch` when allowed (interval id tracked as `_geoInterval`). Added `_onGeoError()` which treats a code-1 (permission/policy) rejection as expected: sets `_geoBlocked`, clears the 15-min interval + the geo watch, logs once via `console.info`, and does NOT POST to `/api/ide/js-error`; genuine errors keep the throttled report. `pushDeviceLocation`/`startGeoWatch` short-circuit when `_geoBlocked`.
- **06D** (2026-06-28) — Places loader made lazy instead of page-init. The Maps key is stashed (`window._bmoMapsKey`) and `loadPlacesAPI` is now invoked from `initPlacesAutocomplete` on first real use (the event-form autocomplete is the only consumer, `index.html:1011/1076`), so the dashboard stops firing a failing keyed request on every load while the feature still works. Documented the keyed dependency + lazy-load decision in `bmo/docs/DESIGN-CONSTRAINTS.md` (extends the PHASE-03 03B note).
- **06E** (2026-06-28) — Fixed `bmo/pi/systemd/bmo-voice-canary.service` ExecStart `-m services.voice_canary` → `-m services.voice.voice_canary` (post-`7ff69808` subpackage path) and the matching reference in `bmo/docs/SYSTEMD.md`; `grep -rn services.voice_canary bmo/` is clean. Moved the resolved entry from `docs/logs/BMO-ISSUES-LOG.md` to `docs/logs/BMO-RESOLVED-ISSUES.md`. The live `systemctl daemon-reload` remains the owner/deploy step (rule 6, documented not executed).

_Cheap checks: `node --check web/static/js/bmo.js` clean; no Python touched (pytest/ruff unaffected); stale-path grep clean. Frontend JS/template verified by diff review against the cited handlers._

