# PHASE-05 — bmo calendar token persistence & health truth

> Authored 2026-06-25 from `bmo/docs/phases/QA/QA-report-2026-06-24-2.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the three Google-Calendar findings from the second QA pass, which share one underlying defect: **a refreshed OAuth access token is not persisted to disk, so the health monitor (which reads the token file) believes the calendar is dead while the live read path keeps serving events.** Concretely: (1) the header shows `BMO ⚠ calendar` and the monitor logs CRITICAL `Calendar token expired and auto-refresh is not happening — run reauth_calendar.py`, yet (2) the **System Status card says "Critical — Google Calendar is down" while the REST endpoints return 26 real events** (`/events`, `/today`, `/next` all 200 with a live ongoing event) — a direct contradiction; and (3) editing a Google **birthday** event raises an uncaught `HttpError 400 (eventTypeRestriction)`.

The connective tissue for (1) and (2): `CalendarService` builds and **caches** a `googleapiclient` service object (`_get_service`, `calendar_service.py:97-146`). The Google client auto-refreshes the *access* token in memory on each request, so live reads keep working — but the refreshed token is written back to `token.json` **only** inside `_get_service` when a *new* client is built (`creds.refresh()` → `_write_token_json`, `calendar_service.py:124-125`), which doesn't happen while the cached client is reused. The monitor (`monitoring.py:1491-1620`) reads `token.json`'s on-disk `expiry` field, sees it still in the past, and after a 10-minute grace escalates to CRITICAL — then its **circuit breaker** (`_circuit_open`, `monitoring.py:317`) pins that "down" status during the backoff window. So the monitor reports down from a stale file while the live client serves fresh data. Finding (3) is independent: `update_event` issues `events().update()` on any event without checking its `eventType`, and Google forbids editing auto-generated `birthday` events.

This phase is **server-side Python** (`bmo/pi/services/calendar_service.py`, `bmo/pi/services/monitoring.py`, pytest). The frontend already has a one-click reauth path (`/api/calendar/auth/url?mode=auto` → `finishCalendarAuthSuccess`, `bmo.js:1839+`), so no dashboard work is needed for the reauth surface.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@53163f4b`. Builds on PHASE-01 01C (the `_with_service_retry` rebuild-once wrapper, `calendar_service.py:148-159`, already merged) — this phase adds **token persistence on refresh** and **health-signal reconciliation**, which 01C did not cover.
- **Independent of PHASE-04 (realtime) and PHASE-06 (UX/hygiene).** Disjoint files; any order.
- **Operational vs code (rule 6):** if the stored **refresh token** is genuinely revoked (`invalid_grant`), only a human reauth fixes it — that is correctly surfaced today (the existing "Authorize Calendar" one-click flow). This phase makes the *common* case (a live refresh token whose refreshed access token simply wasn't persisted) stop producing a false CRITICAL, and makes the health signal tell the truth in both cases. The executer does **not** run `reauth_calendar.py` or touch live `token.json` (live-Pi data, rule 6).

## Verified findings

All citations verified 2026-06-25 against `origin/master@53163f4b`. `bmo/pi/services/calendar_service.py` is **367 lines**; the monitor is `bmo/pi/services/monitoring.py`. Confirmed on the live Pi (read-only): only `bmo/pi/config/token.json` exists (mtime 2026-06-24 16:06) and `bmo/pi/services/config/token.json` is absent — so calendar_service and the monitor read the **same** file (no path mismatch; see F2).

### F1 — Refreshed access token is not persisted, so the on-disk `expiry` stays stale

**Status: confirmed.** `_get_service` (`calendar_service.py:97-146`) returns the cached `self._service` immediately when set (`:98-99`). It only refreshes-and-writes when *building* a client: `creds.refresh(Request())` then `_write_token_json(creds.to_json())` (`:124-125`). The `googleapiclient` `Credentials` object auto-refreshes the access token in memory on subsequent API calls (that's why live reads keep succeeding), but those in-memory refreshes are **never written back** to `token.json` — the write only happens on a cold rebuild. `_write_token_json` targets `TOKEN_PATH` (`bmo/pi/config/token.json`, `calendar_service.py:79-85`). So the file's `expiry` reflects the *last cold build*, not the live in-memory token, and drifts into the past while the service is healthy.

```bash
sed -n '97,146p' bmo/pi/services/calendar_service.py   # cached _service; refresh+write only on cold build
sed -n '79,85p' bmo/pi/services/calendar_service.py     # _write_token_json → bmo/pi/config/token.json
```

### F2 — The monitor reports "down" from the stale file (+ circuit breaker pins it) while live reads succeed

**Status: confirmed.** `_check_calendar_token` (`monitoring.py:1491-1620`) reads `token.json`, parses `expiry`, and when `exp_dt < now` with a refresh token present, waits a 10-minute grace then sets status `down` and emits CRITICAL `Calendar token expired and auto-refresh is not happening — run reauth_calendar.py` (`monitoring.py:1568-1607` region). Because of F1 the file's `expiry` is stale-expired even though the live client refreshed in memory, so this fires falsely. The read endpoints, by contrast, are **live**: `/events`→`get_upcoming_events` (`calendar_api.py:60`), `/today`→`get_today_events`, `/next`→`get_next_event` all run through `_with_service_retry` against the cached client (`calendar_service.py:162-205`), so they return real data. Compounding it, `_circuit_open("google_calendar", …)` (`monitoring.py:317,1501`) short-circuits re-checks during the backoff window, so once "down" is latched it stays visible on the header badge + System Status card even after the token is fine. Result: the card says "down" while 26 events load — QA's exact contradiction.

```bash
sed -n '1491,1620p' bmo/pi/services/monitoring.py       # disk-expiry check → CRITICAL; 10-min grace
sed -n '317,330p' bmo/pi/services/monitoring.py          # _circuit_open latches the stale status
sed -n '50,90p' bmo/pi/routes/calendar_api.py            # /events,/today,/next are LIVE reads
```

### F3 — Editing a Google "birthday" event raises an uncaught HttpError 400 (no eventType guard)

**Status: confirmed.** `update_event` (`calendar_service.py:232-253`) does `events().get(...)` then `events().update(..., body=event)` with **no check of `event["eventType"]`**. Google rejects edits to auto-generated `birthday` (and other read-only) event types with `HttpError 400 … "Attempt made to modify birthday event in a way that is not valid for this event type." (eventTypeRestriction)`. The exception is not caught here, so it propagates (the route maps a generic 500). The same applies to `delete_event` for some read-only types.

```bash
sed -n '232,263p' bmo/pi/services/calendar_service.py   # update_event: no eventType guard before update()
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the `no-new-prints` guard) — note `calendar_service.py` already has pre-existing `print()`s (e.g. `:297`); do not add more, prefer the logger for any new line.

### 05A — Persist credentials whenever they refresh (kill the stale-`expiry` drift)

**Objective:** the on-disk `token.json` always reflects the live access token, so the monitor (and any reader) sees an accurate `expiry`; the cached client is periodically re-validated so a refresh actually fires before the file looks dead.

**Files:** `bmo/pi/services/calendar_service.py`, `bmo/pi/tests/test_calendar_service.py`.

**Steps:**

1. Persist on every refresh, not just on cold build. The robust hook is to write the token back whenever the `Credentials` object refreshes. Two compatible options — implement the first; the second is the belt:
   - **(a) After any successful API call through the retry wrapper, persist if the token string changed.** In `_with_service_retry` (`calendar_service.py:148-159`), capture `before = getattr(self._creds, "token", None)` and after the call, if `self._creds` exists and `self._creds.token != before`, call `_write_token_json(self._creds.to_json())`. Store the creds on `self._creds` in `_get_service` (set `self._creds = creds` just before `build(...)` at `:145`) so the wrapper can see them.
   - **(b) Re-validate the cached client opportunistically.** In `_get_service`, when returning the cached `self._service` (`:98-99`), if `self._creds` is present and `self._creds.expired and self._creds.refresh_token`, refresh + `_write_token_json` before returning. This guarantees a stale cached client refreshes-and-persists on the next use rather than waiting for an error to trigger a rebuild.
2. Keep the existing cold-build refresh (`:121-145`) and the `invalid_grant`/`invalid_scope` → `RuntimeError` mapping (`:126-135`) unchanged — a truly revoked refresh token must still surface as the actionable reauth `RuntimeError`.
3. Extend `tests/test_calendar_service.py`: a fake `Credentials` whose `token` changes after `refresh()`; assert that a read through `_with_service_retry` triggers a `_write_token_json` with the new token (spy/monkeypatch the writer to a tmp path); assert no write when the token is unchanged; assert a cached-but-expired creds path refreshes+persists on next `_get_service`. Keep `TOKEN_PATH` pointed at `tmp_path` (never the real file).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_calendar_service.py -q && ruff check services/calendar_service.py`.

**Acceptance:** a refresh (cold or in-flight) writes the new token to disk; a revoked refresh token still raises the reauth `RuntimeError`; the on-disk `expiry` tracks the live token.

### 05B — Guard read-only Google event types (no uncaught birthday 400)

**Objective:** editing/deleting a non-editable Google event type returns a clean, handled result instead of raising HttpError 400.

**Files:** `bmo/pi/services/calendar_service.py`, `bmo/pi/routes/calendar_api.py`, `bmo/pi/tests/test_calendar_service.py`.

**Steps:**

1. In `update_event`'s inner `_do` (`calendar_service.py:234-250`), after the `events().get(...)`, check the fetched `event.get("eventType")`. For non-editable types (`{"birthday", "fromGmail", "workingLocation", "outOfOffice", "focusTime"}`) raise a typed, handled error rather than calling `update()` — e.g. `raise CalendarReadOnlyEventError(event_type)` (define a small exception in the module). This converts Google's 400 into an intentional, catchable signal.
2. Wrap the Google API call defensively too: catch `googleapiclient.errors.HttpError` with status 400 + `eventTypeRestriction`/`birthday` in the body and re-raise as the same typed error, so an unknown read-only type Google adds later is still handled (don't rely solely on the allowlist).
3. In `calendar_api.py`, the `/update/<event_id>` route (`:114-133`) maps `CalendarReadOnlyEventError` to a clean `409`/`422` JSON (`{"error": "This event type can't be edited (e.g. a Google birthday event)."}`) instead of a 500; keep `RuntimeError → 503` (not authorized). Apply the same guard to `delete_event`/`/delete` if a read-only type also rejects deletes.
4. Tests: a fake service whose `events().get()` returns `{"eventType": "birthday", ...}`; assert `update_event` raises `CalendarReadOnlyEventError` and never calls `update()`; assert the route returns the handled 4xx JSON, not 500; assert a normal `eventType: "default"` event still updates.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_calendar_service.py -q && ruff check services/calendar_service.py routes/calendar_api.py`.

**Acceptance:** updating a birthday (or other read-only) event returns a clean handled response with a clear message; normal events still update; no uncaught HttpError 400.

### 05C — Reconcile the calendar health signal with the live read path

**Objective:** the monitor's calendar status reflects whether the calendar actually works, so the header badge / System Status card stop saying "down" while reads succeed — and clear promptly once healthy.

**Files:** `bmo/pi/services/monitoring.py`, `bmo/pi/tests/` (the monitoring test, e.g. `test_monitoring.py` if present; else add a focused one).

**Steps:**

1. Make the calendar check trust a recent **live read** over the on-disk `expiry` heuristic. Lowest-risk approach: before escalating to CRITICAL on a stale-`expiry` file, attempt a cheap liveness probe via the live service — if `CalendarService.get_next_event()` (or a `get_cached_events()` freshness timestamp from `_refresh_cache`, `calendar_service.py:290`) succeeds within the poll window, treat the calendar as `ok`/`degraded`, not `down`. Reading the live service is what `auth/status` already does (`calendar_api.py:361-378`), so this aligns the monitor with the existing truth source. Guard the probe so a probe failure doesn't itself throw inside the monitor.
2. With 05A persisting refreshes, the disk `expiry` will normally be fresh; keep the existing on-disk checks as a *fallback* signal but demote a stale-`expiry`-but-live-read to a non-CRITICAL state (e.g. `degraded` "token persistence lagging" rather than `down`). Only emit the actionable CRITICAL `run reauth` when the live probe **also** fails (i.e. the refresh token is genuinely dead).
3. Ensure the status **clears**: when a check (or the live probe) succeeds, reset `_calendar_expired_since` and close the circuit so a stale `down` doesn't linger on the card (`_circuit_open` / the `finally` that feeds it, `monitoring.py:1501` + the breaker bookkeeping). Confirm a success path resets the breaker counter for `google_calendar`.
4. Tests: simulate stale-`expiry` file + a live probe that succeeds → status `ok`/`degraded`, **no** CRITICAL; stale file + probe fails → CRITICAL `run reauth`; a prior `down` followed by a success → status clears and the circuit closes.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_monitoring.py -q && ruff check services/monitoring.py` (substitute the actual monitoring test filename).

**Acceptance:** the calendar health status matches reality (no "down" while live reads succeed); a genuinely revoked token still escalates to the actionable reauth CRITICAL; a recovered token clears the status and the circuit.

## Research notes

- **Persist-on-refresh is the canonical OAuth-desktop pattern (05A):** Google's `Credentials` refreshes the access token in memory transparently, but the application owns persistence — the standard idiom is to write `creds.to_json()` back whenever `creds.token` changes (often via a refresh callback), not only when constructing the client. Without it, any external reader of the token file (here, the health monitor) sees a phantom-expired token while the running process is perfectly healthy.
- **Health checks must probe the real dependency (05C):** inferring "calendar is down" from a file's timestamp is a proxy that diverges from reality the moment persistence lags; a check that performs (or reuses) a real, cheap read is authoritative. Pair that with a circuit breaker that *clears on success* so a transient blip doesn't latch a permanent red. This is the "reconcile the health signal with the read path" the QA asked for, and the "auto-diagnose to the responsible mechanism" rule (INSTRUCTIONS.md rule 28).
- **Allowlist + exception-catch for read-only types (05B):** Google has several non-editable auto-generated event types (`birthday`, `fromGmail`, `workingLocation`, …) and may add more; guarding by a known allowlist *and* catching the `eventTypeRestriction` 400 makes the code correct today and resilient to new types, converting a 500 into a clear user-facing "can't edit this event type".

## Test plan

- **05A** — `tests/test_calendar_service.py`: refresh-persists, no-write-when-unchanged, cached-expired refresh+persist, revoked→RuntimeError.
- **05B** — `tests/test_calendar_service.py`: birthday/read-only → typed error, no `update()`; route → handled 4xx; normal event updates.
- **05C** — the monitoring test: stale-file+live-ok → not down; stale-file+probe-fail → CRITICAL reauth; recovery clears status + circuit.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + guards are the gate. No live-Pi deploy / no `reauth_calendar.py` / no `token.json` mutation (rule 6).

## Acceptance criteria

- [ ] A refreshed access token is persisted to `token.json` (cold or in-flight); a revoked refresh token still raises the actionable reauth `RuntimeError`; on-disk `expiry` tracks the live token.
- [ ] Editing a birthday/read-only Google event returns a clean handled 4xx (not an uncaught HttpError 400); normal events still update.
- [ ] The calendar health status matches the live read path — no "Critical/down" while `/events`/`/today`/`/next` succeed; a genuinely dead token still escalates to reauth CRITICAL; recovery clears the status + circuit.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Running `reauth_calendar.py` / editing live `token.json`** — owner action, live-Pi data (rule 6). This phase makes the false alarm stop and the true alarm honest; a genuinely revoked token still needs the owner's one-click reauth.
- **Dashboard reauth UX** — already exists (`/api/calendar/auth/url?mode=auto` → `finishCalendarAuthSuccess`, `bmo.js:1839+`); no change needed.
- **Calendar create/edit/delete from the UI as a feature** — out of QA scope (would write the real calendar); 05B only hardens the existing update/delete service paths.
- **Realtime (chat/IDE) auth** — PHASE-04. **List/geolocation/Places/voice-canary** — PHASE-06.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one entry per sub-phase as it lands.)*
