# PHASE-22 — bmo chat model-quota fallback & provider-error truth (Plan agent 429 dead-end)

> Authored 2026-07-15 from `bmo/docs/phases/QA/QA-report-2026-07-15.md` (run 5, live deploy `d6699d52`, runtime identical to `e03664fa`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the report's headline **High**: every Plan-agent request (and every other Pro-tier agent request) is dead on arrival because the tiered router pins those agents to `gemini-3.1-pro`, whose **free-tier request quota is 0** — the provider answers `429 RESOURCE_EXHAUSTED … free_tier_requests, limit: 0` on every call, there is no quota-aware fallback, and the user is told "the connection may be down":

1. **The Pro tier is routed to a model the account cannot call at all** — `_PRO_AGENTS` (plan, research, review, design, security, deploy, docs, test, learning) → `PRIMARY_MODEL` = `gemini-3.1-pro`; Flash answers instantly on the same key. No 429→Flash/Local ladder exists anywhere in the call chain. *(high, bug)*
2. **A quota 429 poisons cloud routing for every agent**: the `llm_chat` failure path sets the global `_cloud_available = False` on *any* exception — including a per-model quota error — so subsequent calls from perfectly healthy Flash/Claude agents skip the cloud entirely for up to the health-check interval. *(bug)*
3. **The chat UI blames the network for provider-side failures.** The frontend watchdog's one generic message ("BMO didn't respond — the connection may be down. Try again.") fires after 45 s regardless of cause, and the backend never pushes a structured error event distinguishing transport vs upstream-model failure. "Try again" is futile advice when quota is 0. *(medium, UX — §2 "Chat error copy blames connection")*

PHASE-18 fixed the Plan agent's `KeyError: 'state'` prompt crash; run 5 shows the surface is still 100 % broken one layer down, at the provider. Common thread with PHASE-10/16/17/19: tell the user the truth about what failed.

PLANNING/AUTHORING ONLY. Categories: **bug (high) ×2 + UX (medium)** — the bug items auto-implement per the autonomy policy; the error-copy step rides along as part of the same fix (the structured event *is* the bug fix's observable surface). Backend (`agent.py`, `services/cloud_providers.py`, `routes/realtime_ws.py`) + frontend (`bmo.js`); backend fully pytest-coverable.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@f2300ac8` (2026-07-15); the tested live deploy `d6699d52` is runtime-identical for `bmo/pi`. Re-anchor line numbers before editing (rule 3).
- **PHASE-18 (merged) is not regressed** — the prompt-render crash is a separate layer; do not touch `plan_agent.py` prompts here.
- **`cloud_chat` already has an opt-in cross-vendor failover** (`BMO_LLM_FAILOVER_MODEL`, `services/cloud_providers.py:394-417`) added from BMO-SUGGESTIONS. It is (a) unset on the Pi and (b) cross-*vendor* only by design (skips a same-vendor fallback). This phase adds a **same-vendor quota ladder** (Pro→Flash) at the router layer instead — deliberately narrow to 429/quota so DM/Code-Agent determinism is untouched. Leave the env-var failover as-is.
- **Do not change `_OPUS_AGENTS`/`_FLASH_AGENTS` routing** — only the failure behavior. The tier *assignment* is a product decision (and Flash/Opus work today).
- **The frontend watchdog itself is correct** (PHASE-02 02A, re-armed by liveness signals) — 22C adds a *cause-specific* terminal event so the watchdog's generic copy becomes the last resort, not the only message.
- **The report's ~60 s spin is explained by the fallback chain, not a hang**: the 429 raises out of `gemini_chat` (only 5xx retries there), `llm_chat` catches → `_local_chat` runs gemma on the Pi CPU (slow; plan mode makes several `llm_call`s — explore + design each re-enter), and the watchdog fires at 45 s while the server is still grinding. Fixing the ladder to Flash removes both the failure *and* the latency.

## Verified findings

All citations verified 2026-07-15 against `origin/master@f2300ac8`.

### F1 — Pro-tier agents are pinned to a model with zero free-tier quota; no quota-aware fallback exists in the chain

**Status: confirmed (High/bug).** The tier map:

```python
_PRO_AGENTS = frozenset({
    "plan", "research", "review", "design",
    "security", "deploy", "docs", "test", "learning",
})
```

(`bmo/pi/agent.py:221-225`; `_select_model` returns `PRIMARY_MODEL` for these at `:232-240`.) `PRIMARY_MODEL = os.environ.get("BMO_PRIMARY_MODEL", "gemini-3.1-pro")` (`bmo/pi/services/cloud_providers.py:37`), mapped to `gemini-3.1-pro-preview` (`:96`). The journal shows every such call answered `429 RESOURCE_EXHAUSTED … generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro`.

The retry loop in `gemini_chat` retries **only `>= 500`** (`cloud_providers.py:161-174`) — a 429 raises immediately. `cloud_chat`'s failover (`:394-417`) is gated on the unset `BMO_LLM_FAILOVER_MODEL` and rejects same-vendor fallbacks. `llm_chat`'s except-branch (`agent.py:276-291`) drops straight to `_local_chat` (Pi-CPU gemma). Net: no path ever tries Flash — which the same key *can* call (QA's Auto probe answered in 1.7 s).

```bash
sed -n '210,241p' bmo/pi/agent.py
sed -n '160,175p' bmo/pi/services/cloud_providers.py
sed -n '394,418p' bmo/pi/services/cloud_providers.py
```

### F2 — Any cloud exception (including a per-model 429) marks the whole cloud "down" for every agent

**Status: confirmed (bug).**

```python
    if _check_cloud_available():
        try:
            return _cloud_chat(messages, options, model=model)
        except Exception as e:
            ...
            global _cloud_available
            _cloud_available = False

    return _local_chat(messages, options)
```

(`bmo/pi/agent.py:276-291`.) A `gemini-3.1-pro` quota 429 — a *per-model, per-key* condition — flips the *global* `_cloud_available` flag, so until the next health re-check (`CLOUD_HEALTH_CHECK_INTERVAL`) even Flash-tier agents (conversation, timers, weather) and Claude agents route to the slow local fallback. One broken tier degrades the whole assistant.

```bash
sed -n '252,292p' bmo/pi/agent.py
grep -n 'CLOUD_HEALTH_CHECK_INTERVAL\|_cloud_available' bmo/pi/agent.py | head
```

### F3 — No structured model-failure event; the watchdog's generic "connection may be down" is the only copy

**Status: confirmed (Medium/UX).** Frontend: `_armChatWatchdog()` fires one hard-coded message after 45 s (`bmo/pi/web/static/js/bmo.js:1279-1293`). Backend: `on_chat_message`'s except-branch emits "Oops! BMO's brain got fuzzy: {e}" (`bmo/pi/routes/realtime_ws.py:286-289`) — but a provider failure usually does **not** raise there: `llm_chat` swallows it and returns `_local_chat`'s *error-string-as-reply* (`agent.py:139-207`), or the orchestrator's canned "I had trouble building that plan" (`bmo/pi/agents/orchestrator.py:171`). Neither carries a machine-readable cause; the UI cannot distinguish quota / provider / transport, so it guesses "connection".

```bash
sed -n '1279,1294p' bmo/pi/web/static/js/bmo.js
sed -n '283,292p' bmo/pi/routes/realtime_ws.py
grep -n 'trouble building that plan' bmo/pi/agents/orchestrator.py
```

## Sub-phases

> One commit at phase end. Backend steps get targeted pytest; the small frontend step is diff-review + acceptance-walked (no JS harness).

### 22A — Quota-aware same-vendor ladder in `llm_chat`: Pro → Flash → local

**Objective:** a 429/quota failure on the selected Gemini model retries once on `ROUTER_MODEL` (Flash) before ever touching the local fallback; non-quota errors keep today's behavior.

**Files:** `bmo/pi/agent.py` (`llm_chat` `:252-291`, plus a small classifier helper), `bmo/pi/services/cloud_providers.py` (surface the status code).

**Steps:**

1. In `cloud_providers.py`, make quota errors *classifiable*: raise a dedicated `ProviderQuotaError(RuntimeError)` from `gemini_chat` when `r.status_code == 429` (attach `model` and the response text's first ~300 chars). Keep the existing 5xx retry loop untouched. Export the class for callers.
2. In `llm_chat` (`agent.py`), wrap the `_cloud_chat` call: on `ProviderQuotaError` **and** `model != ROUTER_MODEL` and the model is a Gemini model, log one WARN (`[agent] {model} quota exhausted — retrying on {ROUTER_MODEL}`), increment a `metrics_counters.incr("llm_quota_fallback_total")`, and retry `_cloud_chat` once with `ROUTER_MODEL`. Only if that also fails, continue to the existing local fallback.
3. Do the same in `llm_chat_stream`'s Gemini branch (`agent.py:294-331`): on a quota failure from `gemini_chat_stream`, fall through to the non-streaming `llm_chat` (which now ladders) rather than straight local. Note `gemini_chat_stream` uses curl; classify by parsing the error body for `RESOURCE_EXHAUSTED`/`429` (bounded string check) rather than reworking its transport.
4. Respect explicit user choice: when `_active_model_override` pinned the model from the UI picker, do **not** silently ladder — fail with the structured error (22C) so the user's explicit selection is honored (resolvable-ambiguity note: auto-ladder only for tier-routed calls).

**Cheap check:** `python -m pytest tests/test_agent*.py -q` (or the closest existing agent-routing test module) with a mocked `cloud_chat` raising `ProviderQuotaError` — assert the second call uses `ROUTER_MODEL` and local is not invoked.

**Acceptance:** with Pro quota 0 (mocked 429), a Plan-agent `llm_call` returns a real Flash completion; `llm_quota_fallback_total` increments; explicit model-override requests do not ladder.

### 22B — Stop poisoning `_cloud_available` on 4xx / per-model errors

**Objective:** only *connectivity-class* failures (DNS, timeout, connection refused, 5xx on the health probe) may mark the cloud down; quota/auth/client errors never do.

**Files:** `bmo/pi/agent.py` (`llm_chat` `:276-291`, `_check_cloud_available` `:100-119`).

**Steps:**

1. In the `llm_chat` except-branch, classify: `requests` connection/timeout errors and HTTP >= 500 keep setting `_cloud_available = False`; `ProviderQuotaError` and other HTTP 4xx do **not** (the cloud is reachable — it answered).
2. Add a comment anchoring the rule: "a per-model 429 must not route Flash/Claude agents to local" (this finding).
3. Pytest: after a mocked quota failure, a subsequent Flash-tier `llm_chat` still attempts the cloud (assert `_cloud_chat` called, not `_local_chat`).

**Cheap check:** targeted pytest as above.

**Acceptance:** a Pro-tier quota failure leaves `_cloud_available` truthy; only connectivity-class errors flip it.

### 22C — Structured chat-error event + cause-specific frontend copy

**Objective:** when a model call fails terminally, the client receives a typed event and renders copy that names the real cause; the watchdog's generic text remains only for genuine silence.

**Files:** `bmo/pi/routes/realtime_ws.py` (`on_chat_message` / `_finish_chat_response` region), `bmo/pi/agent.py` (propagate cause), `bmo/pi/web/static/js/bmo.js` (`_armChatWatchdog` `:1279`, socket handlers `~:1030-1100`).

**Steps:**

1. Backend: introduce a lightweight error contract on the existing `chat_response` event rather than a new event (fewer moving parts, history-compatible): when the reply text came from a failure path, include `error_kind: "quota" | "provider" | "local_fallback" | "internal"` and `error_model: "<model>"`. Sources: `ProviderQuotaError` (22A), `_local_chat`'s error strings (`agent.py:139-207` — have `llm_chat` tag which branch produced the text via a module-level "last failure cause" returned alongside, or refactor `llm_chat` to return `(text, meta)` for the WS caller only — pick the smaller diff and note it in `## Completed`), and the handler's own except-branch (`realtime_ws.py:286`) as `internal`.
2. Frontend: in the `chat_response` handler, when `error_kind` is present render cause-specific copy and mark the bubble as an error: quota → "BMO's {model} brain is over its quota right now — the request was answered by a fallback model." (or, if the reply itself failed, "…try again in a minute or pick a different model in the ⚙ picker."); `local_fallback` → keep the informative local-fallback text (it is already user-facing); `internal` → today's copy. Cancel the watchdog as usual.
3. Watchdog copy: soften to cover only true silence: "BMO didn't respond in time. If this keeps happening, check the server connection." — remove the confident "the connection may be down" claim.
4. Nudge-vs-response ordering is **out of scope** here (PHASE-25 handles the proactive-quip interleave finding).

**Cheap check:** diff review; browser walk with a mocked 429 (point `BMO_PRIMARY_MODEL` at a bogus model on a dev box): the error bubble names the model/cause, not the network.

**Acceptance:** provider-side failures produce cause-specific copy in the transcript; the generic connection message appears only when no `chat_response` arrived at all.

### 22D — Regression tests for the ladder + flag semantics

**Objective:** the failure matrix that let this ship is pinned by pytest.

**Files:** `bmo/pi/tests/` (extend the agent/routing test module; create `tests/test_llm_quota_fallback.py` if none fits).

**Steps:**

1. Cases: (a) Pro 429 → Flash success → reply is Flash text, no local call; (b) Pro 429 → Flash 429 → local fallback invoked; (c) Pro 429 does not flip `_cloud_available`; (d) connection error does flip it; (e) explicit `model_override` + 429 → no ladder, error surfaces; (f) `error_kind` present on the WS payload for case (e) (unit-test the payload builder, not socket.io).
2. Keep mocks at the `cloud_chat`/`_cloud_dispatch` seam so no network is touched.

**Cheap check:** `python -m pytest tests/test_llm_quota_fallback.py -q`.

**Acceptance:** all six cases green in CI.

## Test plan

- **Backend:** targeted pytest per sub-phase; full sweep left to `bmo-pi-pytest.yml`; `ruff check` on touched files; no new bare `print()`s (use the module logger — note `agent.py` historically prints; match its existing style where the guard permits, else logger).
- **Frontend (22C step 2-3):** no JS harness — diff review + acceptance walk on the owner-run deploy (rule 6).

## Acceptance criteria

1. With `gemini-3.1-pro` quota at 0, Plan/research/review/etc. requests **succeed via Flash** (or, when Flash also fails, degrade to local with honest copy) — no 45 s dead spin.
2. A per-model quota error never routes unrelated agents to the local fallback.
3. Chat failure copy names the real cause; "connection may be down" appears only for true silence.
4. Explicit UI model picks are never silently substituted.
5. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **Changing the tier map or default models** (e.g. demoting Pro-tier agents to Flash permanently, or paying for quota) — owner/product decision; the ladder makes the system honest either way.
- **Gating the agent picker on live provider quota** (the report's alternate suggestion) — needs a quota-probe design; log as a suggestion if the executer wishes.
- **The proactive-nudge interleave** in the same QA section — PHASE-25.
- **`BMO_LLM_FAILOVER_MODEL` cross-vendor failover semantics** — untouched.
