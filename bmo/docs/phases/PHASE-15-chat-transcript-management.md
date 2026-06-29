# PHASE-15 — bmo chat transcript management affordance (discoverable clear + per-message delete)

> Authored 2026-06-29 from `bmo/docs/phases/QA/QA-report-2026-06-28-3.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Give the dashboard chat a **discoverable** way to manage its transcript. The third 2026-06-28 QA pass (run 3) found the rendered chat scrollback polluted with repeated `Hello from BMO!` fixture-seed lines and stacked `QA-PROBE…/(interrupted — try asking again)` rows from prior probe runs, and noted there is **no per-message delete and no visible "clear chat" control** in the UI — so noise accumulates and a viewer can be misled into thinking the agent is replying.

Two parts, both **frontend-led, small backend**:

1. **Surface the existing clear-chat capability as a button.** A `/api/chat/clear` endpoint already exists (`routes/chat_api.py:714`) and broadcasts `chat_cleared` to every tab (`bmo.js:968`), but it is reachable **only** by typing the `/clear` slash command (`bmo.js:1266`, `handleSlashCommand`) — there is no visible affordance in the chat header, so the capability is undiscoverable. Add a small, confirm-guarded "clear chat" control to the chat tab that reuses the existing endpoint/broadcast.
2. **Add per-message delete.** Provide a per-row delete affordance (mirroring the lists/notes delete pattern already in the dashboard) backed by a small, bounded backend that removes a single persisted message from `recent_chat.json` — so probe/seed rows can be pruned individually without nuking the whole history.

The fixture-seed/orphan-stub **noise itself** is already addressed on master by PHASE-09 09C (the load-time orphan-stub sweep + the display loader `load_recent_chat_for_display`), which is merged but not yet deployed to the live process the report tested — so this phase does **not** re-do that hygiene; it adds the **user-facing management controls** 09C did not.

PLANNING/AUTHORING ONLY. The executer ships in-repo JS/HTML/Python + tests; it does **not** restart the live Pi, deploy, or hand-edit the live `recent_chat.json` (rule 6).

## Dependencies & cross-phase notes

- **Builds on PHASE-09 09C (merged), does not duplicate it.** 09C added `_is_orphan_stub`, `load_recent_chat_for_display`, and `sweep_orphan_stubs` to `services/chat_history.py` and routed `/api/chat/history` + the startup restore through the display loader, so never-completed assistant stubs and the `Hello from BMO!` placeholders no longer render once master is deployed. **This phase adds management controls (clear button + per-message delete), not more automatic pruning** — keep the two concerns separate. The report's "seed/probe noise" symptom is the not-yet-deployed 09C; the report's "no clear affordance / no per-message delete" is the genuine new gap fixed here.
- **Backend clear already exists — reuse, don't re-implement (15A).** `/api/chat/clear` (`chat_api.py:714-789`) already saves an active D&D session, clears `recent_chat.json` + the agent's `conversation_history`, and emits `chat_cleared`; `bmo.js` already has the `chat_cleared` socket handler (`:968`) and the `/clear` path (`:1266`). 15A is a **frontend** button wired to the same flow — no new clear endpoint.
- **Per-message delete is a NEW small endpoint (15B).** There is no per-message delete today; 15B adds one bounded, validated route (delete-by-id/index) plus the persistence helper in `chat_history.py` and the row affordance in the chat template. Mirror the existing notes/lists delete UX (`index.html:275` `deleteNote`, the list-row delete) for consistency.
- **Live-Pi boundary (rule 6):** no `systemctl`, no deploy, no hand-edit of the live `recent_chat.json`. Verified by pytest (endpoint) + a frontend/diff review; the live transcript is cleaned by the owner deploy of merged master (09C sweep) and thereafter by the new controls.

## Verified findings

All citations verified 2026-06-29 against `origin/master@d9dccc65`. Chat backend: `bmo/pi/routes/chat_api.py`, `bmo/pi/services/chat_history.py`. Chat frontend: `bmo/pi/web/templates/index.html` (chat tab), `bmo/pi/web/static/js/bmo.js`.

### F1 — Clear-chat works but is undiscoverable: only the `/clear` slash command triggers it; no button in the chat UI

**Status: confirmed.** The backend is complete: `@chat_bp.route("/api/chat/clear", methods=["POST"])` (`chat_api.py:714`) clears `recent_chat.json` (`:750-751`), clears `agent.conversation_history` (`:769`), and broadcasts `chat_cleared` (`:777`); the frontend has the matching `socket.on('chat_cleared', …)` handler that splices `messages` empty (`bmo.js:968-975`). But the **only** caller is the typed slash command: `handleSlashCommand('/clear')` (`bmo.js:1266`, dispatched from `sendChat()` at `bmo.js:1215`) `fetch('/api/chat/clear', …)` (`bmo.js:1273`). The chat tab markup (`index.html:289`…) has **no** button bound to that flow — the header carries only the agent-indicator bar, the plan-mode panel, the player selector, and the agent/model picker. So a user with a noisy transcript has no visible way to clear it.

```bash
sed -n '707,789p' bmo/pi/routes/chat_api.py                  # /api/chat/history + /api/chat/clear (exists; broadcasts chat_cleared)
sed -n '964,976p'  bmo/pi/web/static/js/bmo.js               # chat_cleared socket handler (exists)
sed -n '1266,1286p' bmo/pi/web/static/js/bmo.js              # handleSlashCommand('/clear') → fetch /api/chat/clear (only caller)
grep -n "chat/clear\|clearChat\|Clear chat\|chat_cleared" bmo/pi/web/templates/index.html   # (none) — no UI button
```

### F2 — No per-message delete exists (backend or frontend), so individual probe/seed rows can't be pruned

**Status: confirmed.** `chat_api.py` exposes `history` (GET, `:707`), `clear` (POST, `:714`), and `compact` (POST, `:789`) — there is **no** per-message delete route. `chat_history.py` has `save_*`, `load_recent_chat[_for_display]`, `finalize_pending_assistant`, and `sweep_orphan_stubs`, but **no** "delete one message" helper. In the chat template, each row is rendered read-only by the `x-for="(msg, i) in messages"` loop (`index.html:333`) with no delete control — unlike notes (`deleteNote(note.id)` button, `index.html:275`) and list rows, which do have per-item delete. So short of clearing everything (F1) there is no way to remove a single misleading row (e.g. a `Hello from BMO!` seed line that survives outside the 09C orphan-stub definition, or one stray probe).

```bash
grep -n "@chat_bp.route" bmo/pi/routes/chat_api.py | grep -i "chat"   # history/clear/compact only — no delete
grep -n "^def \|def delete\|def remove" bmo/pi/services/chat_history.py | grep -i "delete\|remove"   # (none)
sed -n '332,356p' bmo/pi/web/templates/index.html           # chat row template — read-only, no per-row delete
sed -n '275,275p' bmo/pi/web/templates/index.html           # notes deleteNote button — the per-item pattern to mirror
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the no-new-prints guard) — use the module logger for any new line.

### 15A — Add a discoverable, confirm-guarded "clear chat" control to the chat tab

**Objective:** the chat tab shows a small visible control that clears the transcript via the **existing** `/api/chat/clear` flow (including the D&D-session-save + `chat_cleared` broadcast), so the capability is no longer hidden behind a typed slash command.

**Files:** `bmo/pi/web/templates/index.html` (chat tab), `bmo/pi/web/static/js/bmo.js` (a thin `clearChat()` action if one isn't reused), `bmo/pi/tests/` (frontend smoke only if a harness exists; else diff-reviewed).

**Steps:**

1. Add a small "clear chat" affordance to the chat tab header region (`index.html:289`…) — e.g. a trash/✕ icon button in an unobtrusive spot (near the agent/model picker row), styled like the existing muted controls. Give it an `aria-label`/`title` ("Clear chat") and a ≥44px touch target to match the dashboard's existing affordances (the notes delete button at `:275` is the reference for size/markup).
2. Wire it to a **confirmation** then the existing flow: reuse `handleSlashCommand('/clear')` or factor its body into a `clearChat()` method (`bmo.js`) that `fetch('/api/chat/clear', {method:'POST'})` and lets the `chat_cleared` broadcast (`bmo.js:968`) do the actual `messages` reset — do **not** add a second clearing path. A lightweight in-SPA confirm (not a raw `window.confirm` if the dashboard has a nicer pattern) guards accidental taps; on a saved D&D session, surface the existing "Campaign session saved!" note the slash path already shows (`bmo.js:1273-1280`).
3. Keep it hidden/disabled when there is nothing to clear if that matches existing dashboard conventions; otherwise always-visible is fine. No backend change.

**Cheap check:** `cd bmo/pi && ruff check` (no Python change expected) + read the diff; if a JS/template test harness exists, assert the button invokes the clear action exactly once and does not locally reassign `messages` (the broadcast owns the reset).

**Acceptance:** the chat tab has a visible, confirm-guarded clear control that clears via `/api/chat/clear` and the `chat_cleared` broadcast (single path), preserving the D&D-save behavior; no second clearing code path is introduced.

### 15B — Per-message delete (bounded backend route + per-row affordance)

**Objective:** a user can remove a single chat row from the persisted transcript via a per-message delete control, without clearing the whole history.

**Files:** `bmo/pi/routes/chat_api.py`, `bmo/pi/services/chat_history.py`, `bmo/pi/web/templates/index.html` (chat row), `bmo/pi/web/static/js/bmo.js`, `bmo/pi/tests/test_chat_api.py` (+ chat-history test).

**Steps:**

1. **Backend helper.** Add a bounded `delete_recent_message(...)` to `chat_history.py` that removes one message from `recent_chat.json` by a stable identifier — prefer a message `id`/`ts` match over a bare index (indices shift); if rows lack a stable id today, match on `(ts, role)` and delete the first exact match. Mirror `save_recent_message`'s pytest-guard (`chat_history.py:88-106`) so the live store is never written under tests, and reuse the same atomic write pattern.
2. **Backend route.** Add `@chat_bp.route("/api/chat/message/<...>", methods=["DELETE"])` (or a `POST /api/chat/message/delete` with a JSON body) that validates the identifier, calls the helper, and — for cross-tab consistency — emits a small `chat_message_deleted` event (mirroring `chat_cleared`) so other tabs drop the row too. Apply the same rate-limit/decorator conventions the sibling chat routes use. Return a handled JSON result (404 if the id isn't found, not a 500).
3. **Frontend.** Add a per-row delete control to the chat message template (`index.html:333` loop) — a small ✕ on hover/long-press, sized like `deleteNote` (`:275`) — that calls a `deleteMessage(msg)` action (`bmo.js`) hitting the new route; on success let the `chat_message_deleted` broadcast remove it from `messages` (single path, like 15A). Keep it out of the way for `progress`/`ambient`/system rows if deleting those is meaningless.
4. **Tests:** `tests/test_chat_api.py` — deleting an existing message removes exactly that row from the persisted store and returns success; an unknown id returns a handled 404; the pytest store-write guard holds (no live write). `tests/test_chat_history.py` — `delete_recent_message` removes the matched row and preserves the rest.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_chat_api.py tests/test_chat_history.py -q && ruff check routes/chat_api.py services/chat_history.py`.

**Acceptance:** a single chat message can be deleted via the new route + per-row control; the persisted transcript loses exactly that row; an unknown id is handled (404, not 500); other tabs drop the row via the broadcast; tests cover delete + not-found + store-guard.

## Research notes

- **Reuse the clear path; don't fork it (15A).** A second clearing code path (a button that locally empties `messages` separately from `/api/chat/clear`) would drift from the slash-command path and the cross-tab `chat_cleared` broadcast — the same single-source-of-truth lesson the `chat_cleared` handler comment records (`bmo.js:964-967`, "broadcast so every connected tab refreshes"). The button is just a discoverable entry point to the existing flow.
- **Delete by stable id, not index (15B).** A delete-by-array-index race-shifts when concurrent appends or another tab's delete change the ordering; matching a message `id`/`ts` is stable. If no id exists, the minimal addition is a per-message `id` at save time (or a `(ts, role)` match as the interim) — keep it small and bounded, and never trust a client-supplied index as an offset into the live file.
- **Mirror the existing per-item delete UX (15B).** Notes and list rows already have per-item delete affordances (`deleteNote` at `index.html:275`); matching their markup/size/`aria-label` keeps the chat delete consistent and touch-friendly (≥44px) without inventing a new interaction.
- **Don't re-solve 09C's hygiene.** The seed/orphan noise the report saw is the not-yet-deployed PHASE-09 09C sweep; adding more automatic pruning here would duplicate it. This phase is strictly the *manual management controls* (clear button + per-row delete) the report asked for and 09C did not provide.

## Test plan

- **15A** — diff/markup review (and a JS/template smoke assertion if a harness exists): the chat tab exposes a confirm-guarded clear control that calls `/api/chat/clear` once and relies on the `chat_cleared` broadcast for the reset; no second clearing path.
- **15B** — `tests/test_chat_api.py`: delete-existing → row removed + success; delete-unknown → handled 404; pytest store-write guard holds. `tests/test_chat_history.py`: `delete_recent_message` removes the matched row, preserves the rest.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + the no-new-prints / docker / codeql guards are the gate. No live-Pi restart / deploy / `recent_chat.json` hand-edit (rule 6).

## Acceptance criteria

- [ ] The chat tab has a visible, confirm-guarded "clear chat" control that clears via the existing `/api/chat/clear` + `chat_cleared` broadcast (single path), preserving the D&D-session-save behavior.
- [ ] A single chat message can be deleted via a new bounded `DELETE`/POST route + a per-row affordance; the persisted transcript loses exactly that row; an unknown id is handled (404, not 500); other tabs drop the row via a broadcast.
- [ ] No second clearing/deleting code path duplicates the existing flow; delete matches a stable id (not a bare index).
- [ ] The PHASE-09 09C orphan-stub hygiene is **not** modified or duplicated.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Re-doing the fixture-seed / orphan-stub pruning** — already shipped on master as PHASE-09 09C (`load_recent_chat_for_display` / `sweep_orphan_stubs`), merged and awaiting deploy. This phase adds management controls only.
- **The chat-agent outage itself** (`/api/chat` 500 / agent `None`) — **already planned and merged as PHASE-09** (the `sys.modules["app"]` alias + `_app()` belt + None-agent guards); the run-3 live 500 is **deploy-lag** (the tested process `f51d9dc3` predates the merge). Re-verification is an owner deploy of merged master, not a new phase (see PHASE-INDEX provenance).
- **A full conversation editor / multi-select / export** — larger product surface; this phase is the single-row delete + a clear button the report named.
- **Hand-editing the live `recent_chat.json`, restarting, or deploying the Pi** — owner/infra, live-Pi data (rule 6).
