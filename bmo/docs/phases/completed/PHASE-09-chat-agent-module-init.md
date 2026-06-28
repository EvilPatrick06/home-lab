# PHASE-09 — bmo chat agent module-init correctness

> Authored 2026-06-28 from `bmo/docs/phases/QA/QA-report-2026-06-28.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Restore the dashboard's headline feature — the bmo chat agent — which is **100% non-functional in production**: every message crashes with `AttributeError: 'NoneType' object has no attribute 'model_override'` (WebSocket path) or HTTP 500 (`'NoneType' object has no attribute 'chat'`, REST path), and the user sees the canned **"Oops! BMO's brain got fuzzy"** bubble. The 2026-06-28 QA pass (the first to drive the rendered SPA over Cloudflare Access) confirmed the outage end-to-end and root-caused it to a **double-module / wrong-namespace split** caused by the systemd launch method: the chat blueprints late-bind their services through `import app`, but production runs `python app.py` (the module is `__main__`), so `import app` materialises a **second, uninitialised** `app` module whose `agent` is `None`.

Three workstreams: **(1) fix the module-init split** so the chat blueprints resolve the same initialised app object that `init_services()` populated (a one-line `sys.modules` alias, with an `_app()`-level fallback as a belt); **(2) add the missing `if not agent` guard** to `on_chat_message` so a None agent degrades gracefully like its sibling handlers instead of throwing a raw 500; and **(3) chat-history hygiene** so the persisted never-completed assistant stubs ("Hello from BMO!" / "(interrupted — try asking again)") stop polluting the rendered transcript and confusing triage.

PLANNING/AUTHORING ONLY. This phase ships in-repo Python + a regression test; the executer does **not** restart live Pi services or deploy (INSTRUCTIONS.md rule 6) — the integrator's merge is shipped by `bmo-deploy.yml`.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@a2d87c53`. This is the critical/medium server-side correctness layer of the 2026-06-28 report; **PHASE-10** (service-health truth) and **PHASE-11** (dashboard UX) cover the calendar/health and frontend findings on disjoint files — any order, prefer 09 first (the chat outage is the report's sole Critical).
- **Scope is the `_app()` resolver, not a rewrite of the launch.** A WSGI/`python -m app` entrypoint is a larger, deploy-touching alternative (Research notes); this phase fixes the namespace split in-repo without changing `systemd/bmo.service` or the deploy, so it lands behind the normal CI gate and the integrator merge with no owner/infra step.
- **Live-Pi boundary (rule 6):** the executer does not `systemctl restart bmo` or run the canary on the Pi. The fix is verified by the new regression test + `bmo-pi-pytest.yml`; the real-process recovery happens when the owner/`bmo-deploy.yml` deploys the merged master.

## Verified findings

All citations verified 2026-06-28 against `origin/master@a2d87c53` (the report tested the live process `568af48a` / `origin/master@919c4804`; line numbers below are re-anchored to current HEAD — INSTRUCTIONS.md rule 3). `bmo/pi/app.py` is the Flask entrypoint; the chat blueprints are `bmo/pi/routes/chat_api.py` and `bmo/pi/routes/realtime_ws.py`.

### F1 — Production launch runs `app.py` as `__main__`; `import app` in the handlers builds a SECOND, uninitialised module whose `agent` is `None`

**Status: confirmed.** `systemd/bmo.service:17` is `ExecStart=…/venv/bin/python app.py`, so the module runs as `__main__`. `init_services()` (`app.py:557`, whose `global …, agent, …` decl at `app.py:561` assigns the module-level `agent`) is called **only** under the `if __name__ == "__main__":` guard (`app.py:3023-3024`), so it populates **`__main__`'s** globals. The chat blueprints resolve services late:

```python
def _app():
    import app        # a SECOND module object "app" (not __main__)
    return app
```

(`chat_api.py:25-26`, `realtime_ws.py:34-35`). `import app` re-executes `app.py` under `__name__ == "app"`, the `__main__` guard is skipped, `init_services()` never runs in that copy, and `app.agent` (plus `app.voice`, etc.) stays `None`. The module's own design comment documents the intended late-bind mechanism (`app.py:2985-2996`: "PHASE-16 blueprints register at MODULE scope … they late-bind services via `import app` inside the handlers, so `import app` in the test suite mounts them without running __main__") — the bug is that in **production** the initialised module is `__main__`, not `app`, so the late-bind resolves to the wrong (uninitialised) copy. (Side effect: the module-scope `chat_history.set_agent_resolver(lambda: agent)` at `app.py:~2175` re-runs in the second module and rebinds the resolver's closure to the None-agent copy.)

```bash
grep -n "ExecStart" bmo/pi/systemd/bmo.service                 # python app.py → __main__
sed -n '3023,3025p' bmo/pi/app.py                               # init_services() only under __main__ guard
sed -n '557,562p' bmo/pi/app.py                                 # global … agent … assigned here
sed -n '2985,2996p' bmo/pi/app.py                               # design comment: late-bind via import app
sed -n '25,27p'  bmo/pi/routes/chat_api.py                      # _app(): import app
sed -n '34,36p'  bmo/pi/routes/realtime_ws.py                   # _app(): import app
```

### F2 — `on_chat_message` dereferences `agent` with no None-guard, so the None agent becomes a raw 500 + the "brain got fuzzy" bubble

**Status: confirmed.** `on_chat_message` (`realtime_ws.py:181`) does `a = _app(); agent = a.agent` (`:184`) and then, with **no None-check**, `prev_model_override = agent.model_override` (`:222`) → `AttributeError: 'NoneType' object has no attribute 'model_override'`. The REST twin `api_chat` (`chat_api.py:38`, route `/api/chat` at `:36`) does `result = _app().agent.chat(...)` (`:59`) → `AttributeError: 'NoneType' object has no attribute 'chat'` → 500. By contrast the **sibling** socket handlers all guard before dereferencing: `on_plan_approve` (`:280`) `agent = a.agent; if not agent:` (`:284-285`), `on_plan_reject` (`:298`/`:303`), and the scratchpad handlers (`:329`, `:338`, `:350`). So even once F1 is fixed, `on_chat_message` should degrade gracefully if the agent is ever unavailable, matching its siblings.

```bash
sed -n '181,226p' bmo/pi/routes/realtime_ws.py                 # on_chat_message: a.agent → .model_override, NO guard
sed -n '280,305p' bmo/pi/routes/realtime_ws.py                 # plan_approve/plan_reject: the `if not agent` pattern to mirror
sed -n '36,60p'  bmo/pi/routes/chat_api.py                      # api_chat: _app().agent.chat(...) (line 59)
```

### F3 — Existing chat tests import `app` directly and stub the agent, so they never exercise the production `__main__` split (the canary doesn't either)

**Status: confirmed.** `tests/test_chat_api.py` does `import app` (module name `app`, never `__main__`) and `chat_history.set_agent_resolver(lambda: None)`, and its happy-path test only asserts the persistence/spoof-guard behaviour — it never drives `_app().agent.chat()` against a live agent through the production launch, so the double-module split is invisible to the suite. The deploy **canary** (`scripts/deploy.sh:~291,298`, `BMO_CANARY=1 … app.py`) launches the same `python app.py` but only health-checks `/health` (a native `@app.route` resolved against `__main__`'s globals), so it goes green while chat is down. This is why the outage shipped: there is no test or preflight that hits the agent over the deployed launch path.

```bash
sed -n '1,30p' bmo/pi/tests/test_chat_api.py                   # import app + set_agent_resolver(lambda: None)
grep -n "BMO_CANARY\|app.py" bmo/pi/scripts/deploy.sh          # canary runs app.py, health-checks /health only
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the `no-new-prints` guard) — use the module logger for any new line.

### 09A — Eliminate the double-module split so the chat blueprints resolve the initialised app

**Objective:** `import app` (and therefore `_app()`) returns the **same** module object that `init_services()` populated, so `_app().agent` is the live `BmoAgent` in production — not a None-agent second copy.

**Files:** `bmo/pi/app.py`, `bmo/pi/routes/realtime_ws.py`, `bmo/pi/routes/chat_api.py`, `bmo/pi/tests/` (new/extended regression test).

**Steps:**

1. **Primary fix — alias the module so a second copy is never created.** At the very top of the `if __name__ == "__main__":` block (`app.py:3023`, **before** `init_services()` at `:3024`), register the running module under its import name:
   ```python
   import sys
   sys.modules.setdefault("app", sys.modules["__main__"])  # or: sys.modules["app"] = sys.modules["__main__"]
   ```
   With `sys.modules["app"]` pointing at the initialised `__main__`, any later `import app` in a handler returns that same object (Python serves it from `sys.modules` and never re-executes `app.py`). This fixes **every** `import app`-based late-bind at once — chat, the `chat_history` resolver, and the other blueprints (`calendar_api`, `music_api`, `system_api`, `ide`) that use the same pattern — not just the chat path. Place it before `init_services()` so the alias exists before any request can fire. The alias lives **inside** the `__main__` guard, so it never executes under pytest (which imports `app` as `app`, never as `__main__`) — F3 tests are unaffected.
2. **Belt — make `_app()` prefer the initialised module.** In both `chat_api._app()` (`:25-26`) and `realtime_ws._app()` (`:34-35`), resolve `__main__` first when it is the initialised app:
   ```python
   def _app():
       import sys
       main = sys.modules.get("__main__")
       if getattr(main, "agent", None) is not None:
           return main
       import app
       return app
   ```
   This is defence-in-depth: even if the alias in step 1 is ever missed (e.g. a future alternate entrypoint), the resolver still finds the live services. Keep it cheap and side-effect-free.
3. Do **not** change `systemd/bmo.service`, `scripts/deploy.sh`, or the `init_services()` call site beyond the alias — the larger WSGI/`python -m app` re-entrypoint is explicitly out of scope (Research notes / Out of scope).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_chat_api.py -q && ruff check app.py routes/chat_api.py routes/realtime_ws.py`.

**Acceptance:** after the production-style launch, `_app()` returns a module whose `agent` is the live agent (not `None`); pytest's `import app` path is unchanged; no second `app` module is created at request time.

### 09B — Add the missing None-agent guard to `on_chat_message` (graceful degradation)

**Objective:** a missing/unavailable agent emits a clean, user-facing "agent unavailable" status and returns, instead of an unhandled `AttributeError`/500 and the "brain got fuzzy" bubble — mirroring the sibling handlers.

**Files:** `bmo/pi/routes/realtime_ws.py`, `bmo/pi/tests/test_realtime_ws.py` (or the existing realtime test; add a focused one if absent).

**Steps:**

1. In `on_chat_message`, immediately after `agent = a.agent` (`realtime_ws.py:184`) and **before** the first dereference at `:222`, add the same early-return the siblings use (`on_plan_approve` `:284-285`): if `not agent`, `emit` a clean status (e.g. `{"error": "agent unavailable"}` / a non-crashing status event the composer already understands) and `return`. Match the sibling handlers' emit shape so the frontend handles it uniformly.
2. Mirror the same defensive guard in `api_chat` (`chat_api.py:59`) if the REST path can also see a None agent — return a handled JSON 503 ("agent unavailable") rather than letting `.chat` raise a 500.
3. Tests: with `_app().agent is None`, assert `on_chat_message` emits the unavailable status and does **not** raise; assert `POST /api/chat` returns the handled 503 (not 500). Keep the agent stubbed (no real model calls).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_realtime_ws.py tests/test_chat_api.py -q && ruff check routes/realtime_ws.py routes/chat_api.py`.

**Acceptance:** a None agent yields a clean handled status/JSON on both the WS and REST paths; a present agent path is unchanged.

### 09C — Stop persisting never-completed assistant turns; repair the misleading stubs

**Objective:** the rendered chat transcript no longer shows orphan "Hello from BMO!" canned bubbles or stale "(interrupted — try asking again)" pills from requests that died mid-flight, so the live failure signature isn't masked by old placeholder data.

**Files:** `bmo/pi/services/chat_history.py`, `bmo/pi/routes/realtime_ws.py`, `bmo/pi/tests/` (the chat-history test).

**Steps:**

1. Trace the placeholder writes: `on_chat_message` calls `chat_history.save_pending_assistant_stub(pending_id)` (`realtime_ws.py:212`) before the agent runs, and `_finish_chat_response` is what later fills/replaces it. When the turn dies (the F1/F2 crash, or any mid-flight failure) the stub is never reconciled and persists as an "(interrupted)" pill. Make the stub **non-persistent until completion** — keep it in-memory / mark it provisional and only write a completed assistant turn, OR have a startup/load-time sweep in `chat_history.load_recent_chat` that drops/repairs assistant turns still flagged pending.
2. The generic "Hello from BMO!" bubbles are earlier stub/seed replies in the persisted history; after 09A restores real replies, add a one-time load-time repair that prunes assistant turns with the placeholder marker (do not touch user turns). Keep it conservative — only prune turns explicitly flagged as pending/stub, never real completed replies.
3. Tests: a persisted history containing a pending stub loads with the stub dropped/repaired (not rendered as a real reply); a completed assistant turn is preserved; a user turn is never removed.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_chat_history.py -q && ruff check services/chat_history.py routes/realtime_ws.py` (substitute the actual chat-history test filename).

**Acceptance:** never-completed assistant stubs no longer render as real/canned replies; completed turns and all user turns are preserved.

## Research notes

- **Script-run-as-`__main__` that is also imported by name is a classic double-module trap.** When `python app.py` runs, the module is `sys.modules["__main__"]`; the first `import app` elsewhere executes the file a **second** time as `sys.modules["app"]`, producing two module objects with independent globals. The canonical one-line cure is to alias them (`sys.modules["app"] = sys.modules["__main__"]`) so the name resolves to the already-initialised object — exactly 09A step 1. This is lower-risk than the structural alternatives because it changes no launch/deploy surface and is inert under the test harness.
- **Why the larger entrypoint rewrite is deferred, not chosen.** Moving to a WSGI/`python -m app`/`wsgi.py` entrypoint with `init_services()` at import scope, or storing services on `current_app.extensions`/a registry instead of bare module globals, would also fix it — but each touches `systemd/bmo.service`, the deploy canary, and the import-time test bootstrap, i.e. owner/infra surface beyond a planning-only phase. The alias + resolver belt fixes the production defect now; a follow-up may revisit the entrypoint as a hygiene item.
- **The gate gap is the real lesson (F3).** The outage shipped because neither the unit tests nor the deploy canary exercise the agent over the deployed launch. 09A's regression test closes the unit-test half; a canary that POSTs `/api/chat` (and asserts a non-500) against the running `app.py` would close the deploy half — noted for the owner as a canary-hardening follow-up (it edits `scripts/deploy.sh`, owner/infra).

## Test plan

- **09A** — new/extended regression test: a production-style resolution (initialised `__main__` + `import app`) yields a live agent through `_app()`; the pytest `import app` path is unchanged; no second module is created.
- **09B** — `tests/test_realtime_ws.py` + `tests/test_chat_api.py`: None-agent → clean emitted status / handled 503, no raise; present-agent path unchanged.
- **09C** — the chat-history test: pending stub dropped/repaired on load; completed and user turns preserved.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + the no-new-prints / docker / codeql guards are the gate. No live-Pi restart / deploy / canary run (rule 6).

## Acceptance criteria

- [ ] In a production-style launch, `_app().agent` is the live `BmoAgent` (not `None`); a chat message returns a real streamed reply over WS and a 200 over `/api/chat`.
- [ ] `on_chat_message` (and `api_chat`) guard a missing agent and degrade gracefully (clean status / handled 503) instead of raising the "brain got fuzzy" 500.
- [ ] Never-completed assistant stubs no longer render as real/canned replies; completed and user turns are preserved.
- [ ] A regression test fails on the pre-fix double-module split and passes after; the pytest `import app` bootstrap is unaffected.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Re-entrypointing the app** (WSGI / `python -m app` / `wsgi.py`, services on `current_app.extensions`) — larger deploy-touching change; the alias + resolver belt fixes the defect in-repo (Research notes).
- **Editing `systemd/bmo.service`, `scripts/deploy.sh`, or restarting/deploying the live Pi** — owner/infra, live-Pi data (rule 6). The canary-POST-`/api/chat` hardening is flagged for the owner, not implemented here.
- **Calendar / health-signal findings** — PHASE-10. **Header-badge / Cal-tab / add-event / TV-pair / console-hygiene UX** — PHASE-11.

## Completed

Implemented 2026-06-28 on `auto/bmo-phase-executer` (base `origin/master@a28aa11e`; line numbers re-anchored from the plan's `a2d87c53` per INSTRUCTIONS.md rule 3). Cheap checks green: `ruff check` clean on all touched Python; `pytest tests/test_chat_api.py tests/test_realtime_ws.py tests/test_chat_history.py` = 30 passed.

- **09A — module-init split eliminated.** `app.py` `if __name__ == "__main__":` now aliases `sys.modules["app"] = sys.modules["__main__"]` *before* `init_services()`, so any later `import app` in a handler resolves to the initialised module (`app.py` `__main__` guard). Belt: `chat_api._app()` and `realtime_ws._app()` now prefer `sys.modules["__main__"]` when its `agent` is live, else fall back to `import app` (`routes/chat_api.py:_app`, `routes/realtime_ws.py:_app`). Alias is inert under pytest (app imported as `app`).
- **09B — None-agent guards.** `on_chat_message` now mirrors the sibling `plan_approve`/`plan_reject` handlers: after `agent = a.agent`, `if not agent:` emits a clean "assistant unavailable" `chat_response` and returns (`routes/realtime_ws.py` `on_chat_message`) instead of raising `AttributeError` on `agent.model_override`. REST twin `api_chat` returns a handled `503 {"error":"agent unavailable"}` before persisting, so a dead agent leaves no orphan user turn (`routes/chat_api.py:api_chat`).
- **09C — orphan-stub hygiene.** Added `_is_orphan_stub`, `load_recent_chat_for_display`, and `sweep_orphan_stubs` to `services/chat_history.py` (raw `load_recent_chat` left unchanged so the write/finalize path still sees in-flight stubs). `/api/chat/history` and the startup agent-memory restore now use the display loader; `init_services()` calls `sweep_orphan_stubs()` once at startup to permanently drop never-completed assistant placeholders (`app.py` startup restore block, `routes/chat_api.py:api_chat_history`).
- **Tests added:** `tests/test_realtime_ws.py` — `_app()` prefers initialised `__main__` / falls back to `app`; None-agent WS path degrades + persists no orphan. `tests/test_chat_api.py` — REST 503 + no orphan persist. `tests/test_chat_history.py` — display loader drops orphan / keeps real; sweep removes-and-preserves; finalize path unaffected.
- **Not done (owner/infra, per Out of scope + rule 6):** re-entrypointing to WSGI/`python -m app`; the canary-POST-`/api/chat` deploy-gate hardening (edits `scripts/deploy.sh`); no live-Pi restart/deploy — the real-process recovery happens when the owner/`bmo-deploy.yml` deploys merged master.
