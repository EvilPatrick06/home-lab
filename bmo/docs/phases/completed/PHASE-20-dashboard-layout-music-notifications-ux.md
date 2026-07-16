# PHASE-20 — bmo dashboard layout, music & notification-history UX round

> Authored 2026-07-02 from `bmo/docs/phases/QA/QA-report-2026-07-02.md` (run 4, live deploy `4c7bcd82`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Round up the report's remaining **dashboard-frontend** findings (medium×1, low×3, info×4) into one frontend pass:

1. **Header unreachable at phone width** — at 375 px the top header keeps its ~526 px intrinsic width (`overflow-x: visible`), so the notification bell (x=482) and connection dot are clipped off-screen. *(medium — completes what PHASE-17 17B started)*
2. **Bottom tab bar overflows with no affordance** at 375 px (8 tabs, scrollWidth 560, `overflow-x: auto`). *(low)*
3. **Now-playing duration renders long tracks as MM:SS** — `0:06 / 200:00` for a 3h20m track; History shows `3:20:01` for the same song. *(low)*
4. **History/Lyrics/Queue button row clips at 1024×600** (scrollWidth 475 > clientWidth 433, Queue button cut at the card edge). *(low)*
5. **Queue panel always says "Queue (0 songs) — empty"** while the backend queue holds songs. *(info — but the root cause is a real data-wiring bug, see F5)*
6. **Week view shows a bare "No events"** once the week's events have passed, contradicting Home. *(info — copy fix; the upcoming-only filter is intentional)*
7. **Home "UPCOMING" still lists a long-finished event** — the opposite inconsistency. *(info)*
8. **Notification bell badge/history vanish on reload** despite server-side `alert_history.json` and an existing `GET /api/alerts/history`. *(info)*

PLANNING/AUTHORING ONLY. Categories: **UX (medium/low/info)** — gated on the status board per the autonomy policy. Frontend-only (`index.html` + `bmo.js`); no Python; no JS unit harness, so verification is diff review + acceptance walks, per PHASE-17 precedent.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@b1128097`; the web frontend is byte-identical between the tested deploy `4c7bcd82` and HEAD. Re-anchor lines before editing (rule 3).
- **20A finishes PHASE-17 17B.** 17B added `truncate min-w-0` to the location span and `whitespace-nowrap` to the clock — but `truncate` never engages because the **containing flex items** (`div.flex.items-center.gap-3`) keep their default `min-width: auto`, so the header's content refuses to shrink and overflows to the right instead. The QA measurement (`header.scrollWidth=526`, `overflow-x: visible`) is exactly that. The fix is at the flex-container level, not the leaf span.
- **Purged-Tailwind constraint (PHASE-17 lesson):** the dashboard serves a prebuilt, purged `web/static/css/tailwind.css` — **no `sm:`/`md:` breakpoint variants and only utilities already referenced survive**. Before using any class, grep the built CSS; otherwise use inline `style=""` or extend `web/static/css/bmo.css`. This constrains every sub-phase below and is called out per step.
- **Queue-panel fix (20C) touches only fetch wiring + copy**, not `music_service.get_queue()` — the endpoint already returns the right shape (`{queue: current+upcoming, queue_index: 0}`, `bmo/pi/services/music_service.py:703-707`).

## Verified findings

All citations verified 2026-07-02 against `origin/master@b1128097`.

### F1 — Header content cannot shrink: flex children lack `min-w-0`, so the bell/status dot overflow off-screen at 375 px

**Status: confirmed (Medium/UX).** `bmo/pi/web/templates/index.html:41-85`: `<header class="h-[60px] shrink-0 bg-surface flex items-center justify-between px-4 …">` contains two `div.flex.items-center.gap-3` groups (left: clock + date; right: health pill + temp + location + bell + status dot). Neither group has `min-w-0`/`overflow-hidden`, so their default `min-width: auto` makes the header's intrinsic width the sum of all children (~526 px measured). The 17B `truncate min-w-0` on the location **span** (`:56`) can't help because its parent group won't shrink. Result at 375 px: right group pushes past the viewport; bell (`:58-63`) and dot (`:84`) unreachable.

```bash
sed -n '41,86p' bmo/pi/web/templates/index.html
grep -c 'sm:' bmo/pi/web/static/css/tailwind.css   # expect 0 — no breakpoint variants in the purged build
```

### F2 — Bottom nav relies on invisible horizontal scroll at phone width

**Status: confirmed (Low/UX).** `<nav class="h-[60px] shrink-0 bg-surface border-t border-surface-light flex overflow-x-auto z-10 relative">` (`index.html:2064`) with 8 fixed-width tab items (scrollWidth 560 measured). At 375 px, Cal/Timers/Settings are off-screen; the only affordance is a partial icon sliver.

### F3 — Transport-card time formatter has no hours branch

**Status: confirmed (Low/bug).** `formatTime` (`bmo/pi/web/static/js/bmo.js:3200-3205`) renders total-minutes:seconds (`200:00` for 12001 s). The transport card uses it for both position and duration (`index.html:888-889`). The sibling `formatCountdown` (`bmo.js:3207-3214`) already has the correct h:mm:ss branch; list surfaces use the server-supplied `duration` string and are correct.

```bash
sed -n '3200,3215p' bmo/pi/web/static/js/bmo.js
grep -n 'formatTime(musicState' bmo/pi/web/templates/index.html
```

### F4 — History/Lyrics/Queue row can't wrap or shrink at 1024 px

**Status: confirmed (Low/UX).** The row is the tail of the transport-controls flex (`index.html:~893-955`): fixed-size circular transport buttons, a `flex-1` spacer, then three padded text buttons (History `:942`, Lyrics `:946`, Queue `:949`). No `flex-wrap`, no shrink on the text buttons → the Queue button (right edge 928) clips past the card (right edge 886) at 1024×600.

### F5 — Queue panel binds `musicState.queue`, which no code path ever populates

**Status: confirmed (Info→bug on investigation).** The panel header/count and list iterate `musicState.queue` (`index.html:701`, `:707-710`), and the empty state keys off the same. But `/api/music/state` (→ `MusicService.get_state()`, `bmo/pi/services/music_service.py:511-558`) returns `queue_length`/`queue_index` **without a `queue` array**, and `bmo.js` never fetches `GET /api/music/queue` (`bmo/pi/routes/music_api.py:238-240`, → `get_queue()` at `music_service.py:703-707`, which returns the current+upcoming slice re-indexed to 0). So `(musicState.queue || []).length` is always 0 — the panel is permanently "empty" regardless of backend state. The QA's copy point stands too: `get_queue()` deliberately hides already-played entries, so "Queue (N)" copy should read as "Up next"-style.

```bash
grep -n 'musicState.queue\b' bmo/pi/web/templates/index.html | head
grep -n "'/api/music/queue'\|music/queue\b" bmo/pi/web/static/js/bmo.js   # only queue/add + queue/remove — no reader
sed -n '703,708p' bmo/pi/services/music_service.py
```

### F6 + F7 — Week view hides past events (intentional) while Home's Upcoming card shows them (not intentional): opposite filters, contradictory surfaces

**Status: confirmed (Info/UX).** `getFilteredCalEvents()` (`bmo.js:1878-1901`) documents the Week/Month/Year upcoming-only filter as deliberate ("UPCOMING only — drop events that have already ended"), so the Week fix is **copy**: the shared empty state is a bare "No events" (`index.html:1161`). Meanwhile the Home "Upcoming" card renders `calEvents.slice(0, 3)` **unfiltered** (`index.html:192-199`), so a long-ended event stays pinned all day — the actual filtering bug of the pair.

### F8 — `notificationHistory` is Alpine-session-only; a server-side feed and endpoint already exist

**Status: confirmed (Info/UX).** The bell dropdown iterates `notificationHistory` (`index.html:65-81`), which only `showNotification()` appends to at runtime — nothing seeds it on init, so any reload (nightly kiosk refresh, cf_expired reload) empties it. Server-side: `alert_service` persists `data/alert_history.json` and `GET /api/alerts/history?limit=N` exists (`bmo/pi/app.py:2448-2454`); `bmo.js` even has `fetchAlerts()` (`:4765-4772`) — but it feeds `recentAlerts` (the proactive-alert surface), not the bell history.

```bash
grep -n 'notificationHistory' bmo/pi/web/static/js/bmo.js | head
sed -n '2448,2455p' bmo/pi/app.py
```

## Sub-phases

> Frontend-only; no JS harness — per-sub-phase check = careful diff + browser walk at 375 px / 1024×600 / desktop. Respect the purged-Tailwind constraint everywhere (grep the built CSS before using a class; fall back to inline styles or `bmo.css`). One commit at phase end.

### 20A — Make the header shrinkable: bell + status dot reachable at 375 px

**Objective:** at 375 px the header stays one row within the viewport, the bell and connection dot are visible/tappable, and low-priority items (location, date, temp) give way first.

**Files:** `bmo/pi/web/templates/index.html` (`:41-85`).

**Steps:**

1. Give both header groups shrink permission: add `min-w-0` to the left and right `div.flex.items-center.gap-3` (class exists in the built CSS — 17B shipped it on the span) and `overflow-hidden` to the left group so the date can ellipsise.
2. Pin the must-reach controls: on the bell wrapper (`:58`) and status dot (`:84`) add `shrink-0` so they never collapse; same for the health pill if the owner prefers it always visible (recommended: pill `shrink-0`, since it's the primary status surface).
3. Let the flexible text yield: `truncate` on the date span (`:46`) and keep 17B's `truncate min-w-0` on the location span — now effective because the ancestors shrink. If the row is still too tight at 375 px with all items truncated to zero, hide the location span entirely below a width using an Alpine binding (`x-show="window.innerWidth > 480"` evaluated on resize) rather than a Tailwind breakpoint (none exist in the purged build) — or simply accept full truncation (preferred: fewer moving parts).
4. Verify the bell dropdown (`:64`, `w-72 absolute right-0`) still fits at 375 px (it's 288 px wide — fine), and that kiosk 1024×600 and desktop are pixel-unchanged when content fits.

**Cheap check:** browser at 375×812 — bell + dot visible and tappable, header one row, no horizontal scroll; kiosk width unchanged.

**Acceptance:** QA repro (375 px: tap the bell) succeeds; `header.scrollWidth <= clientWidth` at 375 px; wider layouts unchanged.

### 20B — Bottom-nav overflow affordance at narrow widths

**Objective:** at phone width it's visually obvious more tabs exist to the right.

**Files:** `bmo/pi/web/templates/index.html` (`:2064` nav + tab items).

**Steps:**

1. Preferred (fits the purged-CSS constraint): compress tab items at narrow widths so all 8 fit — reduce per-item horizontal padding and hide the text labels (icon-only) when the viewport is narrow, via an Alpine width flag (as in 20A step 3) or a CSS rule added to `bmo/pi/web/static/css/bmo.css` under a standard `@media (max-width: 600px)` (hand-written CSS is exempt from the Tailwind purge).
2. If compression can't fit all 8, add a right-edge fade hint instead: a `pointer-events-none` gradient overlay on the nav's right edge, shown only when `nav.scrollWidth > nav.clientWidth` && not scrolled to end (small Alpine scroll listener).

**Cheap check:** 375 px — either all tabs visible (icon-only) or a clear fade hint that disappears at scroll-end; 1024×600 unchanged.

**Acceptance:** no tab is silently unreachable at 375 px; wall-display layout unchanged.

### 20C — One h:mm:ss formatter; queue panel reads the real queue and says "Up next"

**Objective:** the transport readout matches History for 1h+ tracks, and the Queue panel reflects backend state with honest copy.

**Files:** `bmo/pi/web/static/js/bmo.js` (`formatTime` `:3200`, queue state + panel wiring), `bmo/pi/web/templates/index.html` (`:699-731` queue panel, `:888-889` readout).

**Steps:**

1. **Formatter:** add an hours branch to `formatTime` mirroring `formatCountdown` (`h:mm:ss` when `sec >= 3600`); all existing call sites benefit (position will correctly tick into hours on 1h+ tracks). Don't touch `formatCountdown`.
2. **Queue data:** populate the panel from the real endpoint — fetch `GET /api/music/queue` when the panel opens (`showQueue = true` click at `:949` → call a new `fetchQueue()` storing into e.g. `queueView`), and refresh it on the `music_state`/queue-mutating socket events while the panel is open (or simply re-fetch after `addToQueue`/`removeFromQueue`, `bmo.js:1787`, `:1797`). Bind the panel's count, list, and empty state to `queueView` instead of the never-populated `musicState.queue`. Note `get_queue()` re-indexes `queue_index` to 0 — the current-song highlight comparison (`qi === …queue_index`) must use the fetched payload's index, not `musicState.queue_index`.
3. **Copy:** retitle the panel "Up next" (`:701`) so hiding already-played entries reads as intended; empty state → "Nothing queued next — search for songs to add".
4. **Remove-button index fix that falls out of 2:** `removeFromQueue(qi)` posts the on-screen index to `/api/music/queue/remove`, whose service-side handler maps a visible index to the real one — verify the mapping still holds against the fetched `queueView` (read `music_service.remove_from_queue`, `:689-701`) and adjust the offset if needed.

**Cheap check:** play a 3h track → readout `3:20:01`-style and matches History; queue 2 songs → panel shows them with the playing one highlighted; remove works; empty queue shows the new copy.

**Acceptance:** transport duration/position format matches History for hour-long tracks; the panel reflects `GET /api/music/queue` truthfully with "Up next" copy; add/remove round-trips update it.

### 20D — Music button row fits at 1024×600

**Objective:** History/Lyrics/Queue all render fully at the wall-display width.

**Files:** `bmo/pi/web/templates/index.html` (transport row `:893-955`).

**Steps:**

1. Allow the row to wrap (`flex-wrap` on the transport-controls container — class present in built CSS? grep; else inline style) **or** slim the three text buttons (smaller `px-*` present in the built CSS, or icon+tooltip below a width flag). Choose whichever keeps the transport cluster on one line at 1024 px with the text buttons intact; wrapping the three text buttons to a second line is acceptable.
2. Confirm no overlap with the progress bar/readout above and the card's rounded edge (the QA clip was at the card boundary).

**Cheap check:** 1024×600 — all three buttons fully visible/clickable; desktop unchanged.

**Acceptance:** `row.scrollWidth <= clientWidth` at 1024×600; no clipped button.

### 20E — Consistent now-forward calendar surfaces + Week empty-state copy

**Objective:** Home and Week agree about "what's left", and the Week empty state explains itself.

**Files:** `bmo/pi/web/templates/index.html` (`:192-199` Upcoming card, `:1161` empty state), `bmo/pi/web/static/js/bmo.js` (reuse `getFilteredCalEvents` helpers `:1878`).

**Steps:**

1. **Home card:** filter to genuinely upcoming events — reuse the `endMs(e) >= now` predicate from `getFilteredCalEvents` (factor a tiny `upcomingCalEvents()` getter returning `calEvents.filter(e => endMs(e) >= Date.now()).slice(0, 3)`), and bind the card's `x-for` + `x-show` to it. An in-progress event (started, not ended) should still show — `endMs >= now` gives exactly that.
2. **Week empty-state copy:** where `calDays === 7` (and analogously 31/365 if desired), render "No more events this week" instead of the bare "No events" (`:1161` — make the string conditional on `calDays`). Day view (`calDays === 1`) keeps its own semantics (shows past events by design).

**Cheap check:** with only an already-ended event today: Home card shows nothing (or the next future event), Week says "No more events this week" — the two surfaces no longer contradict.

**Acceptance:** no surface lists an event that ended hours ago as "Upcoming"; the Week empty state states its now-forward semantics.

### 20F — Seed the bell's notification history from the server on load

**Objective:** a page reload no longer wipes the "what did I miss" trail.

**Files:** `bmo/pi/web/static/js/bmo.js` (init path + `notificationHistory`), optionally none server-side (`GET /api/alerts/history` exists).

**Steps:**

1. On init, fetch `/api/alerts/history?limit=10` and map entries into `notificationHistory`'s `{text, time}` shape (inspect an `alert_history.json` entry via the endpoint to get field names — likely `message`/`timestamp`; format `time` with the existing helper `showNotification` uses). Mark seeded items visually identical; do **not** bump `unreadNotifications` for seeded history (they're history, not new).
2. Keep per-item dismiss working (it splices the array — fine). Runtime `showNotification` entries prepend as today.
3. If the alert-history entries prove too noisy/mismatched with the toast-history concept (they're proactive alerts, not every toast), scope the seed to the last N alerts only and note the decision in the commit; a full server-side toast journal is out of scope.

**Cheap check:** trigger a couple of alerts, reload → the panel shows them (badge stays 0); dismiss still works.

**Acceptance:** after reload the bell dropdown shows recent server-side history instead of "No notifications"; unread badge unaffected by seeding.

## Test plan

- Frontend-only: careful diff + browser acceptance walks at **375×812**, **1024×600 (kiosk)**, desktop — header reachability, nav affordance, 3h-track readout, queue round-trip, calendar-surface consistency, reload-seeded bell. `node --check bmo.js` (PHASE-17 precedent). No Python touched → `bmo-pi-pytest.yml` must stay green untouched; no-new-prints N/A.
- Purged-CSS discipline: every new class grepped in `web/static/css/tailwind.css` first; otherwise `bmo.css`/inline style (documented per sub-phase).

## Acceptance criteria

1. At 375 px: bell + status dot reachable, header single-row, all nav tabs reachable with a visible affordance.
2. Transport readout uses h:mm:ss for 1h+ tracks, matching History; Queue panel shows the real backend queue under "Up next" copy and updates on add/remove.
3. History/Lyrics/Queue fully visible at 1024×600.
4. Home Upcoming and Calendar Week agree (now-forward); Week's empty state self-explains.
5. Bell history survives reload, seeded from `/api/alerts/history`, badge unaffected.
6. `bmo-pi-pytest.yml` green (no Python change); one commit; plan moved to `completed/`.

## Out of scope (not re-planned — verified non-actionable or owned elsewhere)

- **`/ide` AudioContext console flood** (report §8) — flagged **unverified / likely headless-Chromium artifact** (no audio device in the test browser). Re-check in a real browser during the next QA run before planning; nothing actionable at HEAD.
- **Chat-agent time vs. header clock (Pi TZ America/Denver vs. location Overland Park KS)** (report §5) — the clock-rendering split is **intentional** per `bmo/docs/DESIGN-CONSTRAINTS.md` (~line 74, "owner/config decision"); the actionable half is an **owner action** (`timedatectl set-timezone` or fix the location config — the report itself notes the calendar events match the Pi TZ, so which side is stale is genuinely the owner's call). Not plannable as code; already recorded in the report for the owner.

## Completed

Implemented 2026-07-15 (owner-approved via the status board) on `auto/bmo-phase-executer`.

- **20A** — header groups get `min-w-0` (+ `overflow-hidden` left, so the date can ellipsise); clock/pill/temp/bell/status-dot pinned `shrink-0`/`whitespace-nowrap`; date span `truncate` (`bmo/pi/web/templates/index.html:45-95`). Right group deliberately NOT `overflow-hidden` — it would clip the absolutely-positioned bell dropdown. Full-truncation accepted per plan step 3 (preferred: fewer moving parts; no width-flag hiding).
- **20B** — phone-width tab compression via hand-written `bmo/pi/web/static/css/bmo.css:287-296` (`@media (max-width:600px)`: `.tab-btn` min-width 46px, `.tab-label` hidden → 8×46=368px fits 375px); hooks added in `index.html:2076-2084`. Purged-Tailwind constraint respected (no breakpoint variants exist in the built CSS).
- **20C** — `formatTime` hours branch mirroring `formatCountdown` (`bmo/pi/web/static/js/bmo.js:3289-3299`); queue panel reads `queueView` from `GET /api/music/queue` via new `fetchQueue()` (`bmo.js:1799-1808`, state `:205-209`), fetched on panel open (`index.html:961`), on `music_state` socket events while open (`bmo.js:791-794`), and after add/remove (`bmo.js:1818,1832`); copy retitled "Up next (N songs)" / "Nothing queued next — search for songs to add" (`index.html:713-719`). Remove-index mapping verified against `music_service.remove_from_queue` (visible index + `queue_index` offset) — on-screen index is exactly what the endpoint expects; no offset change needed.
- **20D** — `flex-wrap` on the transport-controls row so History/Lyrics/Queue wrap instead of clipping at 1024×600 (`index.html:907`).
- **20E** — new `upcomingCalEvents()` (end >= now, in-progress still shows) drives the Home Upcoming card (`bmo.js:1905-1913`, `index.html:196-200`); Week/Month/Year empty state self-explains ("No more events this week/month/year", `index.html:1179-1182`).
- **20F** — `seedNotificationHistory()` seeds the bell from `GET /api/alerts/history?limit=10` on init, mapping `title`/`body`/`timestamp` (epoch-seconds) into the `{text, time, type}` shape; never bumps the unread badge; skips if runtime toasts already populated the list (`bmo.js:4867-4886`, init hook `:559-561`). Scoped to proactive alerts per plan step 3 — a full toast journal stays out of scope.
- **Verification:** `node --check bmo.js` clean; no Python touched by this phase; targeted pytest of adjacent suites green (13 passed). Browser walks at 375px/1024×600 ride the owner-run deploy (rule 6).
