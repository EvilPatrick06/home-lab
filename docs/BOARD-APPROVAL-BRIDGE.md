# Board Approve/Deny → originating-session bridge

> **What this is.** Each "awaiting your approve/deny" item on the BMO status board
> (🤖 Agents) can carry **✅ Approve / ✖️ Deny / ✏️ Other** buttons. A click is
> relayed back to the **agent session that posted the item** — the same
> dispatch/cowork session (id `local_<uuid>` / `cse_<…>`), resumed with its full
> context — so it implements the item (approve), closes it out (deny), or follows
> a typed correction/instruction (**✏️ Other** opens a modal; the free-form text
> is relayed verbatim). It does **not** spin up a new agent and does **not** wait
> for the next scheduled run.

This document is the **contract**: how an item carries its session id, what a click
writes, and how the dispatch-side poller consumes it. The Pi side of this is
implemented (buttons + outbox); the **poller is orchestrator-side** and must be run
where the sessions live (see "What still needs orchestrator-side work").

---

## Why a file outbox (and not a direct call)

The scheduled resolver / phase-executer agents are **dispatch/cowork sessions** that
run on the orchestrator (their `SKILL.md` task definitions live there, e.g.
`…/Claude/Scheduled/bmo-resolver/SKILL.md`). They **SSH into the Pi** to do work and
to post to the board via `bmo/pi/scripts/notify-board`. The Pi has **no** knowledge
of sessions and **no** ability to call `send_message` into one — that capability is
entirely orchestrator-side.

So the only sound bridge from a Pi button click to a session is **an artifact the
orchestrator polls**. The board writes an append-only decisions outbox on the Pi;
an orchestrator-side poller reads it and calls `send_message` into the named
session. Append-only JSONL mirrors the existing `vtt_sync_outbox.jsonl` pattern and
never races the bot's inbox writes.

```
resolver session (orchestrator) ──SSH──> notify-board set … --session-id <sid>
                                              │  (stamps board_inbox.json)
                                              ▼
        status board (Pi)  ──renders──>  ✅ Approve / ✖️ Deny on the item
                                              │  user clicks
                                              ▼
        status_board_cog  ──writes──>  board_decisions_outbox.jsonl  (item, decision[, text], sid, ts)
                                              │  (✏️ Other opens a modal first; the typed text → the "text" field)
                                              │  + removes the board entry, ephemeral confirm
                                              ▼
   dispatch-side poller (orchestrator) ──reads outbox──> send_message(sid, "user APPROVED / DENIED / <typed correction> <item>")
                                              │
                                              ▼
                          originating session resumes with full context → acts
```

---

## 1. Stamping the originating session id (producer side)

When a resolver / phase-executer posts a **WAIT-class** (gated) item to the board,
it must stamp **its own session id** so a click knows which session to resume.

`notify-board` accepts `--session-id` on `set`, and a `session_id` field on each
item in a `sync` JSON payload:

```bash
# single item
notify-board set bmo-resolver issue:1234 agent "BMO: add retry to uploader" \
  --detail "WAIT-class enhancement — implement on approve" --severity warning \
  --session-id "$CLAUDE_SESSION_ID"

# reconciled set (the producer-as-reconciler contract)
echo '[{"id":"issue:1234","category":"agent","title":"BMO: add retry to uploader",
        "detail":"WAIT-class enhancement","severity":"warning",
        "session_id":"local_abc-123"}]' \
  | notify-board sync bmo-resolver
```

**How the agent obtains its own session id.** The session id is an orchestrator
runtime value. Each resolver / phase-executer `SKILL.md` must export it into the
environment the SSH command sees (e.g. `CLAUDE_SESSION_ID`) and pass it through as
`--session-id`. The id is the **resumable** dispatch/cowork session id
(`local_<uuid>` / `cse_<…>`) — the same one the poller will `send_message` into.
A session persists and can be resumed after its run finishes.

Only items that **need an approve/deny decision** should carry a session id. Items
that are pure FYIs, or that are handled in-app (e.g. the `app-qa-tester` "permission
needed" ask), should **not** set `session_id` — they then render **without** buttons
and keep the existing in-chat path.

## 2. What a click writes (board side — implemented)

Each awaiting item carries three buttons: **✅ Approve**, **✖️ Deny**, and
**✏️ Other**. Approve/Deny record their decision immediately. **✏️ Other** opens a
Discord **modal** with a multi-line text box; when the user submits a correction
or custom instruction, that free-form text is recorded as a `decision: "other"`
line carrying a `text` field. All three buttons share the same custom_id encoding
(item key + originating session id) and the same cooldown/idempotency guard; the
modal is transient (handled in-memory), so only the buttons need persistent
registration.

On a click (or modal submit) the board (`status_board_cog.py`):

1. **Idempotency guard** — ignores a repeat decision on the same item within
   `BOARD_DECISION_COOLDOWN_S` (default 30 s), so a double-click can't double-fire.
2. **Records the decision** via `services/status_board.record_decision(...)`, which
   appends one JSON line to the outbox.
3. **Removes the entry** from `board_inbox.json` (`mark_done`) and re-renders the
   board so the item disappears immediately.
4. **Ephemerally confirms** to the clicker (and warns if no session id was recorded,
   so the decision can't be auto-relayed and must be handled in chat).

### Outbox format

- **Location:** `bmo/pi/data/board_decisions_outbox.jsonl`
  (live deploy: `/home/patrick/home-lab-deploy/bmo/pi/data/board_decisions_outbox.jsonl`).
- **Format:** append-only [JSON Lines](https://jsonlines.org/) — one decision per line.

```json
{"ts": 1782772055.52, "decision": "approve", "item_id": "issue:42", "source": "bmo-resolver", "session_id": "local_deadbeef", "title": "BMO: add retry to uploader", "decided_by": "board"}
{"ts": 1782772061.09, "decision": "other", "item_id": "issue:43", "source": "bmo-resolver", "session_id": "local_deadbeef", "title": "BMO: rotate log files", "decided_by": "board", "text": "do it, but cap retained logs at 7 days, not 30"}
```

| Field        | Meaning |
|--------------|---------|
| `ts`         | Unix epoch seconds the decision was recorded. |
| `decision`   | `"approve"`, `"deny"`, or `"other"` (a typed correction/instruction via the ✏️ Other modal). |
| `item_id`    | The board item id (stable per logical thing, e.g. `issue:1234`). |
| `source`     | Producer namespace (the agent slug, e.g. `bmo-resolver`). |
| `session_id` | **Originating session to resume** (`local_<uuid>`/`cse_<…>`), or `null` if none was stamped (then it is not auto-relayable). |
| `title`      | Human-readable item title (for the resume message + audit). |
| `decided_by` | `"board"` (a click). Lets the poller distinguish board clicks from any future producers. |
| `text`       | **Present only for `decision: "other"`** — the free-form correction/instruction the user typed in the modal, relayed into the session verbatim. Absent for approve/deny. |

## 3. Consuming the outbox (dispatch-side poller — TO BUILD, orchestrator-side)

The poller runs **where the sessions live** (the orchestrator), not on the Pi. It:

1. Tails `board_decisions_outbox.jsonl` (e.g. `scp`/`ssh cat` it from the Pi on an
   interval, or read it from the deploy checkout if the orchestrator shares the host).
2. Tracks a **cursor** (byte offset or count of lines already processed) so each line
   is delivered **exactly once** — the file is append-only, so a cursor is sufficient.
3. For each new line with a non-null `session_id`, calls `send_message` into that
   session with a message like:
   - approve → `user APPROVED "<title>" (<item_id>). Resume and implement it per your normal workflow, then mark it done.`
   - deny → `user DENIED "<title>" (<item_id>). Do not implement it; close it out (archive/note) and remove it from the board.`
   - other → `user responded to "<title>" (<item_id>) with a correction/instruction: "<text>". Resume, follow it, then mark it done.` — relay the typed `text` **verbatim**, not a yes/no. Treat it as the authoritative instruction: it may approve-with-changes, redirect scope, or ask for something different. The poller MUST read the `text` field for `other` lines (it is absent for approve/deny).
4. For a line with `session_id: null`, surfaces it for manual handling (it can't be
   auto-relayed) — including `other` lines, whose typed `text` is preserved in the
   outbox for the manual handler.

Idempotency is shared: the board's cooldown prevents duplicate **lines**; the poller's
cursor prevents duplicate **deliveries**.

## 4. The in-chat path is preserved

If the user instead decides in chat ("approve the uploader retry"), nothing about the
agents changes: the agent still removes the board entry (its next reconcile re-syncs
its namespace, dropping the resolved item) and acts. The buttons are an **additional**
fast path, not a replacement.

---

## What is implemented vs. what still needs orchestrator-side work

**Implemented on the Pi (this branch):**

- `Item.session_id` field; `load_inbox` tolerant of unknown keys (schema drift-safe).
- `is_approval_item` / `is_approval_row`, `record_decision`, `BOARD_DECISIONS` outbox.
- `notify-board` `--session-id` (and `sync` `session_id` passthrough).
- `ApproveButton` / `DenyButton` / `OtherButton` (Components-V2, matching Mute/Done/Refresh),
  rendered per awaiting item that carries a session id, with the cooldown/idempotency guard.
  `OtherButton` opens a `DecisionModal` (paragraph text input); its submit writes a
  `decision: "other"` line carrying the typed `text`.
- Tests (`tests/test_status_board_approvals.py`) + this contract doc.

**Still needs orchestrator-side work (out of this repo):**

- The **dispatch-side poller** (section 3) that reads the outbox and `send_message`s
  into the originating session. Must run where sessions live.
- Each resolver / phase-executer **`SKILL.md`** must export its session id and pass
  `--session-id` when it posts a WAIT-class item (section 1).
- **Deploy/restart** to make the buttons live on the Pi: the board cog change ships
  via the normal bmo deploy (`bmo/pi/scripts/deploy.sh` from the deploy checkout) and
  a `bmo-social-bot` restart — a separate, approved step (not done here).
