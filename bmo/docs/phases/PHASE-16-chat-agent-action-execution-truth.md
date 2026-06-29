# PHASE-16 — bmo chat-agent action-execution truth

> Authored 2026-06-29 from `bmo/docs/phases/QA/QA-report-2026-06-29.md` (run 1, live process `605e712f`) and `bmo/docs/phases/QA/QA-report-2026-06-29-2.md` (run 2, live process `7a266d22`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Make the bmo chat agent **tell the truth about real-world actions** it performs from the Chat tab (and the voice path). Both 2026-06-29 QA passes' headline **High** findings are the same trust failure with three independent root causes, all in the agent's command-execution layer:

1. **Chat-driven LED control is dead** — every `led_set_color` / `led_set_mode` / `led_set_brightness` / `led_get_state` handler resolves the controller with `self.services.get("led_controller")`, but `app.py` only ever registers the live controller as `service_map["leds"]`. The lookup misses, the handler returns the string `"LED controller not available"`, and nothing reaches the LEDs — while the dashboard's own `/api/led/*` panel works (it talks to the global object directly).
2. **Failed control commands are reported to the user as success** — `_execute_command` marks any handler that *returns a value without raising* as `success: True`, so the `"LED controller not available"` error **string** is recorded as a success; and non-informational command results (LED/alarm/TV control) are never folded back into the spoken/displayed reply, so the LLM's optimistic "Done — your lights are blue" prose is the only thing the user sees. The user is told a real-world action happened when it did not.
3. **`TimerService.create_alarm` crashes on its timezone fallback** — `tz_name = _normalize_timezone(timezone_name) or datetime.datetime.now().astimezone().tzinfo.key` dereferences `.key` on a fixed-offset `datetime.timezone`, which has no such attribute, so the line raises `AttributeError` for any caller that reaches it without a resolvable tz. The intended `if not tz_name:` default-guard on the next line is unreachable dead code.

This phase fixes all three: align the LED service key end-to-end, make `_execute_command` derive success from an explicit handler outcome (so an error string can't be a success) and surface control-command failures in the reply, and replace the `.key` fallback with the safe default constant the rest of the module already uses.

PLANNING/AUTHORING ONLY. The executer does **not** restart the live Pi or deploy (INSTRUCTIONS.md rule 6) — the change rides `bmo-pi-pytest.yml` + the no-new-prints / docker / codeql guards; physical-LED actuation is confirmed by the owner-run deploy, the code path by pytest.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@937f89f7` (HEAD at authoring). The reports drove live `605e712f` (run 1) and `7a266d22` (run 2) over the Pi loopback; all line numbers below are re-anchored to current HEAD per INSTRUCTIONS.md rule 3 — re-run the cited commands before editing.
- **Extends PHASE-09 (chat-agent module init).** PHASE-09 fixed the agent being `None` / `/api/chat` 500 and swept seed/probe rows; it did **not** touch command-result wiring. This phase is the next layer down: the agent now runs, routes, and replies — but its *command results* lie. Disjoint code regions (PHASE-09 = module bootstrap / `sys.modules` alias / `chat_history`; this phase = `_execute_command`, the LED handlers, `INFORMATIONAL_ACTIONS`, `timer_service.create_alarm`).
- **16A coordinates with `smart_home_agent`.** `bmo/pi/agents/smart_home_agent.py:52` already declares `services=["smart_home", "tv", "led_controller"]` — i.e. the **declared, intended** key is `led_controller`. So 16A aligns `app.py` to the agents' expectation (register under `led_controller`, keep `leds` as a back-compat alias) rather than rewriting four handlers and the agent's service declaration; either direction closes the bug, this one matches the larger declared contract.
- **16C is the same `create_alarm` defect both runs flagged.** Run 1 reported "setting an alarm via chat always fails" (top #2) at `605e712f`; run 2 re-checked and found it **partially mitigated** — the dashboard (`/api/alarms/create`) and dashboard-chat paths now pass a default Pi tz, so the dashboard alarm flow succeeds — but the **latent crash remains** for any caller that reaches `create_alarm` without a resolvable tz (an empty string, a bad name, or a future/voice caller). This phase removes the latent crash regardless of caller, so the fix is caller-independent.
- **Live-Pi boundary (rule 6):** no `systemctl`, no deploy, no live LED toggle on the device, no editing `pi/.env`. The fix is verified by pytest (a unit test that the agent fetches the controller; a `create_alarm` tz-fallback test; a command-result-truth test) + diff. Real-process LED actuation happens when the owner / `bmo-deploy.yml` deploys merged master.

## Verified findings

All citations verified 2026-06-29 against `origin/master@937f89f7`. Agent: `bmo/pi/agent.py`. App wiring: `bmo/pi/app.py`. Timer service: `bmo/pi/services/timer_service.py`. Smart-home agent: `bmo/pi/agents/smart_home_agent.py`.

### F1 — LED service-key mismatch: handlers read `led_controller`, the registry only writes `leds` -> chat LED control always "not available"

**Status: confirmed (High).** The four LED handlers resolve the controller by the key `led_controller`:

- `bmo/pi/agent.py:1522` `_handle_led_set_color` -> `led = self.services.get("led_controller")`
- `bmo/pi/agent.py:1534` `_handle_led_set_mode`
- `bmo/pi/agent.py:1542` `_handle_led_set_brightness`
- `bmo/pi/agent.py:1550` `_handle_led_get_state`

Each falls back to `return "LED controller not available"` when the lookup is falsy (`agent.py:1524,1536,1544,1552`). But `app.py` registers the live controller **only** under `leds`, at both the simulated and real branches:

- `bmo/pi/app.py:590` `service_map["leds"] = led_controller` (SimLedController branch)
- `bmo/pi/app.py:600` `service_map["leds"] = led_controller` (real `LedController` branch)

There is no `service_map["led_controller"]` anywhere. Meanwhile `smart_home_agent.py:52` declares `services=["smart_home", "tv", "led_controller"]` — confirming `led_controller` is the intended key. So the agent's LED commands are always `None` -> `"LED controller not available"`, while the dashboard LED panel works because `/api/led/*` (`app.py:1616-1673`) calls the **global** `led_controller` object directly, not through `service_map`.

```bash
grep -n 'services.get("led_controller")' bmo/pi/agent.py            # :1522,1534,1542,1550
grep -n 'service_map\["leds"\]\|service_map\["led_controller"\]' bmo/pi/app.py   # only "leds" at :590,:600
grep -n 'services *=' bmo/pi/agents/smart_home_agent.py            # :52 declares "led_controller"
```

### F2 — `_execute_command` marks an error-string return as `success: True`; non-informational command errors never reach the reply -> the agent falsely confirms failed actions

**Status: confirmed (High).** `_execute_command` (`agent.py:1195-1209`) treats *any* non-raising handler return as success:

```python
result = handler(params)
return {"action": action, "success": True, "result": result}
```

The LED handlers return the **string** `"LED controller not available"` on failure (F1) instead of raising — so the recorded result is `{"action": "led_set_color", "success": True, "result": "LED controller not available"}`. Then in the reply-assembly loop (`agent.py:823-830`) only a small allowlist is ever appended to the user-facing text:

```python
INFORMATIONAL_ACTIONS = {"timer_list", "calendar_today", "calendar_week", "weather", "device_list", "bmo_status", "led_get_state"}
for r in results:
    if r.get("success") and r.get("action") in INFORMATIONAL_ACTIONS and r.get("result"):
        text = f"{text}\n{r['result']}" if text.strip() else r["result"]
```

`led_set_color` / `led_set_mode` / `led_set_brightness` (and `alarm_set`, TV control, etc.) are **not** informational, so their result — success **or** error — is dropped from the reply. The user sees only the LLM's prose, and the `smart_home` agent's system prompt explicitly tells it to "Confirm what you did," so bmo cheerfully claims it set the lights / the alarm while nothing happened. The same masking hides the F3 alarm `AttributeError` (which *does* surface as `success: False` with an `error`, but is still never shown).

```bash
sed -n '1195,1209p' bmo/pi/agent.py        # _execute_command: success:True for any non-raising return
sed -n '823,830p'   bmo/pi/agent.py        # INFORMATIONAL_ACTIONS gate — control results dropped
sed -n '1521,1556p' bmo/pi/agent.py        # LED handlers return error STRINGS, never raise
```

### F3 — `TimerService.create_alarm` timezone fallback dereferences `.key` on a `datetime.timezone` -> `AttributeError`; the default guard below is dead code

**Status: confirmed (Medium; latent crash).** `bmo/pi/services/timer_service.py:283`:

```python
tz_name = _normalize_timezone(timezone_name) or datetime.datetime.now().astimezone().tzinfo.key
if not tz_name:
    tz_name = DEFAULT_EXISTING_ALARMS_TZ
```

`_normalize_timezone` (`timer_service.py:16-25`) returns `None` for an empty string or a name `ZoneInfo(...)` can't resolve. When it returns `None`, Python evaluates the right operand: `datetime.datetime.now().astimezone().tzinfo` is a fixed-offset `datetime.timezone` (the Pi's local offset), and **only `zoneinfo.ZoneInfo` has a `.key` attribute** — so `.key` raises `AttributeError: 'datetime.timezone' object has no attribute 'key'` *before* the `if not tz_name:` guard on the next line can ever run. That guard is unreachable dead code. Contrast the **correct** pattern already used in the `Timer` constructor at `timer_service.py:70`: `tz_name = _normalize_timezone(anchor_timezone) or DEFAULT_EXISTING_ALARMS_TZ`. Line 283 is the lone outlier.

```bash
sed -n '16,25p'   bmo/pi/services/timer_service.py     # _normalize_timezone -> None on empty/bad
sed -n '283,286p' bmo/pi/services/timer_service.py     # the .key fallback + unreachable guard
sed -n '70,70p'   bmo/pi/services/timer_service.py     # the CORRECT pattern to mirror
python3 -c "import datetime; print(type(datetime.datetime.now().astimezone().tzinfo).__name__, hasattr(datetime.datetime.now().astimezone().tzinfo,'key'))"
# -> timezone False
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the no-new-prints guard) — use the module logger for any new line. One commit at phase end (INSTRUCTIONS.md rule 5).

### 16A — Align the LED service key so chat LED commands reach the controller

**Objective:** the agent's LED handlers fetch the same live controller the dashboard `/api/led/*` panel drives; `service_map` exposes the key the agents declare (`led_controller`), with `leds` retained as a back-compat alias.

**Files:** `bmo/pi/app.py` (the two `service_map["leds"] = led_controller` registrations), `bmo/pi/tests/agents/` (a new or extended test asserting the agent can resolve the LED controller).

**Steps:**

1. In `app.py`, at **both** registration sites (`:590` SimLedController branch and `:600` real `LedController` branch), register the controller under the agent-declared key **and** keep the legacy alias: add `service_map["led_controller"] = led_controller` alongside the existing `service_map["leds"] = led_controller`. (Registering both keys is the minimal, non-breaking change — it satisfies `smart_home_agent.py:52`'s declared `led_controller` and any existing `leds` consumer. Do **not** remove `leds`.)
2. Confirm no other consumer relies on the singular-only behavior: `grep -rn 'service_map\["leds"\]\|\.get("leds")\|\.get("led_controller")' bmo/pi` — every reader should resolve after the change. (`/api/led/*` uses the global object, not the map, so it is unaffected.)
3. Add an agent-level test (extend `bmo/pi/tests/agents/test_base_agent.py` or add a focused test) that builds an agent with a `service_map` containing a stub LED controller registered the way `app.py` now does, and asserts `_handle_led_set_color({"color": "blue"})` resolves the controller (i.e. does **not** return `"LED controller not available"`). This is the regression that catches a future key drift.

**Cheap check:** `cd bmo/pi && python -m pytest tests/agents/test_base_agent.py -q && ruff check app.py`.

**Acceptance:** with the controller registered as `app.py` now does it, every LED handler resolves a non-None controller; a chat "set the lights blue" reaches `set_color_by_name`; the `leds` alias still resolves for any legacy reader; the new test fails against the pre-fix wiring and passes after.

### 16B — Make command results honest: derive success from the handler, and surface control-command failures in the reply

**Objective:** a handler that fails can no longer be recorded as `success: True`, and a failed **control** command (LED/alarm/TV/etc.) is reflected in the user-facing reply instead of being silently dropped — so the agent cannot confirm an action that did not happen.

**Files:** `bmo/pi/agent.py` (`_execute_command` at `:1195`, the reply-assembly block at `:823-830`, and the LED handlers at `:1521-1556`), `bmo/pi/tests/agents/` (truthfulness regressions).

**Steps:**

1. **Give handlers an unambiguous failure signal.** Convert the four LED handlers' `return "LED controller not available"` (and the `Unknown color` / `Unknown mode` error returns) into a structured outcome the executor can read as failure — the lowest-risk option that keeps every other handler unchanged is a small sentinel: return a dict `{"ok": False, "message": "LED controller not available"}` on failure and `{"ok": True, "message": "..."}` (or keep the existing string) on success, **or** raise a dedicated `CommandError(message)`. Pick **one** convention and apply it only to the control handlers whose error strings currently masquerade as success (LED set color/mode/brightness; audit `alarm_set` / TV handlers for the same string-return-on-failure pattern and convert those too). Document the chosen convention in a comment beside `_execute_command`.
2. **Reconcile `_execute_command` (`:1195-1209`).** When a handler returns the failure sentinel (or raises `CommandError`), return `{"action": action, "success": False, "error": message}` — never `success: True` with an error string in `result`. A bare-string return from an un-converted handler stays success (back-compat), but the control handlers now report truthfully. Keep the `except Exception` arm as the final backstop.
3. **Surface non-informational control failures in the reply (`:823-830`).** After the existing `INFORMATIONAL_ACTIONS` append loop, add a second pass: for any result with `success is False` whose action is a real-world control (define a small `CONTROL_ACTIONS` set — LED set*, `alarm_set`, TV transport/power, etc.), append a short honest failure line to `text` (e.g. `"\n(Heads up: I couldn't actually do that — <error>.)"`), so the LLM's optimistic confirmation is corrected rather than left standing. Keep it concise and BMO-voiced; do not dump raw tracebacks.
4. Ensure no new bare `print()` is introduced (use the existing `[agent]` logger pattern already present at `:817,:819`).

**Cheap check:** `cd bmo/pi && python -m pytest tests/agents/test_base_agent.py -q && ruff check agent.py`.

**Acceptance:** a `led_set_color` executed with **no** controller registered yields `success: False` (not `True` with an error string) and the reply contains an honest "couldn't do that" line rather than only the LLM's "done"; an informational command (e.g. `led_get_state`, `timer_list`) still appends its result exactly as before; a genuinely-successful control command produces no spurious failure line.

### 16C — Replace the `create_alarm` timezone fallback so it can't crash

**Objective:** `create_alarm` resolves a valid IANA tz on the fallback path without dereferencing a non-existent `.key`, for **any** caller — including one that passes an empty/unresolvable `timezone_name`.

**Files:** `bmo/pi/services/timer_service.py` (line 283), `bmo/pi/tests/test_timer_service.py` (a tz-fallback regression).

**Steps:**

1. In `create_alarm` (`timer_service.py:283`), replace the `.key` fallback with the safe default the rest of the module already uses — mirror the `Timer` constructor at `:70`:
   `tz_name = _normalize_timezone(timezone_name) or DEFAULT_EXISTING_ALARMS_TZ`
   and **delete** the now-redundant unreachable `if not tz_name: tz_name = DEFAULT_EXISTING_ALARMS_TZ` guard on `:285-286` (it can no longer fire). If preserving the "derive the Pi's actual local zone" intent is desired, do it `.key`-free and guarded, e.g. `_normalize_timezone(getattr(datetime.datetime.now().astimezone().tzinfo, "key", None)) or DEFAULT_EXISTING_ALARMS_TZ` — but the simple constant fallback matches `:70` and is sufficient.
2. Add a unit test in `test_timer_service.py`: `create_alarm(7, 0, timezone_name=None)` and `create_alarm(7, 0, timezone_name="")` and `create_alarm(7, 0, timezone_name="Not/AZone")` each **return a dict** (alarm created) and do **not** raise `AttributeError`; assert the resulting alarm's `anchor_timezone` is `DEFAULT_EXISTING_ALARMS_TZ`. Optionally assert a valid `timezone_name="America/Chicago"` still anchors there.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_timer_service.py -q && ruff check services/timer_service.py`.

**Acceptance:** `create_alarm` with a missing/empty/unresolvable timezone creates the alarm against `DEFAULT_EXISTING_ALARMS_TZ` instead of raising; the chat alarm path (which routes through `_handle_alarm_set` -> `create_alarm`) can no longer crash on the tz fallback; the new test fails against the `.key` line and passes after.

## Test plan

- **16A:** `bmo/pi/tests/agents/test_base_agent.py` — agent resolves the LED controller from a map registered the new way (regression on key drift).
- **16B:** `bmo/pi/tests/agents/test_base_agent.py` — `_execute_command` returns `success: False` for a failed control handler; the reply gains an honest failure line; informational appends unchanged; a successful control command stays clean.
- **16C:** `bmo/pi/tests/test_timer_service.py` — `create_alarm` with `None`/`""`/bad tz creates an alarm at `DEFAULT_EXISTING_ALARMS_TZ`, no `AttributeError`.
- **End-of-phase gate:** the full `python -m pytest` runs in `bmo-pi-pytest.yml` on push; no-new-prints / docker / codeql guards apply. No frontend change -> no Tailwind rebuild.

## Acceptance criteria

1. The chat agent's LED handlers resolve the same controller the `/api/led/*` dashboard panel uses; "set the lights blue" in chat reaches the controller (verified by the owner-run deploy on hardware; verified in CI by the key-resolution test).
2. A failed control command is never recorded as `success: True` with an error string in `result`; `_execute_command` reports `success: False` with the error.
3. A failed LED/alarm/TV control command produces an honest "couldn't do that" line in the reply rather than only the LLM's optimistic confirmation; informational command output is unchanged.
4. `create_alarm` with a missing/empty/unresolvable `timezone_name` creates the alarm against `DEFAULT_EXISTING_ALARMS_TZ` and never raises `AttributeError`.
5. Full `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope (logged / owned elsewhere — do not inline-fix here)

- **`GOOGLE_VISION_API_KEY` missing -> camera/vision "describe" degraded** (run 1 §2). An owner/ops credential item (set the key in the Pi env), not bmo app code — consistent with prior batches' treatment. The only code-side question (does the camera/vision control degrade with a clear "vision unavailable" message?) overlaps 16B's "surface control failures" philosophy but the vision path is a separate surface; leave it to an owner config action + a future phase if the degradation copy proves silent.
- **Google Calendar OAuth refresh token revoked/expired** (run 1 §6). A genuine outage requiring the owner to run `reauth_calendar.py`; already tracked in `docs/logs/BMO-RESOLVED-ISSUES.md` (2026-06-28 entry) — the code/monitoring/escalation are behaving correctly. Not a code change.
- **Conversation-agent personality deflections** ("ADVENTURE TIME!" for "what time is it?") — intended BMO (Adventure Time) personality; the agent router otherwise resolves correctly. A product decision, not a defect.
- **Pi-system-TZ vs configured-location-TZ reconciliation** (the alarm create-vs-list display mismatch, run 1 §7) — intentional per `bmo/docs/DESIGN-CONSTRAINTS.md` ("reconciliation remains an owner/config decision — out of scope").
