# PHASE-04 — bmo realtime auth over Cloudflare (websocket handshake)

> Authored 2026-06-25 from `bmo/docs/phases/QA/QA-report-2026-06-24-2.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Make realtime (chat + the IDE terminal) work over the external Cloudflare path by closing the **one** gap the second QA pass pinpointed from the server log: the socket.io handshake is **rejected** for a Cloudflare-Access-authenticated browser. The REST front door already accepts a verified Cloudflare Access JWT (`_cf_access_authenticated()`, `bmo/pi/app.py:382`), which is why every `/api/*` call works externally — but the websocket auth gate (`_bmo_websocket_authorized`, `bmo/pi/routes/realtime_ws.py:39-50`) does **not** consult Cloudflare Access, so it rejects the same browser with `[ws] Rejected: BMO_API_KEY required for this client` (`realtime_ws.py:132`). Chat messages and the IDE PTY ride socket.io, so both hang: chat sits on "BMO is thinking!" forever; the IDE terminal shows "Offline" with a blank pane.

The fix is a single, well-scoped server change — **make the WS gate accept the same Cloudflare Access identity the REST gate already trusts** — plus the frontend half QA asked for: surface the rejected/disconnected state immediately (a socket `connect_error` handler) instead of relying only on the 45 s send-watchdog PHASE-02 added.

This phase **supersedes the root-cause hypothesis in PHASE-02**. PHASE-02 (authored from the *first* QA report, which had only client-side evidence) guessed the external WS failure was a transport/upgrade problem dying at Cloudflare Access on `/socket.io/*`, and left an owner action to add an Access **bypass** for that path. The second pass captured the server log and showed the real cause is the app's **own** auth gate rejecting the handshake — not the tunnel dropping the upgrade. PHASE-02's frontend degradation (the chat watchdog, the IDE offline banner) stays; its "Access bypass for `/socket.io/*`" owner action is **not** the fix and should not be applied (see Out of scope).

This phase is **server-side Python (the WS gate) + two small frontend handlers**. The calendar findings are PHASE-05; the remaining UX/hygiene findings are PHASE-06.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@53163f4b`. PHASE-01..03 are already merged (in `completed/`).
- **Supersedes PHASE-02's 02E hypothesis.** PHASE-02 02A/02B/02C/02D shipped (chat watchdog, IDE reconnect banner, socket reconnection hygiene, music `res.ok` guard) and remain correct. Only PHASE-02's *root-cause guess* for the external WS failure (transport/Access-bypass) is wrong; 04A replaces it with the verified auth-gate fix. 04B/04C extend — not duplicate — the watchdog/banner with explicit `connect_error` handling.
- **Why the QA still saw this although PHASE-02 "fixed realtime":** PHASE-02 made the surface degrade *visibly*; it never repaired the handshake because it misdiagnosed the cause. The WS `BMO_API_KEY` gate has existed since the PHASE-16 blueprint extraction (`5e9d02af`) and is present at both QA commits — it was always the cause; only the second pass's server log proved it.
- **Live-Pi / infra boundary (INSTRUCTIONS.md rule 6):** `BMO_API_KEY`, `CF_ACCESS_TEAM_DOMAIN`, and `CF_ACCESS_AUD` are env on the Pi (`bmo/pi/.env`); the executer does **not** edit them or restart services. This phase ships the in-repo gate change + tests; the owner's existing Cloudflare Access config already issues the JWT the gate will now check, so **no tunnel/Access edit is required** (a key correction vs PHASE-02).

## Verified findings

All citations verified 2026-06-25 against `origin/master@53163f4b` in the `auto/bmo-phase-maker` worktree. `bmo/pi/routes/realtime_ws.py` is **359 lines**; the dashboard JS is `bmo/pi/web/static/js/bmo.js`; the IDE is `bmo/pi/web/static/ide/ide.js`.

### F1 — The WS auth gate rejects Cloudflare-Access browsers; the REST gate accepts them (the asymmetry)

**Status: confirmed (root cause).** When `BMO_API_KEY` is set (the owner has opted into LAN/internet hardening), the two front doors disagree:

- **REST** (`app.py` `_bmo_optional_api_key` before-request, `app.py:339-391`) accepts a request if it is trusted-localhost, carries `Authorization: Bearer <key>`, hits a public path, **or** `_cf_access_authenticated()` returns true (`app.py:382`). `_cf_access_authenticated` (`app.py:299-334`) verifies the `Cf-Access-Jwt-Assertion` header or the `CF_Authorization` cookie against the team JWKS + audience + issuer (+ optional email allowlist), fail-closed. So an external CF-Access browser passes REST.
- **WS** (`_bmo_websocket_authorized`, `realtime_ws.py:39-50`) accepts only when `not BMO_API_KEY` (49→`return True` at 43), trusted-localhost (45), `Authorization: Bearer <key>` (47), or socket.io `auth.bmo_api_key == BMO_API_KEY` (48). It **never** calls `_cf_access_authenticated()`. The external browser presents a valid Access cookie on the handshake request but no Bearer/`bmo_api_key`, so `on_connect` (`realtime_ws.py:129-133`) hits `return False` and logs `[ws] Rejected: BMO_API_KEY required for this client` — exactly QA's server-log line.

The kiosk works because it connects from `127.0.0.1` (trusted-localhost, `realtime_ws.py:45`). The browser's Access cookie *is* sent on the socket.io polling/upgrade requests (same-origin), so the gate has everything it needs to verify — it simply doesn't look.

```bash
sed -n '39,50p' bmo/pi/routes/realtime_ws.py        # WS gate: no _cf_access_authenticated() branch
sed -n '129,133p' bmo/pi/routes/realtime_ws.py       # on_connect → return False + the logged message
sed -n '339,391p' bmo/pi/app.py                       # REST gate DOES accept _cf_access_authenticated() (L382)
sed -n '299,334p' bmo/pi/app.py                       # _cf_access_authenticated: JWKS + aud + iss, fail-closed
```

### F2 — Chat hangs on "BMO is thinking!" because the dropped handshake gives no fast feedback

**Status: confirmed.** With F1 rejecting the socket, `sendChat()` (`bmo.js:1164-1192`) emits `chat_message` and sets `status='thinking'`; the only fast recovery is PHASE-02's 45 s watchdog (`_armChatWatchdog`, `bmo.js:1194`). The dashboard socket has `connect`/`disconnect`/`upgradeError` handlers (`setupSocket`, `bmo.js:685-695`; created at `bmo.js:425`) but **no `connect_error` handler** — and a server-rejected handshake (`on_connect → return False`) surfaces to the client as `connect_error`, not `disconnect`. So a known-rejected socket is invisible to the UI until the 45 s timer fires; the composer stays disabled with no explanation. (Once F1 lands the handshake succeeds, but the explicit `connect_error` path is still the correct safety net for any future rejection/outage.)

```bash
sed -n '685,695p' bmo/pi/web/static/js/bmo.js        # connect/disconnect only — no connect_error
sed -n '1164,1209p' bmo/pi/web/static/js/bmo.js       # sendChat + the 45s watchdog (PHASE-02)
```

### F3 — IDE terminal shows "Offline" / blank PTY for the same reason, with no `connect_error` surfacing

**Status: confirmed.** `ide.js` creates the socket with infinite reconnection (`ide.js:84`) and handles `connect`/`disconnect` (`ide.js:86,103`) — PHASE-02 added the offline/reconnect banner — but has **no `connect_error` handler** either. Against F1 the handshake is rejected on every attempt, so reconnection retries forever, the status stays "Offline", and the New-Terminal PTY pane (which `emit('terminal_open')`s at `ide.js:98,625`) never receives output. The editor works because file reads go over REST (CF-Access-satisfied). F1 fixes the connection; the residual is that a *persistent* rejection should say so rather than spin silently.

```bash
sed -n '84,107p' bmo/pi/web/static/ide/ide.js         # io() + connect/disconnect, no connect_error
```

## Sub-phases

> Server-side change in 04A is gated by `tests/test_realtime_ws.py` + `bmo-pi-pytest.yml`. Frontend JS (04B/04C) has no unit harness in-repo — verify by diff review against the cited handlers. Do not add bare `print()` (the `bmo-no-new-prints.yml` guard) — use the module logger.

### 04A — WS gate accepts the Cloudflare Access identity (mirror the REST front door)

**Objective:** a Cloudflare-Access-authenticated browser completes the socket.io handshake; chat + IDE terminal connect over the external path; localhost and Bearer paths are unchanged; an unauthenticated non-local client is still rejected.

**Files:** `bmo/pi/routes/realtime_ws.py`, `bmo/pi/tests/test_realtime_ws.py`.

**Steps:**

1. In `_bmo_websocket_authorized` (`realtime_ws.py:39-50`), add a Cloudflare-Access branch that reuses the REST verifier, so the two gates can never drift:

   ```python
   def _bmo_websocket_authorized(auth: object | None) -> bool:
       """HTTP Bearer, Cloudflare Access JWT, and/or Socket.IO auth for non-local clients."""
       a = _app()
       if not a.BMO_API_KEY:
           return True
       if a._bmo_client_is_trusted_localhost():
           return True
       if (request.headers.get("Authorization", "") or "").strip() == f"Bearer {a.BMO_API_KEY}":
           return True
       if isinstance(auth, dict) and auth.get("bmo_api_key") == a.BMO_API_KEY:
           return True
       # Owner authenticated at the Cloudflare Access edge (verified JWT in the
       # Cf-Access-Jwt-Assertion header or CF_Authorization cookie carried on the
       # socket.io handshake) — same trust the REST front door grants (app.py:382).
       if a._cf_access_authenticated():
           return True
       return False
   ```

   The handshake request is a real Flask request (socket.io's `connect` runs in request context), so `request.headers`/`request.cookies` carry the Access credential exactly as the REST path sees it. No new config and no client change are needed.
2. Leave `on_connect` (`realtime_ws.py:129-133`) as-is — it already calls `_bmo_websocket_authorized(auth)` and logs the rejection. (Optionally enrich the rejection log to note CF-Access was absent/invalid, kept at `log.info`; no new `print`.)
3. Extend `tests/test_realtime_ws.py`: (a) with `BMO_API_KEY` set and a monkeypatched `app._cf_access_authenticated` returning `True`, assert `_bmo_websocket_authorized({})` is `True`; (b) with it returning `False` and no Bearer/localhost, assert `False`; (c) regression: `BMO_API_KEY` unset → `True`; Bearer-header path → `True`; `auth={'bmo_api_key': key}` → `True`. Mirror however the existing tests stub `request`/`app` (reuse the file's fixtures).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_realtime_ws.py -q && ruff check routes/realtime_ws.py`.

**Acceptance:** the WS gate grants a verified CF-Access client and still rejects an unauthenticated non-local client; localhost/Bearer/`auth.bmo_api_key` paths unchanged; tests green.

### 04B — Chat: handle socket `connect_error` (fast, explicit feedback)

**Objective:** a rejected/failed socket clears the stuck "thinking" state immediately and shows an actionable message, instead of waiting out the 45 s watchdog.

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In `setupSocket()` (`bmo.js:685-695`), add a `connect_error` handler beside `connect`/`disconnect`:

   ```js
   this.socket.on('connect_error', (e) => {
     if (this.connectionState !== 'cf_expired') this.connectionState = 'offline';
     // If a chat send is waiting on a response that can never arrive, recover now.
     if (this.status === 'thinking') {
       if (this._chatWatchdog) { clearTimeout(this._chatWatchdog); this._chatWatchdog = null; }
       this.status = 'idle';
       this.messages.push({ role: 'assistant',
         text: "Can't reach BMO right now — the realtime connection was refused. Try again in a moment.",
         error: true });
       this.scrollChat?.();
     }
     console.warn('[bmo] socket connect_error:', e?.message);
   });
   ```

   This complements (does not replace) the 45 s watchdog: `connect_error` catches the *known-refused* case instantly, the watchdog still catches a silently-dropped event.
2. Keep the existing `connect` handler clearing `connectionState` back to `online` (`bmo.js:686-690`) so a successful (re)connect after 04A clears the error state.

**Cheap check:** diff review; confirm `connect_error` clears `thinking`, cancels the watchdog, and sets the connection indicator.

**Acceptance:** when the socket is refused, the composer re-enables immediately with a clear message; a normal connect clears it; the 45 s watchdog remains as the dropped-event backstop.

### 04C — IDE terminal: handle `connect_error` so a persistent rejection says so

**Objective:** when the IDE socket can't connect (rejected/outage), the terminal panel states it's unreachable rather than spinning behind a silent "Offline" dot.

**Files:** `bmo/pi/web/static/ide/ide.js`.

**Steps:**

1. Add a `connect_error` handler next to the existing `connect`/`disconnect` (`ide.js:86-107`): flip the status dot/label to "Offline" (reuse the disconnect path's element updates) and, **once per error burst**, write a single line into each open xterm — e.g. `'[terminal unreachable — check connection]'` — guarded so it's a no-op before the first terminal and doesn't spam on every reconnection attempt (track a `wasErrored` flag mirroring PHASE-02's `wasDisconnected` at `ide.js:80`).
2. On a successful `connect` after an error, clear the flag and let the existing reconnect path write `[terminal reconnected]` + re-`emit('terminal_open')` (already present at `ide.js:86-99`).

**Cheap check:** diff review; confirm `connect_error` shows the unreachable state without spamming and that connect recovers it.

**Acceptance:** a persistently-rejected IDE socket shows an explicit "unreachable" line (not a blank pane); on connect (after 04A) it announces and re-subscribes; the status dot tracks real state.

## Research notes

- **One verifier, two doors (04A):** the bug is purely that two auth gates for the same origin diverged — REST trusts the Cloudflare Access JWT, WS doesn't. Reusing the *same* `_cf_access_authenticated()` function (rather than re-implementing JWT checks in the WS path) guarantees they can't drift again and inherits the fail-closed verification (JWKS + aud + iss + optional email allowlist). The Access cookie rides the socket.io handshake automatically because it's a same-origin request, so no client-side credential plumbing is needed.
- **`connect_error` vs `disconnect` (04B/04C):** socket.io signals a *server-refused* handshake (a `connect` handler returning `False`) as `connect_error` on the client, not `disconnect` — so a UI that only listens for `disconnect` never learns it was rejected. Handling `connect_error` is the canonical way to surface "refused/unreachable" promptly; the send-watchdog stays as the orthogonal backstop for a message that's dropped *after* a healthy connect.
- **Diagnosis beats a plausible guess (supersedes PHASE-02):** PHASE-02's transport/Access-bypass hypothesis was reasonable from client-only evidence but wrong; the second pass's single server-log line (`[ws] Rejected: BMO_API_KEY required`) collapsed the search space to the app's own gate. This is the "auto-diagnose to the responsible line, don't act on a symptom" rule (INSTRUCTIONS.md rule 28) — and a caution against shipping an infra workaround (an Access bypass for `/socket.io/*`) that would have *weakened* auth without fixing the cause.

## Test plan

- **04A** — `tests/test_realtime_ws.py`: CF-Access-true grants, CF-Access-false rejects, plus the unset-key/Bearer/`auth.bmo_api_key` regressions; `bmo-pi-pytest.yml` runs the full suite + guards on push.
- **04B/04C** — frontend JS, no in-repo unit harness; verified by diff review against the cited handlers + behavioural acceptance. (`node --check` on `bmo.js`/`ide.js` for a syntax gate, mirroring PHASE-02's check.)
- **End of phase (INSTRUCTIONS.md rule 5):** push; the pytest gate + `no-new-prints`/docker/codeql guards are authoritative. No live-Pi deploy / no tunnel edit (rule 6).

## Acceptance criteria

- [ ] The WS gate accepts a verified Cloudflare Access client (chat + IDE terminal connect externally) and still rejects an unauthenticated non-local client; localhost/Bearer/`auth.bmo_api_key` paths unchanged; `test_realtime_ws.py` green.
- [ ] Chat handles `connect_error`: a refused socket clears "thinking" immediately with an actionable message; the 45 s watchdog remains as the dropped-event backstop.
- [ ] The IDE terminal shows an explicit "unreachable" state on persistent `connect_error` (no silent blank pane) and recovers on connect.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **A Cloudflare Access bypass / service-token policy for `/socket.io/*`** — this was PHASE-02's owner-action guess and is **NOT** the fix; 04A makes the app accept the existing Access JWT, so weakening the edge policy is unnecessary and undesirable. Do not apply it.
- **Editing `BMO_API_KEY` / `CF_ACCESS_*` env or the live tunnel** — owner/infra, live-Pi (rule 6). The existing Access config already mints the JWT 04A verifies.
- **Calendar token/health findings** — PHASE-05.
- **List UX, geolocation, Places, voice-canary** — PHASE-06.
- **A headless frontend test harness for the socket handlers** — not in any finding; log per rule 12 if a regression slips.

## Completed

- **04A** (2026-06-28) — WS auth gate now mirrors the REST front door: added a Cloudflare-Access branch reusing `app._cf_access_authenticated()` in `_bmo_websocket_authorized` (`bmo/pi/routes/realtime_ws.py:53`), so a verified CF-Access browser completes the socket.io handshake; localhost/Bearer/`auth.bmo_api_key` paths unchanged. Added 5 gate unit tests (`bmo/pi/tests/test_realtime_ws.py:106` CF-grant, `:117` reject; plus unset-key/Bearer/auth-dict regressions) — `pytest tests/test_realtime_ws.py` 8 passed, `ruff` clean.
- **04B** (2026-06-28) — Chat: added a `connect_error` handler in `setupSocket()` (`bmo/pi/web/static/js/bmo.js:695`) that flips the connection indicator to offline and, when a send is waiting on a response, cancels the 45s watchdog, returns the composer to idle, and pushes an actionable error message — instant recovery for a refused socket; the watchdog remains the dropped-event backstop. `node --check` clean.
- **04C** (2026-06-28) — IDE terminal: added a `wasErrored` latch (`bmo/pi/web/static/ide/ide.js:81`) and a `connect_error` handler (`:117`) that shows the Offline dot and writes a single `[terminal unreachable — check connection]` line per error burst into each open xterm; the `connect` handler clears the latch (`:91`) so recovery re-announces and re-subscribes. `node --check` clean.

