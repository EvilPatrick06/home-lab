# PHASE-18 — bmo plan-agent prompt-format crash (KeyError: 'state')

> Authored 2026-07-02 from `bmo/docs/phases/QA/QA-report-2026-07-02.md` (run 4, live deploy `4c7bcd82`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

> **Re-anchor 2026-07-15 (rule 3):** two drifts since authoring, verified against `origin/master@d6699d52`:
> 1. **Path:** `bmo/pi/agents/plan_agent.py` moved to `bmo/pi/agents/dev/plan_agent.py` (`596f7f0e`, flat `agents/` grouped into `dnd/ home/ dev/` subpackages). All file citations below read accordingly.
> 2. **18A already landed:** the log-resolver batch `a291bbd1` escaped both DESIGN_PROMPT brace literals (now `:49`/`:51` in the moved file) and added `tests/agents/test_plan_agent_prompts.py` with DESIGN/REDESIGN render tests. The F1 repro is silent at HEAD. **Remaining scope executed by this phase = the rest of 18B:** EXPLORE_PROMPT render test, the generic every-`*_PROMPT`-constant guard, and the `_design()` mocked-LLM smoke test.

## Goal

Fix the report's single **HIGH** finding: the Plan agent crashes on **every** request. Selecting the Plan agent in the chat agent picker and sending any task returns the generic "I had trouble building that plan — try a different phrasing…" bubble; the plan review/approve/cancel flow is unreachable. The server log shows an unhandled `KeyError: 'state'` from `plan_agent.py` `_design()` on every attempt.

Root cause (verified at HEAD): `DESIGN_PROMPT` embeds literal JSON example payloads with **unescaped braces** — `{state:"breathing", color:"purple", brightness:40}` and `{scene:"movie"}` — and `_design()` renders the template with `str.format()`, which interprets `{state` as a replacement field → `KeyError: 'state'` before the LLM is ever called.

This is a **regression of the same failure class fixed 2026-05-17** (Phase 39 bundle; the QA report cites `docs/logs/BMO-RESOLVED-ISSUES.md:2118-2120`). Notably, the sibling `EXPLORE_PROMPT` in the same file escapes its literal-brace example correctly (`{{"tool": …}}`), so the convention exists in-file — the endpoint-example block in `DESIGN_PROMPT` just never got it. This phase escapes the braces, audits every agent prompt template for the same latent bug, and adds the unit test whose absence let the regression ship (all plan-agent tests mock the module wholesale, so no test ever renders these templates).

PLANNING/AUTHORING ONLY. Category: **bug (high)** — auto-implement per the autonomy policy. Backend-only Python change + tests; no live-Pi mutation (INSTRUCTIONS.md rule 6); `bmo-pi-pytest.yml` is the gate.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@b1128097` (HEAD at authoring; `bmo/pi/agents/plan_agent.py` unchanged between the tested deploy `4c7bcd82` and HEAD). Re-anchor line numbers before editing (rule 3).
- **Independent of PHASE-19..21** (this batch's UX/docs phases) — disjoint files.
- **History:** `git log` shows only two commits ever touched `bmo/pi/agents/plan_agent.py`: the monorepo move (`f96bad8f`) and the Round-3 QA bundle (`eca94276`, 2026-05-17) — the same bundle that added the "Examples (Round 3 #5, 2026-05-17)" block carrying the unescaped braces. The fix and the regression shipped together; only a rendering test can keep this closed.

## Verified findings

All citations verified 2026-07-02 against `origin/master@b1128097`.

### F1 — `DESIGN_PROMPT` contains unescaped literal braces; `_design()` formats it with `str.format()` → `KeyError: 'state'` on every Plan-agent request

**Status: confirmed (High/bug).** `bmo/pi/agents/plan_agent.py`:

```python
Examples (Round 3 #5, 2026-05-17):
  - "Set LEDs to purple breathing 40%" → POST /api/leds/state with
    {state:"breathing", color:"purple", brightness:40}. NO script.      # :48-49
  - "Pause music" → POST /api/music/pause. NO script.
  - "Activate movie scene" → POST /api/scene/activate {scene:"movie"}. NO script.   # :51
```

(`plan_agent.py:47-51`, inside `DESIGN_PROMPT` which starts at `:32`.) The design phase renders it with keyword-only `format()`:

```python
prompt = DESIGN_PROMPT.format(
    task=task,
    scratchpad_context=scratchpad_context,
)
```

(`plan_agent.py:142-145`, called from the `phase == "design"` branch at `:100`.) `str.format` treats `{state:"breathing"…}` as a replacement field named `state` with a format spec → `KeyError: 'state'` — always, for any task, before any LLM call. The chat pipeline catches the exception and shows the generic failure copy, so the UI gives no hint.

Contrast the correctly escaped example in `EXPLORE_PROMPT` at `:18-20`:

```python
```tool_call
{{"tool": "tool_name", "args": {{"param1": "value1"}}}}
```
```

`REDESIGN_PROMPT` (`:80-87`) currently contains only real placeholders (`{current_plan}`, `{feedback}`) and no literal braces — fine today, but the audit in 18A covers it and any future example text.

```bash
grep -n '{state\|{scene' bmo/pi/agents/plan_agent.py          # :49 and :51 — the two unescaped literals
grep -n '\.format(' bmo/pi/agents/plan_agent.py               # :109 explore, :142 design, :166 redesign
python3 - <<'EOF'                                             # reproduce
import re
tpl = open('bmo/pi/agents/plan_agent.py').read()
src = re.search(r'DESIGN_PROMPT = """(.*?)"""', tpl, re.S).group(1)
try: src.format(task='x', scratchpad_context='')
except KeyError as e: print('KeyError:', e)                   # -> KeyError: 'state'
EOF
```

### F2 — No test renders any plan-agent prompt template, so the crash was invisible to CI

**Status: confirmed (test gap).** Every test that touches the plan agent mocks the module (`sys.modules["agents.plan_agent"] … = MagicMock()` in `tests/test_app_endpoints.py:27,91`, `tests/agents/test_base_agent.py:26,117-124`, `tests/test_canary_mode.py:37,95`). Nothing calls `DESIGN_PROMPT.format(...)` or `PlanAgent._design()`, so `bmo-pi-pytest.yml` stayed green while the Plan agent was 100% broken in production.

## Sub-phases

> Backend Python only. Cheap check per sub-phase = targeted pytest + `ruff check`. One commit at phase end (INSTRUCTIONS.md rule 5).

### 18A — Escape the literal braces in `DESIGN_PROMPT`; audit all agent prompt templates

**Objective:** every Plan-agent phase (`explore`/`design`/`redesign`) renders its prompt without raising; the example text is preserved verbatim for the LLM.

**Files:** `bmo/pi/agents/plan_agent.py` (`:49`, `:51`); audit-only pass over the other prompt templates in `bmo/pi/agents/`.

**Steps:**

1. In `DESIGN_PROMPT`, double the braces on both example payloads: `{{state:"breathing", color:"purple", brightness:40}}` and `{{scene:"movie"}}` — the rendered prompt then carries the intended single-brace JSON.
2. Audit every module in `bmo/pi/agents/` for the same pattern: for each string constant rendered via `.format(` (grep `\.format(` and walk back to its template), confirm all literal `{`/`}` are doubled. Fix any others found the same way (expect none beyond `DESIGN_PROMPT`; `EXPLORE_PROMPT` is already correct, `REDESIGN_PROMPT` has no literals today).
3. Do **not** switch the templating mechanism (e.g. to `string.Template`) in this phase — smallest-diff bug fix; the new test in 18B is the durable guard. If the executer judges the swap trivial and safe it may note it in the log as a follow-up suggestion instead (`docs/logs/BMO-SUGGESTIONS-LOG.md`).

**Cheap check:** the F1 repro snippet above now prints nothing (no `KeyError`); `ruff check` clean.

**Acceptance:** `DESIGN_PROMPT.format(task=…, scratchpad_context=…)` returns a string containing the single-braced example payloads exactly as before the 2026-05-17 bundle intended; no other template in `bmo/pi/agents/` has unescaped literal braces.

### 18B — Unit test: render every plan-agent prompt template + a `_design()` smoke test

**Objective:** CI fails if anyone ever reintroduces an unescaped brace into any plan-agent template, and `_design()` is exercised end-to-end with a mocked LLM.

**Files:** `bmo/pi/tests/agents/test_plan_agent.py` (new), following the import/mocking conventions of `tests/agents/test_base_agent.py`.

**Steps:**

1. Template-render tests: for each of `EXPLORE_PROMPT`, `DESIGN_PROMPT`, `REDESIGN_PROMPT`, call `.format()` with dummy values for exactly the intended placeholders (`task`/`tool_list`, `task`/`scratchpad_context`, `current_plan`/`feedback`) and assert (a) no exception, and (b) the rendered `DESIGN_PROMPT` contains the literal substrings `{state:"breathing"` and `{scene:"movie"}` (proving the examples survive rendering as single-brace text).
2. `_design()` smoke test: construct a `PlanAgent` with `llm_call` and the scratchpad mocked (per the `test_base_agent.py` fixture pattern), call `run("add a header comment", [], {"phase": "design"})`, and assert an `AgentResult` comes back with the mocked reply text and a `Plan` scratchpad write — i.e. the KeyError path is dead.
3. Optionally parametrize a generic guard: for every module-level `*_PROMPT` constant in `plan_agent.py`, `.format(**{name: "x" for name in _extract_fields(tpl)})` must not raise — this future-proofs against new templates in this file.

**Cheap check:** `python -m pytest tests/agents/test_plan_agent.py -q` (from `bmo/pi/`) — green after 18A, and red if 18A's escaping is reverted (verify once by stashing the fix).

**Acceptance:** new test file passes; reverting the 18A escaping makes it fail; full `python -m pytest` stays green.

## Test plan

- **18A:** F1 repro snippet silent; `ruff check` clean; no behavioral change outside the rendered prompt text.
- **18B:** `tests/agents/test_plan_agent.py` green, full suite green, `bmo-no-new-prints` clean (use no `print()`).
- **Live verification** rides the owner-run deploy: pick Plan agent, send any task, expect a structured plan + the review/approve UI instead of the failure bubble. Not performed by the executer (rule 6).

## Acceptance criteria

1. The Plan agent's design phase renders its prompt without `KeyError` for any task string; the endpoint examples appear single-braced in the rendered prompt.
2. All three plan-agent prompt templates have render tests; `_design()` has a mocked-LLM smoke test; the suite fails if unescaped braces are reintroduced.
3. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **Friendlier failure copy in the chat bubble** when an agent throws (the generic "I had trouble building that plan…" hides the real error class) — worth a log entry (`docs/logs/BMO-SUGGESTIONS-LOG.md`), not this fix.
- **Switching prompt templating away from `str.format`** — see 18A step 3.

## Completed

- **18A** — already landed pre-phase via the log-resolver batch `a291bbd1` (braces escaped at `bmo/pi/agents/dev/plan_agent.py:49,51`; F1 repro silent). Re-verified 2026-07-15 at `origin/master@d6699d52`; audit re-run across `bmo/pi/agents/`: every `.format()`-rendered template (router `CLASSIFICATION_PROMPT`, all `dev/*` `SYSTEM_PROMPT`s, code_agent, plan_agent x3) renders cleanly. Note: `agents/home/{calendar,smart_home,timer,weather,music}_agent.py` `SYSTEM_PROMPT`s contain unescaped literal braces but are never `.format()`ed (used raw) — no defect today; logged as a latent-footgun suggestion in `docs/logs/BMO-SUGGESTIONS-LOG.md`.
- **18B** — completed the test coverage in `bmo/pi/tests/agents/test_plan_agent_prompts.py` (DESIGN/REDESIGN render tests pre-existed from `a291bbd1`): added `test_explore_prompt_formats_cleanly` (EXPLORE example survives as single-brace JSON), `test_every_prompt_constant_formats_cleanly` (generic guard over every module-level `*_PROMPT` via `string.Formatter`), and `test_design_smoke_no_keyerror` (`_design()` end-to-end with mocked LLM + scratchpad: `AgentResult.text`, `scratchpad_writes=["Plan"]`, rendered system prompt carries the single-braced examples). Negative check performed: un-escaping one brace fails 3/5 tests; restored, 5/5 green, ruff clean.
