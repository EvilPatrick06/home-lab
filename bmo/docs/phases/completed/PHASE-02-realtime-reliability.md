# PHASE-02 — bmo realtime reliability over Cloudflare

> Authored 2026-06-24 from `bmo/docs/phases/QA/QA-report-2026-06-24.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Make the realtime surface fail **loudly and recoverably** when socket.io event delivery breaks over the Cloudflare path, and verify/repair the websocket-upgrade pipeline so it doesn't break in the first place. The 2026-06-24 QA pass found that over the external URL (`https://bmo.mybmoai.work`) socket.io never upgrades past HTTP long-polling, and the two features that depend on socket.io **event delivery** silently hang: **external chat** (a sent message never reaches `on_chat_message`, so the UI sits on "BMO is thinking!" forever with the input disabled and no timeout) and the **IDE terminal** (PTY never connects; status reads "Offline" with a blank pane). Plain HTTP endpoints work on both paths, which isolates the failure to the realtime/WS channel.

Two workstreams: **(1) graceful degradation in the frontend** — a chat send-watchdog that clears the stuck "thinking" state and offers retry, an explicit "terminal offline — reconnecting" state in the IDE, and the music-search `res.ok` guard so a backend 500 (PHASE-01 territory) surfaces as a handled error instead of an uncaught `SyntaxError`; and **(2) repair the transport** — verify the websocket upgrade is actually available end-to-end (socket.io server config + the Cloudflare tunnel ingress) and document the LAN re-verification the QA flagged as the missing data point.

PLANNING/AUTHORING ONLY. The Cloudflare tunnel config and any `systemctl`/deploy live on the Pi and are **not** the executer's to mutate (INSTRUCTIONS.md rule 6) — this phase ships the in-repo code + a precise verification/repair runbook, and surfaces the tunnel change as a documented owner step.

## Dependencies & cross-phase notes

- **No prerequisite phases**, but pairs with **PHASE-01**: the music-search `res.ok` guard (02D) assumes PHASE-01's 503/structured payloads exist for the *down-service* case, and the calendar "show an error state" idea referenced by QA §6 is split — PHASE-01 returns the structured payload, PHASE-02/03 render it. Independent files; prefer PHASE-01 first so the frontend has a clean contract to branch on.
- **PHASE-03 (dashboard UX round)** owns the cross-cutting **poll backoff** (the global `setInterval` storms). This phase adds *behavioural* recovery (watchdogs, reconnect status); the polling-rate work is PHASE-03. Keep 02's edits to the chat/IDE/socket lifecycle so 03's polling-loop edits don't collide.
- **Live-Pi / infra boundary:** the socket.io websocket upgrade depends on the Cloudflare tunnel ingress (`/etc/cloudflared/config.yml` on the Pi) and the Access layer — infra the executer must **not** edit live. 02E is a *verification runbook + in-repo doc*, not a tunnel edit. If the in-repo server-side socket.io config needs a change (02E step 2), that ships in code and the gate covers it; the tunnel/Access change is an owner action with exact commands provided.

## Verified findings

All citations verified 2026-06-24 against `origin/master@d0974250`. The dashboard JS is `bmo/pi/web/static/js/bmo.js` (**4,451 lines**); the standalone IDE is `bmo/pi/web/static/ide/ide.js`; the socket.io server is created in `bmo/pi/app.py`; the chat handler is `bmo/pi/routes/realtime_ws.py`.

### F1 — External chat hangs forever: the message never reaches `on_chat_message`, and there is no client watchdog

**Status: confirmed.** `sendChat()` (`bmo.js:1120-1143`) optimistically pushes the user bubble, sets `this.status = 'thinking'`, and `this.socket.emit('chat_message', payload)` — then returns. There is **no timeout**. The thinking state is cleared *only* by an inbound socket event: the `chat_response` handler (`bmo.js:708-740`) sets `status` to `yapping`/`code_*` and schedules `status = 'idle'`. So if the emit is dropped (the QA-observed case: socket.io stuck on `transport=polling`, multiple session IDs, a stale-session `400` on a polling GET), no `chat_response` ever arrives → the input stays disabled showing "BMO is thinking!" (placeholder/label at `bmo.js:2861`) until a full page reload. Server-side, `on_chat_message` (`realtime_ws.py:175-269`) **saves the user turn as its very first action** (`chat_history.save_chat_message(user_msg)`, line 199); QA confirmed the message is absent from `/api/chat/history`, so the handler never ran — the event was dropped in transit, not failed in handling.

```bash
sed -n '1120,1143p' bmo/pi/web/static/js/bmo.js   # sendChat: emit + status='thinking', no timeout
sed -n '708,740p' bmo/pi/web/static/js/bmo.js      # chat_response is the ONLY thing that clears thinking
sed -n '193,200p' bmo/pi/routes/realtime_ws.py     # handler saves user msg first → absence proves non-delivery
```

### F2 — IDE terminal never connects ("Offline", blank PTY) — same realtime substrate

**Status: confirmed.** The IDE rides the same socket.io channel. `ide.js:81` does `socket = io();` and wires `connect` → status dot `online` (`ide.js:83-87`) and `disconnect` → `offline` + label "Offline" (`ide.js:89-92`). Terminal data arrives via `terminal_output` (`ide.js:95`). When the socket never establishes/upgrades over Cloudflare, the status stays "Offline" and the terminal pane stays blank (PTY channel never opens), while plain HTTP IDE calls (`POST /api/ide/file/read`) work — confirming the failure is the WS/realtime channel, identical to F1. QA's console showed `[ide] Socket.IO initialized` with no follow-up connect.

```bash
sed -n '76,100p' bmo/pi/web/static/ide/ide.js   # io(); connect→online, disconnect→Offline, terminal_output
```

### F3 — socket.io stays on HTTP long-polling over the external URL (no WS upgrade)

**Status: confirmed; substrate of F1/F2.** QA captured all `/socket.io/` traffic as `transport=polling` with no upgrade, multiple session IDs, and a stale-session `400`. The server *has* the WS dependency: `gevent-websocket==0.10.1` is pinned (`bmo/pi/requirements.txt:118`, `requirements-ci.txt:102`) and `simple-websocket==1.1.0` is present (`requirements.txt:368`), and the server is single-process gevent (`socketio = SocketIO(app, async_mode=_sio_mode, cors_allowed_origins="*")`, `app.py:401`, with `_sio_mode="gevent"` in prod, `app.py:395-401`). So sticky-session multiplexing across workers is **not** the cause (one worker). That points the finger at the **Cloudflare tunnel / Access layer not completing the WS upgrade** (or the client not attempting it through Access). The tunnel ingress is documented at `bmo/docs/CLOUDFLARE_TUNNEL_SETUP.md` (ingress → `http://localhost:5000`, Access JWT validation), but that doc says nothing about websocket support — the gap this phase closes. QA explicitly could **not** re-verify on the LAN path (`http://bmo.local:5000`), where the upgrade likely works; that re-verification is the decisive missing datum.

```bash
grep -n "gevent-websocket\|simple-websocket" bmo/pi/requirements.txt    # 118, 368 — WS deps present
grep -n "SocketIO(\|_sio_mode\|async_mode" bmo/pi/app.py                # 395-401 — gevent, single process
grep -n "ingress\|websocket\|service:\|5000" bmo/docs/CLOUDFLARE_TUNNEL_SETUP.md  # no WS mention
```

### F4 — Music search throws an uncaught `SyntaxError` parsing the 500 page as JSON

**Status: confirmed.** `searchMusic()` (`bmo.js:1437-1461`) does `this.musicResults = await res.json();` (and the playlists branch likewise) with **no `res.ok` / content-type check**. When `/api/music/search` returns the 500 HTML page (PHASE-01 F2; once PHASE-01 lands it's a 503 JSON, but a 5xx is still not a results array), `res.json()` throws `SyntaxError: Unexpected token '<'` — QA saw this as an **uncaught** promise rejection plus an Alpine expression error, so the failure surfaces as console noise with no user-facing "search failed". (This is the frontend half of the Music finding; PHASE-01 fixes the backend half.)

```bash
sed -n '1437,1461p' bmo/pi/web/static/js/bmo.js   # res.json() with no res.ok guard
```

## Sub-phases

> Frontend JS has no unit-test harness in this repo; the parse/lint gate for `bmo.js`/`ide.js` edits is `ruff`-equivalent-free — keep edits surgical and self-contained, and verify behaviour by reading the diff + the cited handlers. Server-side socket.io config changes (02E step 2) are covered by `tests/test_realtime_ws.py` and the `bmo-pi-pytest.yml` gate. Do not add bare `print()` (Python) — use the logger.

### 02A — Chat send watchdog: clear the stuck "thinking" state + offer retry

**Objective:** after a bounded wait with no `chat_response`, the composer recovers — shows a retryable error and re-enables — instead of hanging forever.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In the Alpine component state, add a watchdog handle field near `status` (`bmo.js:109`): `_chatWatchdog: null`.
2. In `sendChat()` (`bmo.js:1120-1143`), after `this.socket.emit('chat_message', payload)`, arm a watchdog and remember the message for retry:

   ```js
   this._lastChatPayload = payload;
   if (this._chatWatchdog) clearTimeout(this._chatWatchdog);
   this._chatWatchdog = setTimeout(() => {
     if (this.status !== 'thinking') return;            // a response landed — nothing to do
     this.status = 'idle';                              // re-enable the composer
     this.messages.push({ role: 'assistant',
       text: "BMO didn't respond — the connection may be down. Try again.",
       error: true });
     this.scrollChat();
   }, 45000);                                           // 45s: longer than a slow agent turn, short enough to recover
   ```

3. Clear the watchdog whenever a response (or an error/ack) arrives so a slow-but-successful turn doesn't trip it. In the `chat_response` handler (`bmo.js:708-740`), at the top add `if (this._chatWatchdog) { clearTimeout(this._chatWatchdog); this._chatWatchdog = null; }`. Do the same in the `agent_ack`/`agent_progress`/`status` handlers that indicate the backend is alive (find them near `bmo.js:744+`) — receiving any of these means the event reached the backend, so **re-arm** the watchdog (reset the timer) rather than cancel it outright, except `chat_response` which cancels. (Code Agent turns can take minutes; an `agent_progress` reset keeps the watchdog from firing mid-work while still catching a truly dead channel.)
4. Optional retry affordance: when the watchdog fires, if `this.socket.connected` is true, the message likely dropped on a stale polling session — a one-tap "Retry" can `this.chatInput = this._lastChatPayload.message; ` (re-stage) or directly re-`emit`. Keep it minimal: stage the text back into the input so the user can resend with one Enter; do not auto-resend (avoid double-posting if the first did land late).

**Cheap check:** read the diff; confirm the watchdog is armed on send, cancelled on `chat_response`, re-armed on progress, and that `status` returns to `idle` after 45s with no response.

**Acceptance:** with the backend not responding, the composer re-enables within 45s and shows a retryable error; a normal (even slow, multi-minute Code Agent) turn never trips the watchdog.

### 02B — IDE terminal: explicit "offline / reconnecting" state instead of a silent blank pane

**Objective:** when the IDE socket is down, the terminal pane says so (and that it's retrying), rather than showing an empty pane behind an "Offline" dot.

**Files:** `bmo/pi/web/static/ide/ide.js` (+ the IDE template/CSS it owns if a banner element is needed).

**Steps:**

1. In the `disconnect` handler (`ide.js:89-92`), in addition to flipping the status dot/label to "Offline", write a visible line into the active terminal/xterm pane: e.g. `term.writeln('\r\n[terminal offline — reconnecting…]')` (use the IDE's existing terminal handle; locate it near the `terminal_output` handler at `ide.js:95`). Guard for "no terminal open yet" so it's a no-op before the first terminal.
2. In the `connect` handler (`ide.js:83-87`), when reconnecting after a prior disconnect, write `'[terminal reconnected]'` and request a fresh PTY/connection if the IDE protocol requires re-subscribing (check how the terminal first attaches — the New Terminal flow; re-emit that subscribe on reconnect).
3. If socket.io's auto-reconnect is disabled or under-configured for the IDE client, enable a bounded reconnect: `io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelayMax: 10000 })` at `ide.js:81` so a transient drop self-heals and the banner clears.

**Cheap check:** read the diff; confirm the offline path writes a visible reconnecting line and the connect path clears it / re-subscribes.

**Acceptance:** an offline terminal shows "terminal offline — reconnecting…" (not a blank pane); on reconnect it announces and re-establishes; the status dot tracks the real socket state.

### 02C — Reconnect/upgrade hygiene on the dashboard socket

**Objective:** the dashboard socket attempts the websocket upgrade and self-heals transient drops, and the UI reflects connection state.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. At socket creation (`bmo.js:413`, `this.socket = io({ auth: { client_timezone: this.clientTimezone } })`), keep the default `['polling','websocket']` transport order (polling-first then upgrade is the standard, Access-friendly path) but make reconnection explicit and add an upgrade-failure breadcrumb:

   ```js
   this.socket = io({
     auth: { client_timezone: this.clientTimezone },
     reconnection: true, reconnectionAttempts: Infinity, reconnectionDelayMax: 10000,
   });
   this.socket.io.engine?.on('upgradeError', (e) => console.warn('[bmo] WS upgrade failed, staying on polling:', e?.message));
   ```

2. Surface connection state: in `setupSocket()` (`bmo.js:647+`) add `this.socket.on('disconnect', () => { this.socketConnected = false; })` and set `this.socketConnected = true` on `connect`. Bind the existing green connection dot to `socketConnected` if it isn't already, so a dropped socket visibly turns the indicator. (Do not invent new UI chrome — reuse the existing connection indicator.)
3. Do **not** force `transports: ['websocket']` — that would *break* the working polling fallback behind Access. The goal is "upgrade when possible, degrade visibly when not", which 02A/02B already cover for the user-facing features.

**Cheap check:** read the diff; confirm reconnection is enabled, the upgrade-error breadcrumb logs, and the connection indicator tracks socket state.

**Acceptance:** the dashboard socket reconnects automatically after a drop; an upgrade failure is logged (not silent); the connection indicator reflects the live socket.

### 02D — Music search: guard `res.ok` before parsing JSON

**Objective:** a failed `/api/music/search` (5xx/503) shows a handled "search unavailable" state, never an uncaught `SyntaxError`.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In `searchMusic()` (`bmo.js:1437-1461`), wrap each fetch and check `res.ok` + parse defensively, for both the playlists and songs branches:

   ```js
   const res = await fetch(`/api/music/search?q=${encodeURIComponent(this.musicQuery)}`);
   if (!res.ok) {
     this.musicResults = []; this.playlistResults = [];
     this.musicError = 'Music search is unavailable right now.';
     return;
   }
   let data;
   try { data = await res.json(); } catch { this.musicResults = []; this.musicError = 'Music search returned an unexpected response.'; return; }
   this.musicResults = Array.isArray(data) ? data : [];
   this.musicError = '';
   ```

2. Add a `musicError: ''` field to component state and render it in the music empty-state area (reuse the existing "Search for a song to get started" region — show `musicError` when set instead of the neutral empty prompt). Clear it on a successful search and when the query is emptied.
3. Apply the same `res.ok`+try/catch pattern to the sibling music fetches that blind-`.json()` a possibly-down endpoint (`fetchMusicState` at `bmo.js:1554`, `fetchPlaylist`) so a down music service degrades quietly rather than throwing — but the *poll backoff* itself is PHASE-03 (don't add interval logic here).

**Cheap check:** read the diff; confirm no `await res.json()` on a music endpoint runs without a preceding `res.ok` guard.

**Acceptance:** a 503/500 from music search yields a visible "unavailable" message and an empty list, with zero uncaught rejections / Alpine expression errors.

### 02E — Websocket-upgrade verification + tunnel runbook (server config in-repo; tunnel as owner step)

**Objective:** determine *where* the WS upgrade dies (LAN vs Cloudflare) and fix the in-repo part; document the exact tunnel/Access change as an owner action with copy-paste commands.

**Files:** `bmo/pi/app.py` (only if a server-side socket.io option is needed), `bmo/docs/CLOUDFLARE_TUNNEL_SETUP.md`, `bmo/docs/NETWORK_ACCESS.md`.

**Steps:**

1. **LAN re-verification (runbook, documented — the missing datum).** Add a short "Realtime / websocket verification" section to `CLOUDFLARE_TUNNEL_SETUP.md` with the steps the executer/owner runs: open `http://bmo.local:5000/bmo`, watch the network panel — if `/socket.io/` upgrades to `transport=websocket` on the LAN but stays `polling` externally, the defect is the tunnel/Access, not the app. (This is the QA's flagged unknown; capturing the procedure makes the next run conclusive.)
2. **Server-side socket.io options (in-repo, gate-covered).** Confirm `SocketIO(app, async_mode='gevent', cors_allowed_origins='*')` (`app.py:401`) is WS-capable with the pinned `gevent-websocket` (it is). If the verification in step 1 shows the app itself refuses the upgrade (it should not, given the deps), add explicit `ping_timeout`/`ping_interval` and leave transports at default — but **do not** restrict transports. Any change here is exercised by `tests/test_realtime_ws.py` + the pytest gate.
3. **Cloudflare tunnel WS (owner action, documented — not executed).** Document in `CLOUDFLARE_TUNNEL_SETUP.md` that cloudflared proxies websockets by default, but **Cloudflare Access** in front of `/socket.io/` can block the upgrade if the Access JWT/cookie isn't carried on the upgrade request; the fix is either an Access **bypass/service-token policy for the `/socket.io/*` path** or ensuring the WS upgrade carries the Access cookie. Provide the exact `cloudflared tunnel ingress validate` check and the Access policy edit as owner steps (rule 6: the executer does not touch the live tunnel/Access). Cross-link from `NETWORK_ACCESS.md`.
4. Record the root-cause hypothesis + the verification result in the phase's `## Completed` so the next QA run can confirm chat/IDE recovered externally.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_realtime_ws.py -q` (if step 2 touched server config); otherwise the doc diff. `ruff check` any touched Python.

**Acceptance:** the doc gives a conclusive LAN-vs-tunnel verification procedure and the exact Access/tunnel WS fix as an owner step; any in-repo socket.io change is green under the pytest gate; transports are NOT restricted (polling fallback preserved).

## Research notes

- **Client watchdogs for realtime sends (02A):** a fire-and-forget `emit` with the UI's busy state cleared *only* by an inbound event is a classic "hang forever on a dropped event" bug — the standard fix is a bounded client-side timer that resolves the busy state and offers retry, re-armed by any liveness signal (ack/progress) so legitimately long operations don't trip it. 45s comfortably exceeds a slow agent turn while still recovering a dead channel within one user's patience window; Code Agent turns are protected by re-arming on `agent_progress`.
- **socket.io transport upgrade behind a reverse proxy / Access (02C/02E):** socket.io deliberately starts on HTTP long-polling and upgrades to websocket; the upgrade is a separate request that an auth proxy (Cloudflare Access) can drop if the auth credential isn't carried, leaving the client permanently on polling with churning session IDs and stale-session 400s — exactly QA's signature. The correct posture is "keep polling fallback, fix the upgrade path" (an Access bypass/service-token for `/socket.io/*`, or carrying the Access cookie on the upgrade), **never** forcing `transports:['websocket']`, which removes the only thing currently working. cloudflared passes websockets by default, so the suspicion order is Access first, tunnel ingress second.
- **`res.ok` before `res.json()` (02D):** parsing a response body as JSON without checking status/content-type turns any server error page into an uncaught `SyntaxError` — the defensive pattern (`if (!res.ok) …; try { await res.json() } catch …`) converts a backend fault into a handled UI state. This complements PHASE-01 making the backend return JSON 503s: even a well-behaved 503 is not a results array, so the guard is still required.
- **Single-process gevent rules out sticky-session causes (02E):** because bmo runs one gevent worker with `gevent-websocket` pinned, the multi-worker "needs sticky sessions" failure mode doesn't apply; that narrows the WS-upgrade failure to the external path (tunnel/Access), which is why the LAN re-verification is the decisive next measurement.

## Test plan

- **02A/02B/02C/02D** — frontend JS, no unit harness in-repo; verified by diff review against the cited handlers + the behavioural acceptance criteria. (A future phase could add a Playwright/headless harness — out of scope here; logged if it bites.)
- **02E** — if server socket.io config changes, `tests/test_realtime_ws.py` + `bmo-pi-pytest.yml`; otherwise doc-only.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + guards are the gate for any Python touched. No live-Pi deploy / tunnel edit (rule 6).

## Acceptance criteria

- [ ] Chat composer recovers within 45s (retryable error, input re-enabled) when no `chat_response` arrives; normal/slow turns never trip the watchdog.
- [ ] IDE terminal shows an explicit "offline — reconnecting" state (not a blank pane) and re-establishes on reconnect; status dot tracks the real socket.
- [ ] Dashboard socket auto-reconnects, logs upgrade failures, and the connection indicator reflects socket state; transports are NOT restricted.
- [ ] Music search guards `res.ok` and never throws an uncaught `SyntaxError` on a 5xx/503; a handled "unavailable" state shows.
- [ ] `CLOUDFLARE_TUNNEL_SETUP.md` documents the LAN-vs-tunnel WS verification + the exact Access/tunnel fix as an owner step; any server socket.io change is green under pytest.
- [ ] `bmo-pi-pytest.yml` + guards green; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Backend Music/Calendar 500→503 hardening** — PHASE-01 (this phase only renders/guards the frontend side).
- **Cross-cutting poll backoff / centralized polling** (`/api/music/state`, `/api/tv/status`, `/api/timers`, `/api/chat/history` storms) — PHASE-03.
- **Actually editing the live Cloudflare tunnel / Access policy** — owner action (rule 6); this phase provides the runbook + in-repo doc only.
- **A headless frontend test harness** for the JS behaviours — not in any finding; log per rule 12 if a regression slips.
- **Chat-history seeded-data cleanup + test isolation** — PHASE-01 (backend/test side).

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one entry per sub-phase as it lands. The executer also records here the 02E LAN-vs-tunnel verification result + the owner-action tunnel/Access step, since the live tunnel edit is outside executer scope per rule 6.)*

### Execution log (2026-06-24)

- **02A** — `web/static/js/bmo.js`: added `_chatWatchdog`/`_lastChatText` state + `_armChatWatchdog()`/`_clearChatWatchdog()`. `sendChat()` arms a 45s watchdog after `emit`; `chat_response` cancels it; `agent_ack`+`agent_progress` re-arm it (so multi-minute Code Agent turns never trip it). On fire: `status`→`idle`, a retryable error bubble, and the text re-staged into an empty composer for one-tap resend.
- **02B** — `web/static/ide/ide.js`: `io()` now sets `reconnection/reconnectionAttempts/reconnectionDelayMax`; a `wasDisconnected` flag drives an explicit terminal banner — `disconnect` writes `[terminal offline — reconnecting…]` into each open xterm, `connect` (after a real drop) writes `[terminal reconnected]` and re-emits `terminal_open` per terminal (server keys PTYs by socket sid, which rotates on reconnect — verified in `routes/ide.py:1393`).
- **02C** — `bmo.js`: dashboard `io()` gains explicit reconnection + an `engine.upgradeError` console breadcrumb (no silent polling churn); `connect`/`disconnect` drive the existing `connectionState` indicator (`online`/`offline`, never clobbering `cf_expired`). Transports left at default — polling fallback preserved.
- **02D** — `bmo.js` `searchMusic()`: `res.ok` + try/catch on both branches; a 5xx/503 or non-array body yields a handled `musicError` state and empty list instead of an uncaught `SyntaxError`; cleared on success and empty query. `web/templates/index.html`: a `musicError` banner under the search form.
- **02E** — No server socket.io change needed: `app.py:401` is already WS-capable (gevent + pinned `gevent-websocket`, no transport restriction), so the upgrade failure is the edge path, not Flask. Added a "Realtime / websocket verification" runbook to `docs/CLOUDFLARE_TUNNEL_SETUP.md` (LAN-vs-tunnel decision procedure + the exact Access policy / `cloudflared tunnel ingress validate` owner fix) and a cross-link in `docs/NETWORK_ACCESS.md`.
- **Checks:** `node --check` clean on `bmo.js` + `ide.js`; `test_realtime_ws.py`+`test_ide_app.py`+`test_ide_blueprint.py` = 127 passed (autouse conftest from PHASE-01 in effect); no Python touched beyond docs; no new `print()`.
- **Root-cause hypothesis (for next QA):** external WS upgrade dies at Cloudflare Access on `/socket.io/*`; LAN re-verification (runbook Step 1) is the decisive next datum. The frontend now degrades **visibly** (chat watchdog, IDE banner) regardless of the edge fix.
- **OWNER ACTION (rule 6, not executed):** apply the Access bypass/service-token policy for `/socket.io/*` (or ensure the upgrade carries the Access cookie) per the runbook; re-verify chat/IDE recover externally.
