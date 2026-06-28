# PHASE-07 — bmo list-endpoint request-parsing robustness

> Authored 2026-06-24 from `bmo/docs/phases/QA/QA-report-2026-06-24-4.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the list-endpoint robustness bug from the fourth QA pass: **`POST /api/lists/<name>/items/<id>/check` (and `/clear`) return a raw `415 Unsupported Media Type` when the request omits a JSON `Content-Type`, instead of defaulting the body or returning a clean `400`.** The handlers do `data = request.json or {}`; Flask's `request.json` (non-silent) **raises 415 *before* the `or {}` fallback can run** whenever the request mimetype isn't `application/json`. There is no user impact today — the only caller (`bmo.js:4526`) always sends the JSON header — but it is a brittle contract: any future caller (a curl probe, a "toggle done" tile that POSTs no body, a third-party script) gets a confusing 415 rather than the intended `{done: true}` default. The fix is the standard `request.get_json(silent=True) or {}`, which returns `None` (→ `{}`) on a missing/!json body instead of raising.

This phase is **server-side Python only** (`bmo/pi/app.py`, pytest). No frontend change — the dashboard's existing callers already send the JSON header and keep working unchanged; this only makes the endpoints tolerant of bodyless/non-JSON callers.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@3c89d787` (the QA pass tested `53163f4b`; the cited handlers are byte-identical at `3c89d787` — verified below).
- **Independent of all other pending phases.** Touches only the three list handlers in `app.py`; disjoint from PHASE-04/05/06's files; any order.
- **Scope discipline (rule 12):** `request.json or {}` appears **58×** across `app.py`. This phase fixes the **list surface** the QA flagged (check + clear) plus its immediate sibling (add-item) for a coherent "list endpoints parse robustly" outcome — it does **not** sweep all 58 sites. The repo-wide pattern is real but most other callers always send the JSON header; the executer should **log** the broader sweep as a follow-up to `docs/logs/BMO-SUGGESTIONS-LOG.md` (per rule 12) rather than expand this phase's scope into every route.

## Verified findings

All citations verified 2026-06-24 against `origin/master@3c89d787`.

### F1 — `api_list_check_item` raises 415 on a non-JSON body instead of defaulting `{done: true}`

**Status: confirmed.** `api_list_check_item` (`app.py:2289-2299`) does `data = request.json or {}` (`:2294`) then `done = data.get("done", True)`. Flask's `request.json` is the **non-silent** accessor: on a POST whose `Content-Type` is not `application/json` it raises `werkzeug.exceptions.UnsupportedMediaType` (HTTP 415) *before* `or {}` runs. So a bodyless check fails outright rather than defaulting `done=True`.

```bash
sed -n '2289,2299p' bmo/pi/app.py      # check handler: data = request.json or {}; done = data.get("done", True)
```

### F2 — `api_list_clear` has the same `request.json or {}` shape

**Status: confirmed.** `api_list_clear` (`app.py:2301-2310`) does `data = request.json or {}` (`:2306`) then `done_only = data.get("done_only", False)`. Same 415-before-fallback: a bodyless `POST …/clear` 415s instead of clearing all (its documented default `done_only=False`).

```bash
sed -n '2301,2310p' bmo/pi/app.py      # clear handler: data = request.json or {}; done_only = data.get("done_only", False)
```

### F3 — `api_list_add_item` returns a 415 (not its own clean 400) for a bodyless/non-JSON POST

**Status: confirmed.** `api_list_add_item` (`app.py:2266-2276`) does `data = request.json or {}` (`:2271`), then `text = data.get("text", "").strip()` and returns a clean `400 {"error": "Item text required"}` when empty (`:2273-2274`). But a POST with no JSON `Content-Type` 415s at `:2271` and **never reaches** that intentional 400 — so the same caller gets an opaque 415 instead of the handler's own clear "text required" message. (The list **create** `POST /api/lists` at `:2232` legitimately requires a JSON body too, but is out of the QA-flagged item surface; F3 is included because it is the same list-item surface and the same one-line fix yields the handler's *existing* 400.)

```bash
sed -n '2266,2276p' bmo/pi/app.py      # add-item: data = request.json or {}; 400 "Item text required" unreachable on 415
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the `no-new-prints` guard).

### 07A — Make list check/clear tolerate a bodyless / non-JSON POST

**Objective:** `POST …/items/<id>/check` and `POST …/clear` fall back to their documented defaults (`done=True`, `done_only=False`) when no JSON body is sent, instead of raising 415.

**Files:** `bmo/pi/app.py`, `bmo/pi/tests/test_app_endpoints.py`.

**Steps:**

1. In `api_list_check_item` (`app.py:2294`), replace `data = request.json or {}` with `data = request.get_json(silent=True) or {}`. Behavior is identical for the existing JSON caller; a bodyless/non-JSON POST now yields `{}` → `done = True` (the documented default in the docstring `Body: {done: bool}`).
2. In `api_list_clear` (`app.py:2306`), make the same change. A bodyless POST now yields `{}` → `done_only = False` (clear all), matching the docstring `Body: {done_only: bool}`.
3. Do **not** change the success/404 returns or the `list_service` None-guard — only the body parse.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_app_endpoints.py -q && ruff check app.py`.

**Acceptance:** `check`/`clear` return 200 with the documented default when called with no body / no JSON header; the existing JSON-header callers behave exactly as before.

### 07B — Make list add-item surface its own 400 instead of a 415

**Objective:** a bodyless / non-JSON `POST …/items` reaches the handler's existing `400 {"error": "Item text required"}` rather than a raw 415.

**Files:** `bmo/pi/app.py`, `bmo/pi/tests/test_app_endpoints.py`.

**Steps:**

1. In `api_list_add_item` (`app.py:2271`), replace `data = request.json or {}` with `data = request.get_json(silent=True) or {}`. A bodyless/non-JSON POST now parses to `{}` → empty `text` → the handler's existing `400 {"error": "Item text required"}` (`:2273-2274`), a clear, intentional error instead of an opaque 415.
2. Leave the rest of the handler unchanged — the `text` required-check and `list_service.add_item` call already do the right thing once `data` is a dict.
3. **Log the broader pattern (rule 12), don't sweep it here:** append a `docs/logs/BMO-SUGGESTIONS-LOG.md` entry noting `request.json or {}` is used 58× in `app.py` and the same `get_json(silent=True)` hardening could be applied repo-wide as a future sweep — out of this phase's scope.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_app_endpoints.py -q && ruff check app.py`.

**Acceptance:** a bodyless/non-JSON add-item POST returns the handler's `400 "Item text required"`, not a 415; a valid JSON add-item still returns the created item.

## Research notes

- **`request.json` vs `request.get_json(silent=True)` (the actual root cause):** Werkzeug/Flask's `request.json` property is *strict* — it calls `get_json()` with `silent=False`, which raises `UnsupportedMediaType` (415) when the request mimetype is not JSON, and `BadRequest` (400) on malformed JSON. The `or {}` idiom is a no-op against those exceptions because they fire *during* the property access, before `or` is evaluated. `get_json(silent=True)` returns `None` instead of raising, so `... or {}` then yields the intended empty-dict default. This is the canonical Flask pattern for "optional JSON body with defaults".
- **Why default-on-empty is correct for check/clear, but a clean 400 is correct for add-item:** check (`{done: true}` default) and clear (`{done_only: false}` default) have *sensible* zero-body semantics — toggle done, clear everything — so defaulting is the right behavior. Add-item has *no* sensible zero-body semantics (an item needs text), so the right outcome is the handler's own explicit `400 "Item text required"`, which the same one-line fix unlocks by letting control reach it.
- **No frontend coupling:** `bmo.js`'s `checkListItem`/`removeListItem` (`bmo.js:4519`, `:4524` per the QA report) already send `DELETE` and `POST + Content-Type: application/json + {done}`; this phase strictly *widens* what the server accepts, so every existing client path is unaffected.

## Test plan

- **07A** — `tests/test_app_endpoints.py`: `POST /api/lists/<n>/items/<id>/check` with **no** `Content-Type`/body → 200 and the item flips `done=True` (mock `list_service.check_item`); same call **with** the JSON header + `{done:false}` → 200, `check_item(..., False)`; `POST …/clear` with no body → 200 and `clear_list(name, done_only=False)`.
- **07B** — `tests/test_app_endpoints.py`: `POST /api/lists/<n>/items` with no body/header → `400 {"error":"Item text required"}` (not 415); with `{text:"milk"}` JSON → 200 and `add_item(name,"milk")`.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + guards are the authoritative gate. No live-Pi deploy / restart (rule 6).

## Acceptance criteria

- [ ] `POST …/items/<id>/check` and `POST …/clear` return 200 with documented defaults on a bodyless / non-JSON request (no 415); existing JSON callers unchanged.
- [ ] `POST …/items` (add-item) returns the handler's `400 "Item text required"` on a bodyless / non-JSON request, not a 415; valid JSON still creates the item.
- [ ] Broader 58-site `request.json or {}` pattern logged to `docs/logs/BMO-SUGGESTIONS-LOG.md` as a follow-up (not swept in this phase).
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Sweeping all 58 `request.json or {}` sites in `app.py`** — logged as a follow-up suggestion (07B step 3); most other callers always send the JSON header, so a repo-wide sweep is a separate, larger change.
- **The list create `POST /api/lists` body contract** — legitimately requires a JSON body; not a QA-flagged item-surface finding.
- **Frontend list UX** (row affordances, touch targets) — that was PHASE-06's surface; this phase is server-side parse robustness only.
- **List id-vs-text matching** — already fixed and verified live in `QA-report-2026-06-24-4.md` §1 (`services/list_service.py` `_find_item`); not re-planned.

## Completed

- **07A** (2026-06-28) — `api_list_check_item` and `api_list_clear` (`bmo/pi/app.py`) switched `request.json or {}` → `request.get_json(silent=True) or {}`, so a bodyless / non-JSON POST falls back to the documented defaults (`done=True`, `done_only=False`) instead of raising 415. Existing JSON callers unchanged.
- **07B** (2026-06-28) — `api_list_add_item` got the same parse fix, so a bodyless / non-JSON POST now reaches the handler's existing `400 {"error":"Item text required"}` rather than an opaque 415; a valid `{text}` JSON still creates the item. Logged the broader ~55-site `request.json or {}` pattern as a follow-up sweep in `docs/logs/BMO-SUGGESTIONS-LOG.md` (rule 12) rather than expanding scope. _Note:_ the parametrized edit initially matched `api_notes_create` (identical two-line shape) first; caught via diff review, reverted that out-of-scope change, and re-targeted the add-item handler by its unique 400 message.

_Cheap checks: `pytest tests/test_app_endpoints.py` 68 passed (5 new in `TestListEndpointRequestRobustness`); `ruff check app.py` clean. Diff verified to touch only the three list handlers._

