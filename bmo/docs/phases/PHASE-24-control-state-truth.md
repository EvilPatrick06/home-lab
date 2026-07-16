# PHASE-24 — bmo control-surface state truth (LED mode/enabled contract, TV empty-error 200s, status-summary as-of)

> Authored 2026-07-15 from `bmo/docs/phases/QA/QA-report-2026-07-15.md` (run 5, live deploy `d6699d52`, runtime identical to `e03664fa`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Three findings where a control surface **reports a state that isn't real** — the same truth line as PHASE-16/17/19:

1. **LED mode buttons desync from reality.** With LEDs physically off (`enabled:false, mode:"static"`), the UI highlights "static" as active; clicking the highlighted mode *toggles* and sends `{"mode":"off"}` — so a user looking at "static" cannot turn the LEDs on by clicking it. Worse, `POST /api/led/mode {"mode":"off"}` answers `ok:true` with `mode:"static"` (the controller keeps reporting the *retained* mode while `enabled` flips), and the client optimistically sets local mode to "off" — client and server now disagree. *(medium, bug)*
2. **TV remote keys return `200 {"error":""}` with no TV connected** — a success status for a command that reached nothing, so the UI (which only toasts non-empty errors — and `tvKey()` doesn't even look) shows zero feedback: a silent no-op. *(medium, bug)*
3. **The System Status summary card, the header pill, and the detail view tell three different stories at the same moment** (stale 82.0 °C vs live 56.2 °C; "Affected: calendar, pi resources" vs "DEGRADED: google_calendar" only) — the summary has no as-of stamp and mixes cached and live sources. *(low, bug)*

PLANNING/AUTHORING ONLY. Categories: **bug (medium ×2, low ×1)** — auto-implement per the autonomy policy. Backend (`app.py`, `hardware/led_controller.py`, `routes/tv_api.py`, `services/tv_worker.py`, `routes/system_api.py`) + frontend (`bmo.js`, `index.html`); backend pytest-coverable.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@f2300ac8` (2026-07-15). Re-anchor before editing (rule 3).
- **PHASE-16 fixed the *chat-agent* LED path** (service-key mismatch); this is the *dashboard* LED surface — different callers, same controller. Don't disturb 16's `leds` service registration.
- **PHASE-19 (pending) touches `app.py` OLED/camera routes and PHASE-20 (pending) is frontend-only** — coordinate, don't collide: 24A's `app.py` edits are the LED routes (`:1674-1730`), disjoint from 19C/19D's camera/OLED lines; 24A's `bmo.js` edit is `setLedMode` (`:3646`), disjoint from 20's header/nav/music work.
- **The report's TV-tile "no network request" claim does not match HEAD code**: `tvLaunch()` fetches unconditionally and already toasts non-OK responses (`bmo.js:3102-3123`, the QA #12 2026-05-17 fix). Either the QA capture missed it or the click landed elsewhere. 24B therefore (a) fixes the *verified* empty-error truthiness hole that affects both `/tv/key` and `/tv/launch`, and (b) adds the disabled-affordance the report asks for — which also covers whatever swallowed the tile click. Do not chase the unreproducible capture.
- **Thermal riding its limit (§9)** is environment/hardware (fan duty, PSU history) — owner item, not planned here; 24C only makes the *reporting* honest.

## Verified findings

All citations verified 2026-07-15 against `origin/master@f2300ac8`.

### F1 — LED `mode` and `enabled` are separate truths; the API echoes the retained mode after "off", and the frontend toggle assumes `mode` is the only signal

**Status: confirmed (Medium/bug).** Three cooperating defects:

**(a) Controller state model:** `set_mode("off")` sets `_user_disabled = True` but *keeps* `_custom_mode` (`bmo/pi/hardware/led_controller.py:210-231`), and `get_full_state()` derives `mode` from `_custom_mode`/state config — so it reports `mode:"static", enabled:false` after an off (`:245-266`, `enabled: not self._user_disabled` at the tail).

**(b) API contract:** `api_led_mode` returns `{"ok": True, **led_controller.get_full_state()}` (`bmo/pi/app.py:1699-1710`) — so `POST {"mode":"off"}` answers `mode:"static"`. The frontend has no way to know "off" from the response, and the socket broadcast (`led_state`) carries the same shape.

**(c) Frontend toggle:** `setLedMode(mode)` computes `target = this.ledState.mode === mode ? 'off' : mode` and on 200 sets `this.ledState.mode = target` (`bmo/pi/web/static/js/bmo.js:3646-3657`). With server mode "static" + disabled, the UI highlights "static" (looks on), the click sends "off" (can never turn on), and afterwards client says "off" while server still says "static". The mode-button highlight binds `ledState.mode` only (locate: `grep -n 'setLedMode\|ledState.mode' bmo/pi/web/templates/index.html`).

Startup log confirms the physical state: `[led] Restored state: ready, brightness=100%, disabled=True`.

```bash
sed -n '210,232p;245,267p' bmo/pi/hardware/led_controller.py
sed -n '1699,1711p' bmo/pi/app.py
sed -n '3646,3658p' bmo/pi/web/static/js/bmo.js
```

### F2 — A message-less exception in the TV worker becomes `{"error": ""}`, which every truthiness check treats as success

**Status: confirmed (Medium/bug).** The worker's catch-all:

```python
        except Exception as e:
            if "not connected" in str(e).lower() or "closed" in str(e).lower():
                self.remote = None
            return {"error": str(e)}
```

(`bmo/pi/services/tv_worker.py:155-159`.) Exception classes with empty `str(e)` (e.g. a bare `ConnectionClosed`) yield `{"error": ""}`. Downstream, `api_tv_key` does `if result.get("error"): return jsonify(result), 500` (`bmo/pi/routes/tv_api.py:478-487`) — empty string is falsy → **200** with body `{"error":""}` exactly as QA captured. `api_tv_launch` (`:490-502`) and the volume/power/mute key paths (`:515`, `:520`, `:542`, `:613`, `:622`) share the pattern. Frontend: `tvKey()` is fire-and-forget with no response inspection at all (`bmo.js:3092-3100`); `tvLaunch()` does inspect but relies on the (defeated) non-200 status. The streaming tiles (`index.html:1178-1196`) and the D-pad/remote cluster carry no disabled state while `TV not connected`.

```bash
sed -n '150,160p' bmo/pi/services/tv_worker.py
sed -n '478,502p' bmo/pi/routes/tv_api.py
sed -n '3092,3124p' bmo/pi/web/static/js/bmo.js
```

### F3 — Summary card, header pill, and detail view mix cached and live sources with no as-of stamp

**Status: confirmed (Low/bug), sources traced.** `/api/status/summary` builds its sentence from `health_checker.get_status()` (`bmo/pi/routes/system_api.py:567-640`): **service entries** (the "Affected: …" list) come from `self._service_status`, refreshed by the background loop at `check_interval` (default 60 s, `services/monitoring.py:279-284`, loop at `:406-411`) — after a service restart these can be stale or seeded until the first cycle completes; **pi stats** are fetched live (`get_pi_stats()` at `monitoring.py:2263`). Meanwhile the header pill **seeds from `localStorage`** (`bmo.js:133-138` — `localStorage.getItem('bmo_health_summary')`), so a reload resurrects the previous session's pill until the next health push. Nothing in the summary payload or the card says *when* the snapshot was taken — three surfaces, three cadences, no timestamps. (The QA's 82.0 °C-vs-56.2 °C observation matches a stale service-status snapshot + localStorage seed straddling a service restart.)

```bash
sed -n '567,585p' bmo/pi/routes/system_api.py
grep -n "bmo_health_summary" bmo/pi/web/static/js/bmo.js
sed -n '406,412p' bmo/pi/services/monitoring.py
```

## Sub-phases

> One commit at phase end. Backend steps get targeted pytest; frontend steps are diff-review + acceptance-walked (no JS harness).

### 24A — Normalize the LED mode/enabled contract end-to-end

**Objective:** one truth: the API reports `mode:"off"` whenever the LEDs are disabled; selecting a mode while off turns them on in that mode; the highlight always matches physical state.

**Files:** `bmo/pi/hardware/led_controller.py` (`get_full_state` `:245-266`), `bmo/pi/app.py` (`api_led_mode` `:1699`, only if needed), `bmo/pi/web/static/js/bmo.js` (`setLedMode` `:3646`), `bmo/pi/web/templates/index.html` (mode-button highlight binding).

**Steps:**

1. **Controller:** in `get_full_state()`, fold the disable into the reported mode: when `self._user_disabled`, return `mode: "off"` (keep a `retained_mode` field carrying the old value so the UI *may* pre-select it later; keep `enabled` for compatibility). This single change makes the API response, the socket `led_state` broadcast, and `/api/led/status` consistent — `set_mode(m≠off)` already re-enables (`:222-228`), which is the desired "click a mode while off turns them on" behavior.
2. **Frontend:** drop the client-side toggle assumption in `setLedMode`: compute `target` from the *normalized* state (`this.ledState.mode === mode ? 'off' : mode` now works, because a disabled controller reports "off"), and on success replace local state from the **response body** (`ledState = {...ledState, ...data}` minus non-state keys) instead of the optimistic `this.ledState.mode = target`. Response is truth; no more drift.
3. **Template:** verify the active-highlight binding needs no change once mode is normalized (it binds `ledState.mode`); adjust if it special-cases "off".
4. **Pytest:** controller unit tests — after `set_mode("off")`, `get_full_state()["mode"] == "off"` and `enabled is False`; after `set_mode("static")` from disabled, `mode == "static"`, `enabled is True`. Route test: `POST /api/led/mode {"mode":"off"}` response reports `mode:"off"`. Check for an existing LED test module first (`ls bmo/pi/tests | grep -i led`).

**Cheap check:** targeted pytest; browser walk — with LEDs off, "off" is highlighted; clicking "static" enables static (request body `{"mode":"static"}`).

**Acceptance:** highlight, request body, response body, and physical state agree in every combination of `enabled` × `mode`; a user can always turn LEDs on by clicking the desired mode.

### 24B — TV command errors are never empty and never 200; disconnected remote gets a disabled affordance

**Objective:** an unreachable-TV command yields a non-200 with human copy end-to-end; the remote cluster and app tiles disable (with a hint) while disconnected.

**Files:** `bmo/pi/services/tv_worker.py` (`:155-159`), `bmo/pi/routes/tv_api.py` (`api_tv_key` `:478`, `api_tv_launch` `:490`, and the shared pattern at `:515`, `:520`, `:542`, `:613`, `:622` — prefer one helper), `bmo/pi/web/static/js/bmo.js` (`tvKey` `:3092`), `bmo/pi/web/templates/index.html` (remote cluster + tiles `:1178-1196`).

**Steps:**

1. **Worker:** never return an empty error: `msg = str(e).strip() or f"TV command failed ({type(e).__name__} — TV unreachable?)"`; return `{"error": msg}`. Keep the reconnect-clearing heuristic.
2. **Routes:** replace the repeated `if result.get("error")` with a small `_tv_result_response(result)` helper that treats **the presence of the `"error"` key** (not truthiness) as failure and maps unreachable-class errors to 502 with copy "TV unreachable — is it powered on?" (pattern-match like `_tv_error_needs_pairing` does at `:177-182`). Apply to key/launch/volume/power/mute.
3. **Frontend `tvKey`:** inspect the response like `tvLaunch` already does; toast non-OK errors (reuse the pair-error toast pattern). Debounce identical toasts (a user mashing the D-pad should get one toast, not ten — simple last-toast-text+timestamp guard).
4. **Disabled affordance:** bind the remote cluster and app tiles to the existing connected flag (`tvConnected` — verify the exact state name via `grep -n 'tvConnected' bmo/pi/web/static/js/bmo.js | head`): `:disabled` + dimmed class, plus one hint line "Pair with the TV first" (mirror PHASE-19C step 3's camera pattern). Keep the Pair button enabled.
5. **Pytest:** with a stubbed `_tv_cmd` returning `{"error": ""}`-shaped (now impossible from the worker, but defend the route) and `{"error": "TV unreachable", "timeout": True}`, `POST /api/tv/key` returns non-200 with non-empty `error`; happy path unchanged (`{"ok": true}` → 200).

**Cheap check:** targeted pytest (`tests/test_tv*.py` if present, else extend the routes test module); browser walk with TV off — buttons disabled + hint; force-enable → visible error toast.

**Acceptance:** no TV command can return 200 with an error field; every failure is visible in the UI; disconnected controls look disconnected.

### 24C — As-of truth for the status summary (and stop resurrecting a stale pill)

**Objective:** every status surface either shows live data or says how old its data is; a reload doesn't revive last session's health text.

**Files:** `bmo/pi/routes/system_api.py` (`api_status_summary` `:567`), `bmo/pi/web/static/js/bmo.js` (`:133-138` seed, summary-card fetch path), `bmo/pi/web/templates/index.html` (summary card).

**Steps:**

1. **Backend:** include `as_of` (epoch) and `oldest_service_check` (min of the services' `last_check`) in the `/api/status/summary` payload; when `oldest_service_check` is older than ~2× the check interval, prefix the sentence with "(status may be stale — refreshing)". Data already exists per-service (`last_check` in `get_status`, `monitoring.py:2203-2206`).
2. **Frontend:** render a small "as of HH:MM:SS" line on the summary card from `as_of`; re-fetch the summary when the Settings tab opens (if not already — verify the fetch trigger via `grep -n 'status/summary' bmo/pi/web/static/js/bmo.js`).
3. **Pill seed:** keep the localStorage seed for *instant paint* but visually mark it provisional (e.g. dimmed) until the first live `/api/health/full` result replaces it, so a reload can't confidently assert last session's warning. Smallest viable: clear the stored value when it's older than N minutes (store `{text, ts}` instead of the bare string).
4. **Pytest:** summary payload contains `as_of`; stale-marker prefix appears when service `last_check` values are old (inject via a stubbed health checker).

**Cheap check:** targeted pytest; browser walk — summary card shows the as-of stamp; reload shows the pill dimmed until the first live update.

**Acceptance:** the three surfaces can no longer contradict each other silently — each is either live or visibly stamped/provisional.

## Test plan

- **Backend (24A steps 1/4, 24B steps 1-2/5, 24C steps 1/4):** targeted pytest per sub-phase; full sweep via `bmo-pi-pytest.yml`; `ruff check`; no new bare `print()`s.
- **Frontend:** no JS harness — diff review + acceptance walks (LED panel with hardware disabled, TV tab with TV off, Settings summary card after a restart) on the owner-run deploy (rule 6). LED hardware note: the controller unit tests run against the sim path; live-LED verification rides the owner deploy (rule 27 — implement fully regardless).

## Acceptance criteria

1. LED: highlight ⇔ request ⇔ response ⇔ physical state agree; clicking a mode while off turns the LEDs on in that mode; `POST {"mode":"off"}` reports `mode:"off"`.
2. TV: no command path returns HTTP 200 with an `error` field; unreachable-TV failures surface as toasts; disconnected controls are visibly disabled with a pairing hint.
3. Status summary carries an as-of stamp, flags stale snapshots, and the header pill can't confidently resurrect last session's state.
4. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **The thermal condition itself** (83.7 °C peaks, fan tuning, PSU "throttled since boot" flag) — hardware/owner item; only its *reporting* is touched here.
- **The unreproducible "tiles issue no network request" capture** — covered indirectly by the disabled affordance; not chased further.
- **Unifying pill/card/detail onto one push channel** — larger refactor; the as-of stamps make the seams honest first. Log as a suggestion if desired.
