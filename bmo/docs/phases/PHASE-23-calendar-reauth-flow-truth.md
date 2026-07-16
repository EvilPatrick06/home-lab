# PHASE-23 — bmo calendar re-auth flow truth (dead OOB manual mode, unsurfaced popup errors, needs-auth vs offline copy, refresh-flood circuit breaker)

> Authored 2026-07-15 from `bmo/docs/phases/QA/QA-report-2026-07-15.md` (run 5, live deploy `d6699d52`, runtime identical to `e03664fa`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

The Google Calendar token has been dead since 2026-06-29 and the dashboard's own recovery path cannot fix it. Close the **code-side** failure modes the report's second High identifies (the Google-Cloud-Console redirect-URI registration itself is an **owner action**, flagged below):

1. **"Manual mode" is built on the OOB redirect Google shut down in 2022** — `urn:ietf:wg:oauth:2.0:oob` can never succeed, yet it is offered as the fallback whenever the popup flow fails. *(high, bug — the dashboard's last-resort re-auth path is structurally dead)*
2. **The popup flow's failure is invisible to the auth panel.** With `redirect_uri_mismatch` Google never redirects to our callback, so the postMessage/`auth/status` machinery just… waits; the instructions stay up and the user learns nothing. *(bug)*
3. **An authorization problem is presented as connectivity**: the calendar banner folds `needs_auth` into "Offline — changes will sync when connected" — an unverifiable promise (no offline queue exists) that hides the real, actionable state. *(low, UX — §6)*
4. **Every socket connect re-attempts the expired-token refresh and logs a ~30-line `RefreshError: invalid_grant` traceback** (`on_connect → get_next_event`), flooding the journal on kiosk/phone reconnects and burying real errors. *(low, debt — §2)*
5. **Console logs `[cal] recovered` while the calendar is still `needs_auth`** — only the transport recovered. *(info, copy — §9 batch)*

PLANNING/AUTHORING ONLY. Categories: **bug (high) ×2 auto-implement; UX/debt/info gated** per the autonomy policy — sub-phases are ordered so the gated items are separable. Backend (`routes/calendar_api.py`, `services/calendar/service.py`, `routes/realtime_ws.py`) + frontend (`bmo.js`, `index.html`); backend pytest-coverable.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@f2300ac8` (2026-07-15). Re-anchor before editing (rule 3).
- **The token reauth itself stays an owner action** (tracked in `docs/logs/BMO-ISSUES-LOG.md` as the invalid_grant entry; likely 7-day refresh-token expiry of an OAuth app in Testing status). This phase makes the *next* expiry recoverable from the dashboard; it does not perform this one.
- **Owner action to unblock the popup flow (not a code change):** register the loopback redirect URI(s) actually used by the kiosk — `http://127.0.0.1:5000/api/calendar/auth/callback` (and `http://bmo.local:5000/...` if desired) plus the Cloudflare host `https://bmo.mybmoai.work/api/calendar/auth/callback` — on OAuth client `1081788538041-…`, or switch the client to a Desktop-type client. Surface this in the phase's board summary; the executer should also append it to `docs/logs/BMO-ISSUES-LOG.md` as a config item if not already present.
- **The callback already accepts a pasted full redirect URL or raw code** (`POST /api/calendar/auth/callback`, `calendar_api.py:427-470+` — parses `code=` out of a pasted URL). 23A builds the replacement manual flow on this existing capability instead of inventing a new endpoint.
- **PHASE-05 (token persistence) and PHASE-10/11 (health/banner truth) are merged** — nothing here reverts them; 23C refines the same banner PHASE-11 11B touched.
- **Device-code flow was considered and rejected** for the default path: Google's device-authorization grant restricts allowed scopes and `https://www.googleapis.com/auth/calendar` is not reliably grantable there; the paste-the-redirect-URL pattern works with the existing web client. If the executer verifies calendar scope works on the device flow, it may be added as an *extra* option, not a replacement (note the decision in `## Completed`).

## Verified findings

All citations verified 2026-07-15 against `origin/master@f2300ac8`.

### F1 — Both the `mode=manual` URL and the always-returned `manual_url` use the dead OOB redirect

**Status: confirmed (High/bug).**

```python
        mode = (request.args.get("mode") or "auto").strip().lower()
        if mode == "manual":
            redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
        ...
        manual_redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
        manual_auth_url = (
            "https://accounts.google.com/o/oauth2/auth"
            f"?client_id=..."
            f"&redirect_uri={urllib.parse.quote(manual_redirect_uri, safe='')}"
```

(`bmo/pi/routes/calendar_api.py:288-291` and `:314-323`.) Google disabled the OOB flow for new grants in 2022; `accounts.google.com` rejects these URLs outright. The popup ("auto") flow builds `{scheme}://{host}/api/calendar/auth/callback` from forwarded headers (`:297-302` — the QA #5 2026-05-17 fix), which is correct *when the URI is registered*; on the kiosk it resolves to `http://127.0.0.1:5000/...`, which is evidently **not** registered on the client → `redirect_uri_mismatch`.

```bash
sed -n '266,335p' bmo/pi/routes/calendar_api.py
```

### F2 — A popup-side OAuth error never reaches the auth panel

**Status: confirmed (bug).** The callback route does handle an `error=` query param (`calendar_api.py:437-441`) and the popup HTML posts `bmo-calendar-auth` back to the opener (`:395-405`) — but with `redirect_uri_mismatch` **Google never redirects to the callback at all**; the popup dies on `accounts.google.com/signin/oauth/error`. The opener's only other signal is polling `GET /api/calendar/auth/status` (`:408-424`), which merely keeps reporting unauthorized. Net: the panel's instructions stay up forever with no error state. The frontend flow starter is `startCalendarAuth()` in `bmo/pi/web/static/js/bmo.js` (locate via `grep -n 'startCalendarAuth' bmo/pi/web/static/js/bmo.js`).

```bash
sed -n '395,425p' bmo/pi/routes/calendar_api.py
grep -n 'bmo-calendar-auth\|startCalendarAuth\|auth/status' bmo/pi/web/static/js/bmo.js | head
```

### F3 — `needs_auth` renders as offline-with-sync-promise

**Status: confirmed (Low/UX).** The API deliberately sets both flags when creds are invalid — e.g. `return jsonify({"offline": True, "needs_auth": True, "events": []})` (`calendar_api.py:69`, also `:85`, `:96`, `:108`) — and the client stores them separately (`this.calNeedsAuth = !!(data && data.needs_auth)`, `bmo.js:1926`, `:1931`) but the banner/copy path treats them as one "offline" state with "changes will sync when connected" phrasing; the create handler treats non-2xx as a plain error (no queue exists to make the promise true). The agenda empty-state ("Calendar not connected" + Authorize button, `index.html:1156-1159`) is the PHASE-11 11B state — the *banner* copy is what misleads.

```bash
grep -n 'needs_auth' bmo/pi/routes/calendar_api.py | head
grep -n 'calNeedsAuth\|calOffline\|will sync' bmo/pi/web/static/js/bmo.js bmo/pi/web/templates/index.html | head
```

### F4 — Unconditional per-connect refresh attempt logs a full traceback each time

**Status: confirmed (Low/debt).** `on_connect` calls `a.calendar.get_next_event()` inside a try/except that logs `log.exception("[ws] Calendar init failed")` (`bmo/pi/routes/realtime_ws.py:170-176`) — a full stack per connect. Underneath, `_get_service()` re-attempts `creds.refresh(Request())` unconditionally whenever the cached service is absent and creds are expired (`bmo/pi/services/calendar/service.py:165-180`), raising the wrapped `RuntimeError` with the reauth instructions each time. A kiosk + phones reconnecting regularly floods the journal.

```bash
sed -n '168,178p' bmo/pi/routes/realtime_ws.py
sed -n '160,195p' bmo/pi/services/calendar/service.py
```

### F5 — `[cal] recovered` fires when only the transport recovered

**Status: confirmed (info/copy).** `if (this.calOffline) console.info('[cal] recovered');` (`bmo.js:1929`) — evaluated on any successful fetch of the events endpoint, including responses that still carry `needs_auth: true` (the endpoint 200s with the flag set).

## Sub-phases

> One commit at phase end. 23A/23B are the auto-implement bug core; 23C/23D/23E are gated (UX/debt/info) — keep their diffs separable within the commit body listing.

### 23A — Replace OOB manual mode with the paste-the-redirect-URL flow

**Objective:** the manual fallback becomes a flow Google still supports, reusing the existing code-exchange endpoint.

**Files:** `bmo/pi/routes/calendar_api.py` (`api_calendar_auth_url` `:266-333`), `bmo/pi/web/static/js/bmo.js` (auth panel logic), `bmo/pi/web/templates/index.html` (auth panel copy).

**Steps:**

1. Backend: build `manual_auth_url` with the **same loopback callback redirect** the popup uses (`http://127.0.0.1:5000/api/calendar/auth/callback`) instead of OOB, and include `"manual_instructions"` in the JSON: complete consent in any browser; Google will redirect to a `127.0.0.1` URL that may not load — copy that final URL from the address bar and paste it below. Keep `prompt=consent&access_type=offline` so a refresh token is issued. Remove both OOB constants.
2. Frontend: the manual panel gains a paste box that POSTs the pasted URL to `/api/calendar/auth/callback` (the endpoint already parses `code=` from a full URL, `calendar_api.py:465+`) and renders the JSON result. If a paste box already exists for the OOB code, repurpose it — same endpoint, new instructions.
3. Update the reauth helper docs/strings that mention OOB or "paste code": `bmo/pi/services/reauth_calendar.py` and the service-layer error text (`services/calendar/service.py:172-177`) — sweep `grep -rn 'oob\|paste' bmo/pi --include='*.py'` and align wording.
4. Pytest: `GET /api/calendar/auth/url?mode=manual` response contains no `urn:ietf:wg:oauth:2.0:oob` anywhere; the callback still exchanges a pasted-URL body (existing tests may cover the parse — extend if not).

**Cheap check:** targeted pytest on the auth-url route; manual walk of URL shapes.

**Acceptance:** no OOB URL is ever emitted; the manual path is completable end-to-end against a registered client.

### 23B — Surface popup-flow failure in the auth panel

**Objective:** when the popup cannot complete (mismatch error page, closed popup, timeout), the panel says so and offers the manual path — instructions never hang forever.

**Files:** `bmo/pi/web/static/js/bmo.js` (`startCalendarAuth` + status polling), `bmo/pi/web/templates/index.html` (auth panel).

**Steps:**

1. Track the popup handle: on `startCalendarAuth()`, poll both `auth/status` **and** `popup.closed`. If the popup closes without a `bmo-calendar-auth` postMessage and `auth/status` still says unauthorized, render an explicit failure state: "Google sign-in didn't complete. If Google showed an error page (redirect_uri_mismatch), the OAuth client is missing this dashboard's redirect URI — use manual mode below, or see the issues log." Also cap the wait (~2 min) for popups that never close.
2. Render the existing `bmo-calendar-auth` `ok:false` message (already posted by the callback HTML for in-callback errors) in the same failure state rather than only relying on it.
3. No backend change. (We cannot read the Google error page cross-origin — closed-without-callback *is* the detectable signal; say so honestly rather than guessing the exact error.)

**Cheap check:** diff review; browser walk with an unregistered redirect URI: open popup, land on the Google error page, close it → panel shows the failure state with the manual-mode pointer.

**Acceptance:** a failed popup flow always converges to visible, actionable copy within the timeout; success path unchanged.

### 23C — Split needs-auth from offline in banner copy (gated: UX)

**Objective:** distinct, honest copy per state; no false sync promise.

**Files:** `bmo/pi/web/templates/index.html` (calendar banner), `bmo/pi/web/static/js/bmo.js` (`:1920-1935` flag handling).

**Steps:**

1. Banner ternary on `calNeedsAuth` first: "Calendar needs re-authorization — nothing will sync until then" + the Authorize button; only pure `calOffline && !calNeedsAuth` keeps an offline message, reworded to drop the queue promise: "Offline — calendar can't be reached right now." (No queue exists; don't promise sync.)
2. Ensure the create/edit handlers' failure toasts don't imply queuing either (sweep "will sync" strings).

**Cheap check:** with `needs_auth:true` responses, banner shows the re-auth copy; with a network-down simulation, the offline copy.

**Acceptance:** the two states are visually and verbally distinct; no unverifiable promise remains.

### 23D — Credential-invalid circuit breaker + one-line WARN (gated: debt)

**Objective:** a dead token logs once at WARN (with the reauth hint), then quietly short-circuits until the token file changes; `on_connect` stops emitting stack traces.

**Files:** `bmo/pi/services/calendar/service.py` (`_get_service` `:160-195`), `bmo/pi/routes/realtime_ws.py` (`:170-176`).

**Steps:**

1. In the service, on a refresh failure classified invalid_grant/invalid_scope, record `self._creds_invalid = (token_mtime, one_line_reason)` and raise as today. On subsequent `_get_service()` calls, if `_creds_invalid` matches the current `token.json` mtime, raise a cheap `RuntimeError(reason)` immediately — no network attempt, no fresh traceback. Clear the marker when the mtime changes (reauth writes a new file) or on successful refresh.
2. First failure logs `log.warning` with the one-liner + reauth hint; repeats log nothing (or `log.debug`). Keep `log.exception` only for *unexpected* exception classes.
3. In `on_connect`, downgrade the calendar init catch to `log.warning("[ws] Calendar init failed: %s", e)` (no traceback) — the service layer now owns the detailed once-logging.
4. Pytest: two consecutive `_get_service()` calls with a mocked invalid_grant refresh → exactly one refresh attempt (mock call count), second raises without invoking `Request`; touching/rewriting the token file re-arms one attempt.

**Cheap check:** targeted pytest on the service module's test file.

**Acceptance:** journal shows one WARN per dead-token episode, not per connect; recovery after reauth requires no restart.

### 23E — `[cal] recovered` only when actually authorized (gated: info)

**Objective:** the console breadcrumb tells the truth.

**Files:** `bmo/pi/web/static/js/bmo.js` (`:1926-1931`).

**Steps:**

1. Gate the log on `!data.needs_auth`: transport recovery while still unauthorized logs `[cal] transport ok — still needs auth` (or nothing).

**Cheap check:** diff review.

**Acceptance:** "recovered" never appears while `needs_auth` is true.

## Test plan

- **Backend (23A, 23D):** targeted pytest (`tests/` calendar-api and calendar-service modules); full sweep via `bmo-pi-pytest.yml`; `ruff check`; no new bare `print()`s.
- **Frontend (23B, 23C, 23E):** no JS harness — diff review + acceptance walks (popup failure, needs-auth banner, offline banner) on the owner-run deploy (rule 6).

## Acceptance criteria

1. No OOB URL is emitted anywhere; manual mode is a completable, supported flow.
2. A failed popup re-auth converges to visible, actionable copy — never a silent hang.
3. Needs-auth and offline are distinct states with honest copy; no phantom sync promise.
4. A dead token produces one WARN line per episode, not a traceback per socket connect; reauth self-heals without restart.
5. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **Registering the redirect URIs on the Google OAuth client** — owner console action (called out above and for the issues log); code cannot do it.
- **Performing the current reauth** — owner action; blocked on the same registration.
- **An offline write-queue for calendar mutations** — new feature; the copy fix removes the false promise instead. Log as a future-idea if desired.
- **The header health pill's click-through** — PHASE-25.
