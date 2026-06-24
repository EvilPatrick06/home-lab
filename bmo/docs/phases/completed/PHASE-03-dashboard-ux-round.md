# PHASE-03 — bmo dashboard UX & frontend resilience round

> Authored 2026-06-24 from `bmo/docs/phases/QA/QA-report-2026-06-24.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Clean up the lower-severity dashboard-UX and frontend-resilience findings from the 2026-06-24 QA pass — the rough edges that don't take a tab down but make the wall display feel broken or confusing: the **header clock shows an inconsistent hour** (browser-local TZ until the weather/location socket event pins the real one); the **persistent "Failed to load Google Places API" console warning** on every load; **Notes don't submit on Enter** for parity with the other add fields; **timer presets both start a timer AND fill the custom field** (causing an accidental second timer); the **alarm enable toggle is only available for recurring alarms** (a one-off alarm can't be disabled, only deleted); a **0%-volume alarm fires silently** with no warning; the **OLED face control** documented in the QA inventory isn't on the Settings surface; the **camera-quick-snap path** swallows a 503; and the **cross-cutting high-frequency polling** that floods the network (and hot-polls a down `/api/music/state`) with no backoff.

This is the bmo analogue of a "a11y/UX round" — surgical frontend edits (mostly `bmo/pi/web/static/js/bmo.js` + `bmo/pi/web/templates/index.html`), each independently shippable, none changing a service contract. Intentionally **after** PHASE-01 (backend correctness) and PHASE-02 (realtime) so the structural failures are fixed before the polish.

## Dependencies & cross-phase notes

- **Depends (soft) on PHASE-01 + PHASE-02.** The poll-backoff item (03H) assumes PHASE-01's `/api/music/state` returns a clean 503 (so "back off on non-2xx" has a clear signal) and that PHASE-02's `res.ok` guards exist (don't duplicate them). No hard ordering, but landing 01/02 first keeps 03's edits purely cosmetic.
- **No file collisions by design:** PHASE-02 edits the chat/IDE/socket lifecycle in `bmo.js`; this phase edits the clock, notes, timer/alarm, music-poll, and Places loader. They touch different functions in the same file — keep each sub-phase's edits to its named functions so the two phases' diffs stay disjoint if executed close together.
- **Mostly intentional-vs-bug judgment calls:** several findings (alarm toggle visibility, 0% volume, OLED face) are partly "works as designed but confusing." Per INSTRUCTIONS.md rule 9, none of these is a STOP — each has a clear reasonable reading (documented in the sub-phase); where the QA finding turned out to be already-handled (camera snap, see F8), the sub-phase says so and does the minimal residual fix rather than re-implementing.

## Verified findings

All citations verified 2026-06-24 against `origin/master@d0974250`. Dashboard JS: `bmo/pi/web/static/js/bmo.js` (**4,451 lines**); template: `bmo/pi/web/templates/index.html`.

### F1 — Header clock renders browser-local TZ until the weather/location socket event pins the real one

**Status: confirmed.** `updateClock()` (`bmo.js:623-645`) formats `new Date()` with `{ timeZone: this.timezone }` **only when `this.timezone` is set**, else `{}` (browser-local TZ). `this.timezone` is populated **asynchronously** from socket events — `weather_update` (`bmo.js:660`, `if (data.timezone) this.timezone = data.timezone`) and `location_update` (`bmo.js:666`). The clock starts ticking immediately on init (`updateClock()` then `setInterval(... ,1000)`, `bmo.js:409-410`) **before** those events arrive. So on first paint the clock shows the **browser's** timezone (the QA browser was Central), and once `weather_update` lands it re-renders in the configured location's TZ — a one-hour jump for the same wall-clock moment on a wall display. Compounded by a config mismatch QA noted (Pi system TZ `America/Denver` vs configured weather location Kansas/Central), but the *render bug* is purely the browser-local fallback before the authoritative TZ loads.

```bash
sed -n '623,645p' bmo/pi/web/static/js/bmo.js     # updateClock: {timeZone:this.timezone} or {} (browser-local)
sed -n '405,412p' bmo/pi/web/static/js/bmo.js      # clock starts before socket TZ arrives
grep -n "data.timezone) this.timezone" bmo/pi/web/static/js/bmo.js  # 660, 666 — async TZ source
```

### F2 — "Failed to load Google Places API" warns on every load

**Status: confirmed.** `loadPlacesAPI(apiKey)` (`bmo.js:34-41`) injects the Maps JS script and logs `console.warn('Failed to load Google Places API')` on `script.onerror` (`bmo.js:40`). It's invoked at init only when a key exists (`if (c.maps_api_key) loadPlacesAPI(c.maps_api_key)`, `bmo.js:514`), so the warning means the script load is failing (invalid key, referrer restriction not including `bmo.mybmoai.work`, or a 404) — firing on every page load. The dependent autocomplete (`initPlacesAutocomplete`, `bmo.js:51-73`) silently won't work. The warning is uninformative (doesn't name the cause) and is recurring noise that masks real console errors.

```bash
sed -n '30,75p' bmo/pi/web/static/js/bmo.js     # loadPlacesAPI / onerror warn / initPlacesAutocomplete
sed -n '511,516p' bmo/pi/web/static/js/bmo.js     # load gated on maps_api_key
```

### F3 — Notes don't submit on Enter (the music search field had to add an explicit handler)

**Status: confirmed; subtle.** The notes add field is inside a form: `<form @submit.prevent="addNote()">` with a single `<input x-model="newNoteText">` and a submit button (`index.html:258-262`). A single-text-input form *should* submit on Enter, but the rest of the dashboard does **not** rely on that — the music search input explicitly uses `@keydown.enter.prevent.stop="searchMusic()"` (`index.html:407`) precisely because implicit submit wasn't reliable in this Alpine/layout setup. QA observed no POST fires on Enter in Notes. The safe, parity fix is to add the same explicit Enter handler to the notes input rather than depend on implicit form submission.

```bash
sed -n '258,262p' bmo/pi/web/templates/index.html   # notes form: @submit.prevent, single input
sed -n '405,408p' bmo/pi/web/templates/index.html    # music field uses explicit @keydown.enter
grep -n "addNote" bmo/pi/web/static/js/bmo.js          # 2564 — handler exists; only + button reliably triggers it
```

### F4 — Timer presets both start a timer AND fill the custom seconds field → accidental second timer

**Status: confirmed.** The preset buttons bind `@click="newTimerSec = p.s; createTimerRaw()"` (`index.html:1253-1257`) — they **(a)** write the preset seconds into `newTimerSec`, which is `x-model`-bound to the custom "sec" input (`index.html:1264`), **and (b)** immediately start a timer via `createTimerRaw()`. So tapping "5m" starts a 5-minute timer *and* leaves `300` in the custom field; a user who then taps **Start** (`createTimer()`, `index.html:1268`) creates a *second* timer from the lingering field value (QA reproduced exactly this — two timers). The dual effect is the bug regardless of whether one-tap-start is intended.

```bash
sed -n '1250,1269p' bmo/pi/web/templates/index.html   # preset sets newTimerSec AND createTimerRaw(); Start reuses field
```

### F5 — Alarm enable/disable is only rendered for recurring alarms (one-off alarms can't be disabled)

**Status: confirmed; mostly intentional, real gap for one-offs.** The alarm-row "On/Off" toggle is gated `x-show="item.type === 'alarm' && item.repeat && item.repeat !== 'none'"` (`index.html:1346-1351`) → it renders **only for recurring alarms**; it calls `toggleRecurringAlarm(item)` → `POST /api/alarms/<id>/enabled` (`bmo.js:2325`). The "Pause" control is `x-show item.type==='timer'` (timer-only), and "+5m" is `x-show item.fired` (post-fire only). So a freshly-created **one-off** alarm (no repeat) shows only its time + the delete ✕ — exactly QA's observation. Clicking "On" produced no network call because the toggle wasn't rendered for that non-recurring alarm. This is largely by design (a one-off has nothing to "keep off"), but the real UX gap is that a one-off alarm can only be **deleted**, not temporarily disabled, and nothing communicates that the On/Off control is repeat-only.

```bash
sed -n '1344,1361p' bmo/pi/web/templates/index.html   # On/Off repeat-gated; Pause timer-only; +5m fired-only
grep -n "toggleRecurringAlarm\|alarms/.*enabled" bmo/pi/web/static/js/bmo.js   # 2325 — enable endpoint
```

### F6 — A 0%-volume alarm fires silently with no warning

**Status: confirmed (state-level; no guard exists).** QA's Volume panel showed Master/Music/Effects/Notifications/**Alarms** all at 0% (only Voice at 80%) with a sticky "Master volume is 0%" banner. The alarm volume is loaded at startup (`timers.alarm_volume = int(saved_alarm_vol)`, `app.py` timers init ~`690`), but there is **no cross-check** at alarm-create/enable time between "an alarm is armed" and "alarm/master volume is 0%". So a user sets an alarm that will fire inaudibly with nothing on the alarm UI warning them. This is partly user state, but the dashboard can guard the alarm path specifically.

```bash
grep -n "alarm_volume\|volume.alarms" bmo/pi/app.py bmo/pi/web/static/js/bmo.js | head   # alarm volume plumbing, no arm-time guard
```

### F7 — OLED face/expression control isn't on the Settings surface

**Status: confirmed; likely agent-only by design.** The Settings tab exposes RGB Lights, Volume, Scene Modes, Audio Routing, Bluetooth, Notifications, Voice Output/Mic, Smart Home, Voice Settings, Wi-Fi, Routines — but **no** face/expression picker, while the QA inventory lists an OLED "face" control under Controls. The `/api/oled/*` endpoints exist (`grep -n "oled" bmo/pi/app.py`) but appear to be driven by the **agent** (expression syncs on chat "thinking"/"error" via `_sync_expression`), not a dashboard control. Either expose a manual control or correct the inventory; this is a docs/scope reconciliation, not a broken feature.

```bash
grep -n "/api/oled\|_sync_expression\|oled_face" bmo/pi/app.py | head   # agent-driven expression, no dashboard picker
```

### F8 — Camera "Snap": the main view already surfaces 503; a secondary quick-snap path doesn't

**Status: confirmed — largely already fixed; one residual path.** The camera-view **Snap** button already handles failure: `takeSnapshot` (`bmo.js:2796-2814`) checks `res.ok`, reads `data.error`, and calls `this.showNotification(...)` on a non-2xx (so a 503 *does* surface a toast there). The **un-guarded** path is the chat/vision quick-snap at `bmo.js:2022` — `await fetch('/api/camera/snapshot', { method: 'POST' })` with no `res.ok` handling. So the QA finding is mostly already addressed for the primary Snap; the residual is the secondary path silently no-op'ing on 503.

```bash
sed -n '2796,2814p' bmo/pi/web/static/js/bmo.js   # camera-view Snap ALREADY handles res.ok + toast
sed -n '2020,2024p' bmo/pi/web/static/js/bmo.js    # chat/vision quick-snap: no res.ok handling (residual)
```

### F9 — High-frequency global polling floods the network; no backoff on errors

**Status: confirmed.** Several status endpoints are polled on `setInterval` **globally** (regardless of active tab): `/api/music/state` every 2s (`bmo.js:472`), `/api/timers` every 1s (`bmo.js:474`, partly tab/active-gated), `/api/tv/status` every 5s (tab-gated, `bmo.js:478`), `/api/calendar` every 5min (`bmo.js:476`), health every 30s (`bmo.js:510`). The music poll runs everywhere and **never backs off** — with the music service down (PHASE-01 F2) it produced the 307-request, mostly-500 storm QA captured. None of the pollers back off on repeated non-2xx, and they aren't tab-scoped.

```bash
grep -n "setInterval" bmo/pi/web/static/js/bmo.js   # 410,411,472,474,476,478,510,524 — global pollers
sed -n '470,479p' bmo/pi/web/static/js/bmo.js         # music/timers/tv/calendar poll intervals
```

## Sub-phases

> Frontend JS/template; no JS unit harness in-repo — verify by diff review against the cited handlers + behavioural acceptance. Where a sub-phase touches Python (none here except F6's optional arm-time check, which is frontend), keep the logger (no new `print()`). Each sub-phase is independent; land them in order but any can be skipped without breaking another.

### 03A — Pin the clock to a single authoritative timezone (no browser-local flash)

**Objective:** the header + large clock show one consistent, correct local time on first paint and every render path.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. Seed `this.timezone` from a deterministic source before the first `updateClock()` so it never falls back to browser-local. Options, in order of preference: (a) a server-injected value (have the template render the configured location/Pi TZ into a `<meta>` or a JS global the component reads at init), or (b) the cached weather payload already persisted to `localStorage` (`bmo_weather_cached`, written at `bmo.js:660`+) — read `JSON.parse(localStorage.bmo_weather_cached)?.timezone` at init and assign `this.timezone` before `updateClock()` (`bmo.js:409`). Prefer (a) if a server value is readily available; (b) is a pure-frontend fallback that fixes the *flash* for any returning client.
2. In `updateClock()` (`bmo.js:623-645`), if `this.timezone` is still empty, render nothing (or a stable placeholder) rather than browser-local — so the displayed hour never changes once the authoritative TZ arrives. Concretely: `const options = this.timezone ? { timeZone: this.timezone } : null; if (!options) return;` (skip the tick until TZ is known; the first weather/location event, or the seed from step 1, starts it).
3. Keep both the header clock and the large Home clock deriving from this single `this.timezone` (they already share `updateClock()` — confirm no second `new Date()` path renders a time elsewhere: `grep -n "toLocaleTimeString\|new Date(" bmo.js`).

**Cheap check:** diff review; confirm no render path uses browser-local TZ and the clock is seeded before first paint.

**Acceptance:** the clock shows one consistent TZ from first paint; navigating/reloading never changes the displayed hour for the same moment.

### 03B — Make the Places loader warning actionable (and quiet when Places isn't used)

**Objective:** no recurring uninformative warning; if Places is used, the failure names its likely cause; if it isn't, the loader doesn't run.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In `loadPlacesAPI`'s `onerror` (`bmo.js:40`), replace the bare warning with one that names the cause and fires once: `console.warn('[bmo] Google Places API failed to load — check the API key, its HTTP-referrer restriction (must include this host), and that the Maps JS API is enabled.')`. Set a module flag so it logs at most once per session.
2. Gate the loader: it's already only called when `c.maps_api_key` exists (`bmo.js:514`) — confirm there's no second unconditional include. If Places is confirmed unused on the current dashboard (no `initPlacesAutocomplete` consumer is reachable), prefer **not loading it at all** unless a key *and* a consumer exist; otherwise keep the gated load with the improved message.
3. Add a one-line note in `bmo/docs/DESIGN-CONSTRAINTS.md` recording the decision (Places retained-and-keyed vs removed) so the next QA run reads it as intentional.

**Cheap check:** diff review; confirm the warning is informative + once-per-session and the loader stays gated.

**Acceptance:** the console no longer shows a recurring uninformative Places warning; a real load failure names its cause once; the loader only runs when keyed.

### 03C — Notes: submit on Enter for parity

**Objective:** pressing Enter in the Notes add field adds the note, matching the Lists/chat/music add fields.

**Files:** `bmo/pi/web/templates/index.html`.

**Steps:**

1. Add an explicit Enter handler to the notes input (`index.html:259`), mirroring the music field's pattern (`index.html:407`): `@keydown.enter.prevent.stop="addNote()"`. Keep the `<form @submit.prevent="addNote()">` and the + button so both paths work. (Explicit handler is the reliable fix; the implicit form-submit clearly isn't firing in this setup per F3.)
2. Confirm `addNote()` already clears `newNoteText` on success (`bmo.js:2564-2586` — it does) so Enter-add leaves the field ready for the next note.

**Cheap check:** diff review; confirm the input has the explicit Enter handler.

**Acceptance:** typing a note + Enter fires `POST /api/notes` and adds it; the + button still works; field clears after add.

### 03D — Timer presets: pick one behaviour (don't both start and fill the custom field)

**Objective:** a preset tap has one unambiguous effect; tapping a preset then Start never creates an accidental second timer.

**Files:** `bmo/pi/web/templates/index.html`, `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. Decide the model: **quick-start presets** (one tap = one timer) is the cleaner reading and matches the round shape/placement. Change the preset binding (`index.html:1253-1257`) to start *without* mutating the custom field: `@click="startPresetTimer(p.s, p.l)"`.
2. Add `startPresetTimer(seconds, label)` to `bmo.js` near `createTimerRaw` (`bmo.js` timer section): build and POST the timer from the passed `seconds`/`label` directly, **without** touching `newTimerSec`/`newTimerMin`/`newTimerLabel`. Reuse the existing create call `createTimerRaw` uses, just sourced from args.
3. Leave the custom builder (`newTimerMin`/`newTimerSec`/`newTimerLabel` + Start `createTimer()`, `index.html:1259-1269`) untouched — it remains the "fill then Start" path. The two are now visually distinct (round presets = instant; the row with Start = custom).

**Cheap check:** diff review; confirm presets no longer write the custom field and Start uses only the custom inputs.

**Acceptance:** tapping a preset starts exactly one timer and leaves the custom field empty; tapping a preset then Start does not create a second timer.

### 03E — Alarm enable/disable available for one-off alarms (or clearly repeat-only)

**Objective:** a one-off alarm can be temporarily disabled without deleting it — or, if kept repeat-only by design, the UI doesn't read as a missing control.

**Files:** `bmo/pi/web/templates/index.html`, `bmo/pi/web/static/js/bmo.js`, `bmo/pi/services/timer_service.py` (only if the enable endpoint needs to accept one-offs).

**Steps:**

1. Verify the enable endpoint handles non-recurring alarms: check `toggleRecurringAlarm` → `POST /api/alarms/<id>/enabled` (`bmo.js:2325`) and the `timer_service` handler — does it gate on `repeat`? If it accepts any alarm id, proceed; if it rejects one-offs, widen it to set an `enabled` flag on any alarm.
2. Change the toggle's `x-show` (`index.html:1346-1351`) to render for **all** alarms: `x-show="item.type === 'alarm'"` (drop the `repeat` condition). Rename the handler to `toggleAlarm(item)` if it's now general (keep `toggleRecurringAlarm` as the body if behaviour is identical). A disabled one-off simply won't fire until re-enabled (it stays in the list).
3. If, on inspection, one-off disable is genuinely out of scope for the timer service (e.g. a one-off is consumed on fire and an `enabled=false` one-off has no meaning), instead **document** the repeat-only design: add a tiny tooltip/`title` on the alarm row ("Enable/disable applies to repeating alarms") and note it in `DESIGN-CONSTRAINTS.md`. Pick the implementable option; prefer (2) per the fix-forward stance (rule 27) if the endpoint already supports it.

**Cheap check:** if Python touched, `cd bmo/pi && python -m pytest tests/test_timer_service.py -q`; else diff review.

**Acceptance:** a one-off alarm can be disabled/enabled from the row (preferred), or the repeat-only behaviour is explicitly communicated; the toggle calls its endpoint and persists.

### 03F — Warn when an armed alarm will be silent (0% alarm/master volume)

**Objective:** creating or enabling an alarm while alarm/master volume is 0% surfaces a clear "this alarm will be silent" warning.

**Files:** `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

**Steps:**

1. The dashboard already knows the volume state (the "Master volume is 0%" banner and the Volume panel sliders). In the alarm create/enable handlers (`createAlarmFromTime` `bmo.js:2126`, `toggleAlarm`/`toggleRecurringAlarm`), after a successful create/enable, check the alarm + master volume; if either is 0%, `this.showNotification('Alarm volume is 0% — this alarm will be silent. Raise Alarms or Master volume in Settings.', 'warning')`.
2. Source the volume from the existing settings state the Volume panel binds to (find the `x-model` for the alarms/master sliders in `index.html` and read the same component field). Don't add a new fetch — reuse the loaded settings.
3. Optionally add a small persistent "🔇 silent" badge on alarm rows when alarm/master volume is 0% (reuse existing row styling; keep it minimal — this is a warning, not a redesign).

**Cheap check:** diff review; confirm the warning fires on create/enable when volume is 0%.

**Acceptance:** arming an alarm at 0% alarm/master volume shows a clear silent-alarm warning; no false warning when volume > 0%.

### 03G — OLED face control: expose a manual picker or correct the inventory

**Objective:** the documented OLED "face" control either exists on Settings or the inventory is corrected so it's not a phantom feature.

**Files:** `bmo/pi/web/templates/index.html` + `bmo/pi/web/static/js/bmo.js` (if exposing), or `bmo/docs/` (if documenting agent-only).

**Steps:**

1. Determine intent: inspect `/api/oled/*` (`grep -n "oled" bmo/pi/app.py`) — is there a set-expression endpoint suitable for a manual control? The expression is currently agent-driven via `_sync_expression` (thinking/speaking/error/idle).
2. **If a manual control is wanted (fix-forward, rule 27):** add a small "Face" picker to the Settings tab (a row of expression buttons posting to the existing `/api/oled/expression` set endpoint), reusing the Settings card styling; reset to agent-driven "idle" after a timeout so it doesn't fight the chat-driven sync.
3. **If agent-only is correct:** add a one-line note to `bmo/docs/DESIGN-CONSTRAINTS.md` and the QA inventory source that the OLED face is agent-driven (no dashboard control by design), so the next QA run reads it as intentional rather than missing. Pick the option that matches the `/api/oled/*` surface; default to documenting agent-only if no clean set endpoint exists.

**Cheap check:** diff review (+ `python -m pytest tests/test_face_state.py -q` if the expression endpoint is touched).

**Acceptance:** the OLED face is either controllable from Settings or explicitly documented as agent-only; no phantom-feature mismatch remains.

### 03H — Camera quick-snap residual + centralized poll backoff

**Objective:** the secondary camera-snap path surfaces failures like the main one; the global pollers back off on repeated non-2xx and don't hot-poll a down service.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. **Camera residual (F8):** at `bmo.js:2022`, wrap the quick-snap fetch in the same `res.ok` + toast pattern the main Snap already uses (`bmo.js:2796-2814`) so a 503 surfaces a brief "camera unavailable" notification instead of a silent no-op. (The primary Snap is already done — this is the one residual path.)
2. **Poll backoff (F9):** add a tiny backoff helper for the status pollers. For the music poll (`bmo.js:472`) specifically, track consecutive non-2xx and lengthen the interval (e.g. 2s → 5s → 15s → 30s cap), resetting to 2s on a 2xx — so a down `/api/music/state` (PHASE-01 returns 503) stops flooding. Implement as a small wrapper around the existing `fetchMusicState` call rather than a full scheduler rewrite.
3. **Tab-scope the hottest polls:** gate the music-state poll on `this.tab === 'music'` (plus an active now-playing strip) like the TV poll already gates on `this.tab === 'tv'` (`bmo.js:478`), so it doesn't run on every tab. Keep the change minimal and localized to the `setInterval` bodies; do **not** build a central scheduler (that's a larger refactor — log it as a future suggestion if desired).

**Cheap check:** diff review; confirm the quick-snap surfaces errors and the music poll backs off on non-2xx + is tab-scoped.

**Acceptance:** the quick-snap path shows a 503 toast; the music poll backs off on repeated errors and resets on success; the hottest poll is tab-scoped; no uncaught rejections.

## Research notes

- **Async-source timezone flash (03A):** rendering a clock with `new Date()` defaulting to the browser TZ, then re-rendering once an async event supplies the real TZ, is a guaranteed "hour jumps after load" bug on any client whose TZ differs from the target. The fix is to pin a single authoritative source *before* first paint (server-injected value, or a cached prior value) and to skip rendering rather than fall back to browser-local — so the displayed value is correct-or-absent, never wrong-then-right.
- **Explicit Enter handlers over implicit form submit (03C):** the codebase already abandoned implicit single-input form submission for the music search field (it added `@keydown.enter.prevent.stop`), which is the in-repo precedent that implicit submit is unreliable in this Alpine/layout setup; matching that pattern for Notes is the consistent, low-risk fix.
- **One-effect controls (03D):** a control that both sets an input and performs an action invites the "I tapped it to fill, then hit Start, and got two" double-action — the remedy is to make presets a pure quick-start (act, don't fill) and keep the custom builder as the only "fill then act" path, visually distinct.
- **Silent-alarm guard (03F):** alarm subsystems should cross-check "armed" against "audible" at arm/enable time; volume is user state, but an inaudible alarm is a safety-relevant surprise, so a non-blocking warning at the moment of arming is the right, minimal intervention (no auto-changing the user's volume).
- **Poll backoff (03H):** per-widget `setInterval` polls with no backoff turn a single down endpoint into a request storm (QA's 307 requests, mostly 500). Exponential backoff on non-2xx with reset on success, plus tab-scoping the hottest polls, is the standard fix; a full central scheduler is a larger refactor deliberately left out of a UX-polish round.
- **Already-handled findings (03H/F8):** the camera-view Snap already does `res.ok` + toast (`bmo.js:2796-2814`); re-implementing it would be churn. Verifying current state and doing only the residual edit matches the "ALREADY FIXED — no work" discipline in the dnd-app phase precedent.

## Test plan

- **03A–03H** — frontend JS/template; verified by diff review against the cited handlers + behavioural acceptance criteria. Any Python touched (03E timer_service, 03G face_state) runs its targeted pytest file + the `bmo-pi-pytest.yml` gate.
- **End of phase (INSTRUCTIONS.md rule 5):** push; the pytest gate + `no-new-prints`/docker/codeql guards cover any Python. No live-Pi deploy (rule 6).

## Acceptance criteria

- [ ] Clock shows one consistent, correct TZ from first paint; no hour-jump on reload/navigation.
- [ ] No recurring uninformative Places warning; real failures name their cause once; loader stays gated.
- [ ] Notes submit on Enter (explicit handler) and via the + button; field clears after add.
- [ ] Timer presets start exactly one timer without filling the custom field; preset-then-Start no longer double-creates.
- [ ] One-off alarms can be disabled/enabled (preferred) or the repeat-only design is explicitly communicated; toggle persists.
- [ ] Arming an alarm at 0% alarm/master volume warns it will be silent; no false warning above 0%.
- [ ] OLED face is controllable from Settings or documented as agent-only — no phantom feature.
- [ ] Camera quick-snap surfaces 503s; the music poll backs off on non-2xx + is tab-scoped; no uncaught rejections.
- [ ] `bmo-pi-pytest.yml` + guards green; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Backend Music/Calendar/list/monitoring 404/500 fixes** — PHASE-01.
- **Chat send watchdog, IDE terminal offline state, socket.io WS upgrade** — PHASE-02.
- **A full central polling scheduler** (vs the per-poll backoff + tab-scoping here) — larger refactor; log as a SUGGESTIONS-LOG item if it recurs.
- **Pi system TZ vs configured-location TZ reconciliation** (`America/Denver` vs Kansas/Central) — Pi/config state, owner decision (rule 6); 03A fixes the *render* bug regardless of which TZ is chosen.
- **Narrow (~375px) viewport layout verification** — QA couldn't capture it (viewport stuck at 1568px); needs a real phone-width pass, logged for a future QA run.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one entry per sub-phase as it lands.)*

### Execution log (2026-06-24)

- **03A** — `bmo.js`: seed `this.timezone` from the cached weather payload before the first `updateClock()`; `updateClock()` now returns early when TZ is unknown (correct-or-absent, no browser-local flash). Single `updateClock()` path feeds both clocks.
- **03B** — `bmo.js`: `loadPlacesAPI` `onerror` now logs one informative, once-per-session warning (`_placesWarned`) naming key/referrer/Maps-API-enabled causes; loader stays gated on `maps_api_key`. Decision (retained-and-keyed) recorded in `DESIGN-CONSTRAINTS.md`.
- **03C** — `index.html`: notes input gains `@keydown.enter.prevent.stop="addNote()"` (parity with the music field); form + button paths retained; `addNote()` already clears the field.
- **03D** — preset buttons now call `startPresetTimer(p.s, p.l)` (new `bmo.js` method) which POSTs one timer WITHOUT touching `newTimerSec/Min/Label`; the custom builder + Start path is untouched → no accidental second timer.
- **03E** — backend `set_alarm_enabled` + `Alarm.check()` already honor `enabled` for any alarm, so the On/Off toggle + enabled label now render for all alarms (`x-show="item.type === \x27alarm\x27"`); handler generalized to `toggleAlarm(item)` (`toggleRecurringAlarm` kept as a back-compat alias). A disabled one-off stays in the list and won\x27t fire until re-enabled.
- **03F** — `bmo.js` `_warnIfAlarmSilent()` (reads the already-loaded `volumeLevels.alarms`/`.system`) fires a non-blocking warning on alarm create (`createAlarmFromTime`, `createScheduledAlarm`) and on enable; never auto-changes volume.
- **03G** — a manual "Face" picker card on Settings posts the full expression vocabulary to the existing `/api/oled/expression` endpoint via `setFace()`; transient override (agent resumes on next chat turn). Resolves the phantom-control mismatch; documented in `DESIGN-CONSTRAINTS.md`.
- **03H** — `cameraSnapshot()` (quick-snap) now surfaces a 503/error toast like the main Snap; `fetchMusicState()` returns ok-ness and the music poll is a self-scheduling backoff (2s→×2→30s cap, reset on 2xx) gated on `tab===music || now-playing` so a down `/api/music/state` stops flooding.
- **Checks:** `node --check` clean on `bmo.js`+`ide.js`; `test_app_endpoints`+`test_face_state`+`test_timer_service` = 164 passed; no Python touched (JS/template/docs only); no new `print()`.
- **Out of scope (unchanged):** central polling scheduler (per-poll backoff + tab-scope done instead); Pi-system vs configured-location TZ reconciliation (owner/config); ~375px viewport pass (needs real phone-width QA).
