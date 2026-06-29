# PHASE-12 — bmo dashboard UX correctness round (run-2)

> Authored 2026-06-29 from `bmo/docs/phases/QA/QA-report-2026-06-28-2.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Close the frontend correctness findings from the **second** 2026-06-28 QA pass (run 2, against live process `655a930f` / `origin/master@a2d87c53`), which re-drove the rendered SPA after the dashboard surface (`bmo/pi/`) changed materially since run 1. The pass's two headline findings — the chat agent being 100% down and the calendar OAuth being revoked — are **already planned** (chat = PHASE-09; calendar health/UX = PHASE-10/11; the reauth itself is an owner action) and are **not** re-planned here. This phase consolidates the **new, dashboard-side** defects run 2 surfaced that no pending phase covers:

1. a **single `/bmo` load fires nearly every bootstrap GET twice** (~36 `/api/*` requests for one load; the geolocation INFO also prints twice) because the Alpine root double-invokes `init()`;
2. the **add-event Create (and Edit Update) shows a false "Event created!"/"Event updated!" and clears the form even when the server returns a non-2xx** (e.g. the calendar-down `503`), so the user loses everything they typed on a failure outside their control;
3. tapping a **timer duration preset ignores the typed Label** (the custom Start button and alarms honor it), an inconsistency; and
4. the **TV pairing Connect/Pair buttons give no pending/disabled affordance** during the (slow) round-trip and surface a **raw developer-internal worker error string** ("Pairing failed: pair_finish failed: Called async_finish_pairing after disconnect") to the user.

This phase is **frontend only** (`bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`). The slow-pairing **backend** half (the worker round-trip has no short timeout, so the request hangs ~30s) is **PHASE-13**; this phase fixes the dashboard's affordance + error copy around it.

PLANNING/AUTHORING ONLY. No live-Pi mutation (rule 6); the executer ships the in-repo frontend and the gate is the surgical diff (the dashboard JS/HTML has no unit-test harness in this repo — PHASE-02/03/11).

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base verified against `origin/master@af795b36` (HEAD at authoring; the report tested live process `655a930f` / `origin/master@a2d87c53` — line numbers re-anchored to current HEAD, INSTRUCTIONS.md rule 3).
- **Independent of PHASE-09/10/13; touches the same handlers as a few PHASE-11 sub-phases — coordinate, don't collide:**
  - **12A (double-bootstrap) vs PHASE-11 11E.** 11E de-dupes the *symptom* (the geolocation INFO logged twice) inside the geolocation init path in `bmo.js`. 12A removes the *root cause* — the redundant `x-init="init()"` on the Alpine root in `index.html` — which makes `init()` (and therefore every bootstrap fetch **and** the geolocation log) run once. They touch **different files** (`index.html` vs `bmo.js`), so no merge conflict; once 12A lands, 11E's geolocation-log fix is moot (harmless if both land). Flag in 11E's `## Completed` if executed after 12A.
  - **12B (create/update result handling) vs PHASE-11 11C.** 11C rewords the *validation* toast (`'Fill in title and date'` → per-field) at `bmo.js:~1979` (createCalEvent) and `~2120` (updateCalEvent). 12B edits the *post-fetch result handling* in the **same two functions** but at different lines (the `await fetch(...)` + form-reset + success-toast block). Same functions → **a textual merge can conflict**; whichever lands second should re-anchor against the other's edit. Keep both edits surgical and self-contained.
- **TV pairing (12D) complements PHASE-11 11D and PHASE-13.** 11D gates *before* showing the PIN (reachability pre-flight on `/api/tv/status`); PHASE-13 makes the worker round-trip itself fail fast (short `_tv_cmd` timeout → quick 503); 12D handles the *in-flight UI* (pending/disabled Connect button) and the *error copy* (friendly message instead of the raw worker string). Disjoint concerns, same TV tab.

## Verified findings

All citations verified 2026-06-29 against `origin/master@af795b36`. The SPA logic is `bmo/pi/web/static/js/bmo.js`; the dashboard template is `bmo/pi/web/templates/index.html`.

### F1 — The Alpine root double-invokes `init()`, so every bootstrap fetch (and the geolocation log) fires twice on one load

**Status: confirmed.** The dashboard root element declares **both** `x-data="bmo()"` **and** `x-init="init()"` (`index.html:18`). Alpine **automatically calls** a component method named `init()` when `x-data` initializes; the explicit `x-init="init()"` then calls it a **second** time. `init()` (`bmo.js:417`) runs the entire bootstrap inline — `fetchMusicState`, `fetchWeather`, `fetchCalendar`, `fetchMusicDevices`, `fetchMusicHistory`, `fetchMostPlayed`, `fetchTimers`, `fetchNotes`, `fetchTvStatus`, `loadChatHistory`, `fetchPlayers`, plus `_geolocationAllowed()`/the geolocation init that logs "[bmo] Geolocation disabled by Permissions-Policy …" (`bmo.js:571`) — so each runs twice, matching the report's "~36 `/api/*` requests for one load" and "[bmo] Geolocation … printed 2x per cycle". (The socket `connect` handler is **not** the cause: it only re-runs `fetchTimers()`, `bmo.js:700-703`.)

```bash
sed -n '18p'        bmo/pi/web/templates/index.html           # x-data="bmo()" x-init="init()" — double init
sed -n '417,505p'   bmo/pi/web/static/js/bmo.js               # init(): the inline bootstrap fetch set
sed -n '560,572p'   bmo/pi/web/static/js/bmo.js               # geolocation INFO log (runs once per init())
sed -n '699,704p'   bmo/pi/web/static/js/bmo.js               # socket connect handler — only fetchTimers(), NOT the cause
```

### F2 — `createCalEvent`/`updateCalEvent` ignore the HTTP status: a non-2xx still shows success and clears the form

**Status: confirmed.** `createCalEvent` does `await fetch('/api/calendar/create', …)` (`bmo.js:2024`) and then **unconditionally** — with no `res.ok` check — sets `showEventForm = false`, resets `this.newEvent = { summary:'', date:'', … }` (`bmo.js:2029-2036`), calls `fetchCalendar()`, and shows `'Event created!'` (`bmo.js:2037-2038`). The `catch` only fires on a network throw, **not** on a resolved `503`. So when the calendar is down (`/api/calendar/create` → `503`, observed in run 2) the user sees a **false "Event created!"** and the form is wiped — they lose the title/date/time/recurrence they typed for a failure outside their control. `updateCalEvent` has the identical defect: `await fetch('/api/calendar/update/${e.id}', …)` (`bmo.js:2148`) then unconditionally clears `editingEvent` + shows `'Event updated!'` (`bmo.js:2154-2156`). The correct in-repo pattern already exists — `setFace` and `tvLaunch` both do `if (!res.ok) { showNotification(error,'error'); return; }` (`bmo.js:~2174`, `~2960`) before claiming success.

```bash
sed -n '1976,2039p' bmo/pi/web/static/js/bmo.js               # createCalEvent: fetch, then unconditional reset + 'Event created!'
sed -n '2143,2160p' bmo/pi/web/static/js/bmo.js               # updateCalEvent: same — unconditional clear + 'Event updated!'
sed -n '2168,2180p' bmo/pi/web/static/js/bmo.js               # setFace: the if(!res.ok) success-gate pattern to mirror
```

### F3 — Tapping a timer duration preset ignores the typed Label (custom Start + alarms honor it)

**Status: confirmed (intentional decoupling, now too aggressive).** The preset buttons call `startPresetTimer(p.s, p.l)` (`index.html:1261`) with a hardcoded preset label; `startPresetTimer(seconds, label)` (`bmo.js:2298`) deliberately does **not** read the custom Label field — its 03D comment explains it avoids the custom `newTimerSec/Min/Label` fields "so a later Start can't reuse a lingering preset value and create an accidental second timer." But the custom Start button (`createTimer()`, `bmo.js:2273`) **does** read `this.newTimerLabel` (`bmo.js:2276`, cleared at `:2282`), and alarms honor their label too — so with a label typed, tapping a preset starts a timer named by duration and silently drops the label. The 03D guard is specifically about the **duration** fields; reading only the **label** does not reintroduce the accidental-duration-reuse it guards against.

```bash
sed -n '1259,1277p' bmo/pi/web/templates/index.html           # preset button startPresetTimer(p.s,p.l); newTimerLabel input; createTimer()
sed -n '2273,2308p' bmo/pi/web/static/js/bmo.js               # createTimer (reads newTimerLabel) vs startPresetTimer (03D: ignores it)
```

### F4 — TV pairing: no pending affordance on Connect/Pair, and a raw worker error string is shown to the user

**Status: confirmed.** The PIN screen's **Connect** button is `<button @click="tvFinishPairing()" …>Connect</button>` (`index.html:1237`) with **no `:disabled` and no spinner**, and the initial **Pair with TV** button (`index.html:1225`) likewise has none — so during the (slow, see PHASE-13) `/pair/start` and `/pair/finish` round-trips the buttons look inert and the screen reads as frozen. On failure, `tvFinishPairing` shows `'Pairing failed: ' + data.error` (`bmo.js:2936`) and `tvStartPairing` shows `'Pairing failed: ' + data.error` (`bmo.js:2915`) — passing the **raw** worker error straight through, which is how the user saw "Pairing failed: pair_finish failed: Called async_finish_pairing after disconnect", an internal coroutine/state-machine string. The good pattern is again `tvLaunch` (`bmo.js:~2950`), which maps non-OK responses to friendly copy.

```bash
sed -n '1222,1239p' bmo/pi/web/templates/index.html           # PIN screen: Pair / Cancel / Connect — no :disabled / spinner
sed -n '2908,2947p' bmo/pi/web/static/js/bmo.js               # tvStartPairing / tvFinishPairing — raw 'Pairing failed: '+data.error
```

## Sub-phases

> The dashboard JS/HTML has no unit-test harness in this repo (PHASE-02/03/11) — keep each edit surgical and self-contained, and verify by reading the diff against the cited handlers. No bare `print()` applies to Python only; there is no Python in this phase. Run nothing heavier than a read of the diff (rule 5).

### 12A — Eliminate the home-mount double bootstrap (single `init()` per load)

**Objective:** one `/bmo` load issues each bootstrap GET once (not twice) and logs the geolocation INFO once.

**Files:** `bmo/pi/web/templates/index.html`.

**Steps:**

1. Remove the redundant `x-init="init()"` from the dashboard root (`index.html:18`), leaving `x-data="bmo()"`. Alpine auto-invokes the component's `init()` method on `x-data` initialization, so the explicit `x-init` is the second, duplicate call. Do **not** rename `init()` or move its body — the auto-invoke covers it.
2. Confirm no other element relies on that root `x-init` for a side effect other than `init()` (it is exactly `init()`); the tab-scoped `x-init="$watch(...)"` blocks at `index.html:945,1011,1076,1380` are unrelated and stay.

**Cheap check:** read the diff; confirm the root is now `x-data="bmo()"` with no `x-init`, and that `init()` is still defined (`bmo.js:417`) so Alpine's auto-init runs it once.

**Acceptance:** a single load issues each `/api/*` bootstrap GET once (~18, not ~36); the geolocation INFO logs once; all home/cards/data still populate on first paint.

### 12B — Calendar create/update: gate success + form-reset on `res.ok`, keep input on failure

**Objective:** a failed create/update keeps the form populated and shows a clear error; only a 2xx clears the form and shows "Event created!/updated!".

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In `createCalEvent` (`bmo.js:2024`), capture the response (`const res = await fetch('/api/calendar/create', …)`) and branch on `res.ok`: on **success** keep the existing behavior (close form, reset `this.newEvent`, `fetchCalendar()`, "Event created!"); on **failure** do **not** reset/close — show an error toast (prefer the server message if present: try `const d = await res.json(); d.error` else a generic "Couldn't create event — calendar may be disconnected"), and leave `showEventForm` open with `this.newEvent` intact so the user can retry after reconnecting. Mirror the `setFace`/`tvLaunch` `if (!res.ok) { … return; }` shape (`bmo.js:~2174`).
2. Apply the identical change to `updateCalEvent` (`bmo.js:2148`): only clear `editingEvent` + show "Event updated!" on `res.ok`; on failure keep `editEvent`/`editingEvent` and show the error.
3. Keep the existing pre-flight validation (12-line block before the fetch) and the `catch` (network throw) path unchanged — this only adds the resolved-but-non-2xx branch.

**Cheap check:** read the diff; confirm both functions reset/announce success **only** under `res.ok`, and that a non-2xx keeps the form populated + shows an error.

**Acceptance:** with the calendar down, Create/Update shows an error and the form retains its inputs (no false "Event created!/updated!", no field loss); with a healthy calendar the success path is unchanged.

### 12C — Timer preset adopts the typed Label (without reusing the duration fields)

**Objective:** tapping a duration preset with a label typed starts a timer with that label; the 03D guard against accidental duration reuse is preserved.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In `startPresetTimer(seconds, label)` (`bmo.js:2298`), prefer the user's typed label: use `const finalLabel = (this.newTimerLabel && this.newTimerLabel.trim()) || label || \`${seconds}s timer\`;` and send `finalLabel`. Read **only** `newTimerLabel` — do **not** touch `newTimerMin`/`newTimerSec` (that is exactly what 03D guards against). Update the 03D comment to note the label is now honored while the duration fields are still untouched.
2. After a successful preset start, clear `this.newTimerLabel` (as `createTimer` does at `bmo.js:2282`) so the next preset/custom start doesn't silently reuse a stale label.

**Cheap check:** read the diff; confirm the preset path reads `newTimerLabel`, leaves `newTimerMin/Sec` untouched, and clears the label after.

**Acceptance:** typing a label then tapping a preset starts a timer with that label; with no label typed, the preset still names by duration; no accidental second timer / duration reuse.

### 12D — TV pairing: pending/disabled affordance + friendly error copy

**Objective:** the Connect/Pair buttons show an immediate pending/disabled state during the round-trip, and pairing failures show plain-language copy instead of the raw worker string.

**Files:** `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html`.

**Steps:**

1. Add a component flag (e.g. `tvPairBusy: false`) near the other TV state (`tvPairing`, `tvPairPin`, `bmo.js:293-294`). Set it `true` at the top of `tvStartPairing` and `tvFinishPairing` and reset it in a `finally` so it always clears.
2. In `index.html`, bind it on both buttons: `:disabled="tvPairBusy"` + a disabled style + an inline spinner / "Connecting…" label on the **Connect** button (`index.html:1237`) and the **Pair with TV** button (`index.html:1225`), so the slow round-trip (PHASE-13) reads as in-progress, not frozen.
3. Map worker error strings to friendly copy before surfacing: in `tvFinishPairing` (`bmo.js:2936`) and `tvStartPairing` (`bmo.js:2915`), replace `'Pairing failed: ' + data.error` with a small mapper — e.g. anything containing "disconnect"/"after disconnect" → "Couldn't pair — the TV disconnected. Make sure it's on and try again."; an "unreachable"/timeout signal (the 503 PHASE-13 will return) → "Can't reach the TV — make sure it's powered on and on the same network."; otherwise a generic "Couldn't pair with the TV — please try again." Keep `data.error` only in a `console.warn` for debugging, not in the toast.

**Cheap check:** read the diff; confirm the buttons disable during the round-trip and that no raw worker string reaches `showNotification`.

**Acceptance:** Pair/Connect show an immediate pending/disabled state; a pairing failure shows plain-language copy (never "Called async_finish_pairing after disconnect"); a successful pair is unchanged.

## Research notes

- **`x-data` auto-runs `init()` — adding `x-init="init()"` is the canonical Alpine double-init bug (12A).** Alpine treats a `init()` method on the data object as a lifecycle hook and calls it automatically; an explicit `x-init="init()"` is a second call. The one-line fix (drop the redundant `x-init`) is lower-risk than guarding/debouncing each fetch and fixes the geolocation double-log (PHASE-11 11E's symptom) at the root.
- **A resolved fetch is not a successful fetch (12B).** `await fetch()` rejects only on a network failure; a `503`/`4xx` resolves normally, so success/cleanup must gate on `res.ok`. Announcing success and wiping the form on a non-2xx is both a false signal and data loss; the repo already models the right shape in `setFace`/`tvLaunch`.
- **Honor the user's input where it's unambiguous (12C).** 03D correctly decoupled the preset from the duration fields to prevent accidental second timers, but over-reached by also dropping the label; reading only the label restores the expected behavior without reopening the duration-reuse hole.
- **Slow/failed flows need an affordance and human-readable errors (12D).** A button with no pending state during a multi-second call reads as frozen; a raw coroutine error erodes trust. The fix is the same surface PHASE-11 11D / PHASE-13 harden from the other side — together the pairing flow becomes legible end-to-end.

## Test plan

- **12A/12B/12C/12D** — frontend: surgical diffs reviewed against the cited handlers (no JS unit harness in repo, per PHASE-02/03/11). Manual confirmation belongs to the post-merge owner deploy (rule 6), not the executer.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + the no-new-prints / docker / codeql guards are the gate (this phase adds no Python, so the suite is unaffected). No live-Pi mutation (rule 6).

## Acceptance criteria

- [ ] A single `/bmo` load issues each bootstrap GET once and logs the geolocation INFO once (no double bootstrap).
- [ ] Calendar Create/Update keeps the form populated and shows an error on a non-2xx; success path (clear + "Event created!/updated!") fires only on `res.ok`.
- [ ] Tapping a timer preset with a label typed starts a timer with that label; the duration fields are untouched and no accidental second timer occurs.
- [ ] The TV Pair/Connect buttons show a pending/disabled state during the round-trip and pairing failures show plain-language copy (no raw worker string).
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **The TV pairing backend hang (`_tv_cmd` has no short read timeout, so `/pair/*` blocks ~30s)** — PHASE-13 (this phase only fixes the dashboard affordance + error copy around it).
- **Chat agent** — PHASE-09. **Calendar health-signal truth + notification-feed data** — PHASE-10. **Header badge deep-link, Cal-tab needs_auth state, per-field add-event validation wording, TV reachability pre-flight, Places/geolocation console hygiene, README IDE reference** — PHASE-11 (12A/12B coordinate with 11E/11C per "Dependencies & cross-phase notes"). **IDE terminal working-copy split, IDE terminal initial-prompt, SERVICES.md/bmo-ide.service doc truth** — PHASE-13.
- **The calendar reauth itself / moving the Google OAuth app to Production** — owner action, live-Pi data (rule 6).

## Completed

Implemented 2026-06-29 against `origin/master@d9dccc65` (re-anchored from the authoring base per INSTRUCTIONS.md rule 3). Frontend-only; no Python touched, so `bmo-pi-pytest.yml` is unaffected and the gate is the surgical diff (no JS unit harness — PHASE-02/03/11).

- **12A** — Removed the redundant `x-init="init()"` from the dashboard root (`web/templates/index.html:18`); Alpine auto-invokes `init()` on `x-data` init, so each bootstrap GET (and the geolocation INFO) now fires once. Supersedes PHASE-11 11E's geolocation double-log symptom fix at the root (different file, no conflict).
- **12B** — `createCalEvent` / `updateCalEvent` (`web/static/js/bmo.js`) now capture the response and gate the success path (form-reset/close + "Event created!/updated!") on `res.ok`; a resolved non-2xx (e.g. calendar-down 503) shows an error toast (server `error` if present) and leaves the form populated. Mirrors the `setFace`/`tvLaunch` `if (!res.ok)` pattern. Pre-flight validation + network `catch` unchanged.
- **12C** — `startPresetTimer` (`web/static/js/bmo.js`) now honors a typed Label via `finalLabel = (newTimerLabel.trim()) || label || (seconds + "s timer")`, reading ONLY `newTimerLabel` (the 03D duration-field guard preserved), and clears `newTimerLabel` after start.
- **12D** — Added `tvPairBusy` state (`web/static/js/bmo.js`) set at the top of `tvStartPairing`/`tvFinishPairing` and reset in `finally`; bound `:disabled="tvPairBusy"` + a "Connecting…" label and `disabled:` styles on the Pair-with-TV and Connect buttons (`web/templates/index.html`). Added `_tvPairErrorCopy(rawError, status)` mapping worker/503 errors to plain-language copy (disconnect / unreachable / generic), keeping the raw string in `console.warn` only — no raw worker string reaches `showNotification`. Consumes the 503 PHASE-13 13A returns.

Verification: `node --check web/static/js/bmo.js` passes; diff reviewed against the cited handlers; `tvPairBusy` referenced 5x in bmo.js / 4x in index.html.
