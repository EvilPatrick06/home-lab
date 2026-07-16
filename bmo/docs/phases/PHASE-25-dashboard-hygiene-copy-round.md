# PHASE-25 — bmo dashboard hygiene & copy-truth round (health-pill detail, nudge interleave, playlist counts, ggpht CSP, Wi-Fi form, copy nits)

> Authored 2026-07-15 from `bmo/docs/phases/QA/QA-report-2026-07-15.md` (run 5, live deploy `d6699d52`, runtime identical to `e03664fa`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Round up the report's remaining low/info findings into one hygiene pass:

1. **The health pill is a dead click** — `@click.stop=""` swallows the tap; a user staring at `BMO ⚠ calendar` has no in-dashboard way to learn what's wrong. *(low, UX — §1)*
2. **Proactive quips interleave into a pending chat request** — "BMO notices you haven't set any timers. Need one?" landed under the user's message mid-request, reading as the answer; the real (failure) reply then landed after it. The no-timers trigger is also questionable on its own. *(low, UX — §2)*
3. **Playlist results label view-counts as "tracks"** ("941K tracks", "2.6M tracks") — the ytmusicapi community-playlist `itemCount` passthrough carries a views figure for some providers. *(low, bug — §3)*
4. **Playlist thumbnails from `yt3.ggpht.com` are CSP-blocked** — the `img-src` allow-list has the newer googleusercontent hosts but not the older ggpht CDN that playlist search still returns. *(low, bug — §3)*
5. **Wi-Fi password input renders outside a `<form>`** — Chrome logs the DOM warning on every page load, and password-manager semantics break. *(info, debt — §1)*
6. **Copy/affordance nits, batched** *(info — §5/§9)*: the alarm-silent toast claims "Alarm volume is 0%" when it's actually the master volume that's 0; the whole header is a silent tap-target for the Calendar tab; the Wi-Fi "Browser Permissions" block recommends a browser-security-weakening chrome flag as the documented mic path.

PLANNING/AUTHORING ONLY. Categories: **UX/debt/info (low/info) + bug (low ×2)** — the two low bugs (playlist counts, ggpht CSP) auto-implement; the rest gates on the status board per the autonomy policy. Mixed tiny backend (`music_service.py`, `app.py` CSP) + frontend (`index.html`, `bmo.js`); backend parts pytest-coverable.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@f2300ac8` (2026-07-15). Re-anchor before editing (rule 3).
- **25A (health-pill detail) extends PHASE-17** (pill names the failing subsystem) and complements PHASE-24C (as-of stamps) — coordinate if 24 lands first: 25A's popover should render the same `/api/health/full` fields 24C stamps. It must not collide with PHASE-20A's header shrink work (`index.html:41-85`): 25A adds a handler on the pill span only; 20A touches the flex-group classes. Same file, different attributes — merge-friendly but re-anchor.
- **25B's chat-surface guard** is intentionally frontend-side (queue at render) so it also covers server-pushed quips that race a request; PHASE-22C's error events are unaffected.
- **CSP precedent:** PHASE-14 added Google Fonts host-scoped; 25D follows the same host-scoped (no wildcard) pattern per the CSP comment block (`app.py:195-202`), unless the executer finds multiple ggpht shards in real payloads — then `https://*.ggpht.com` with a comment is acceptable (note the choice in `## Completed`).
- **The narrow-viewport findings (§1) are NOT here** — already planned in PHASE-20A/20B (header shrink, nav affordance). The unmute CTA, OLED face, and queue-panel findings are PHASE-19B/19D/20C. The chrome-flags advice item (25F step 3) is *copy-scoping only* — serving the dashboard over LAN HTTPS is an infra decision logged as a suggestion, not planned.

## Verified findings

All citations verified 2026-07-15 against `origin/master@f2300ac8`.

### F1 — Health pill swallows its click and has no handler

**Status: confirmed (Low/UX).** `<span :class="healthPillClass()" … x-text="healthSummary" @click.stop></span>` (`bmo/pi/web/templates/index.html:49-50`). The empty `@click.stop` exists because the whole header is a Calendar-tab tap-target (`@click="tab = 'calendar'"`, `:41-42`) — the pill opts out of that but offers nothing of its own. `/api/health/full` already returns per-component status (used by the pill text pipeline, `bmo.js:1150-1170` region; pill text at `:138`).

```bash
sed -n '41,52p' bmo/pi/web/templates/index.html
grep -n 'healthSummary\|health/full' bmo/pi/web/static/js/bmo.js | head
```

### F2 — Personality quips post into the transcript regardless of a pending request; the no-timers nudge exists in the quip pool

**Status: confirmed (Low/UX).** The personality engine's `_deliver` emits `bmo_quip` over socket.io unconditionally (`bmo/pi/services/game/personality_engine.py` — `_deliver` at the "Deliver a personality message" def; idle-quip trigger at `:118-122`); the quip pool contains "BMO notices you haven't set any timers. Need one?" (`bmo/pi/data/personality/quips.json:21`). Frontend: the `bmo_quip` handler (`bmo.js:1038-1060`) dedupes repeats but renders immediately — it never checks `this.status === 'thinking'`, so a quip can land between the user turn and the assistant reply, styled like a normal message.

```bash
grep -n '_deliver\|idle_quips' bmo/pi/services/game/personality_engine.py | head
sed -n '1038,1062p' bmo/pi/web/static/js/bmo.js
grep -n "haven't set any timers" bmo/pi/data/personality/quips.json
```

### F3 — `itemCount` is a raw provider passthrough rendered as "tracks"

**Status: confirmed (Low/bug).** Backend passthrough: `"itemCount": r.get("itemCount", "")` in `search_playlists` (`bmo/pi/services/music_service.py:916-933`); template renders `pl.itemCount ? pl.itemCount + ' tracks' : ''` (`bmo/pi/web/templates/index.html:461`). For community-playlist results ytmusicapi fills `itemCount` with the *views* figure for some result shapes ("941K"), so the UI claims a 941 K-track playlist.

```bash
sed -n '916,934p' bmo/pi/services/music_service.py
sed -n '460,462p' bmo/pi/web/templates/index.html
```

### F4 — CSP `img-src` omits `yt3.ggpht.com`

**Status: confirmed (Low/bug).** `img-src 'self' data: blob: https://yt3.googleusercontent.com https://lh3.googleusercontent.com https://i.ytimg.com` (`bmo/pi/app.py:199-202`) — playlist-search artwork on the older `yt3.ggpht.com` host is blocked (console violation captured by QA); those tiles render blank.

```bash
sed -n '195,203p' bmo/pi/app.py
```

### F5 — Wi-Fi password input is form-less

**Status: confirmed (info/debt).** `<input :type="wifiShowPassword ? 'text' : 'password'" x-model="wifiPassword" …>` (`bmo/pi/web/templates/index.html:1953`) — present in the DOM on every tab (the Settings tab is `x-show`, not conditionally rendered), not wrapped in a `<form>`, no `autocomplete` attributes → Chrome's "[DOM] Password field is not contained in a form" on every load.

### F6 — Copy/affordance nits

**Status: confirmed (info).**
- **Alarm-silent toast:** `_warnIfAlarmSilent()` fires one fixed string ("Alarm volume is 0% …") whenever `v.alarms === 0 || v.system === 0` (`bmo/pi/web/static/js/bmo.js:2421-2428`) — with alarms at 39 % and master at 0 the named culprit is wrong (the advice is right).
- **Whole-header tap-target:** `@click="tab = 'calendar'"` on `<header>` (`index.html:41-42`) — taps on the clock/weather/empty space silently switch tabs, no affordance, no pressed state.
- **Chrome-flags advice:** the Settings "Browser Permissions" block documents `chrome://flags/#unsafely-treat-insecure-origin…` as the laptop-mic path (locate: `grep -n 'unsafely-treat\|Browser Permissions' bmo/pi/web/templates/index.html`).

## Sub-phases

> One commit at phase end. 25C/25D are the auto-implement bugs; the rest is gated UX/debt/info. Backend steps get targeted pytest; frontend steps are diff-review + acceptance-walked (no JS harness).

### 25A — Wire the health pill to a health-detail popover (gated: UX)

**Objective:** tapping the pill shows per-component status + the recommended action, fed by `/api/health/full`.

**Files:** `bmo/pi/web/templates/index.html` (`:49-50` + a popover block near the bell dropdown pattern `:64+`), `bmo/pi/web/static/js/bmo.js` (fetch + state).

**Steps:**

1. Replace the empty `@click.stop` with `@click.stop="toggleHealthPopover()"`; add a dropdown panel styled like the bell history (`w-72 absolute right-0` pattern) listing each non-`up` component from `/api/health/full` — label, status, `message`, and `recommended_action` when present (fields verified in `monitoring.py get_status`, `:2203-2218`) — and a one-line "all healthy" state.
2. Fetch on open (no polling); reuse/extend the existing health-full fetch if one feeds the pill (check `bmo.js` `health/full` callers first — don't add a second poller).
3. Close on `@click.away` and tab switch; keep the pill's opt-out of the header's Calendar tap.
4. Respect the purged-Tailwind constraint (PHASE-17/20 lesson): grep `web/static/css/tailwind.css` for any new class; fall back to existing classes/inline style.

**Cheap check:** browser walk — pill tap opens the panel naming the calendar failure + action; healthy state shows the all-clear; kiosk width unaffected.

**Acceptance:** the QA repro (click the amber pill) yields actionable detail instead of nothing.

### 25B — Quips never interleave a pending request; retire the no-timers nudge; style quips distinctly (gated: UX)

**Objective:** a proactive quip can't masquerade as the answer to an in-flight question, and the pool stops nagging about a normal state.

**Files:** `bmo/pi/web/static/js/bmo.js` (`bmo_quip` handler `:1038`), `bmo/pi/data/personality/quips.json` (`:21`), `bmo/pi/web/templates/index.html` (quip bubble styling, if quips render via the shared message template).

**Steps:**

1. In the `bmo_quip` handler: if `this.status === 'thinking'`, hold the quip in a small `_pendingQuips` array and flush it after the response lands / watchdog fires (hook the same places that clear `status`); cap the hold (drop after ~2 min — a stale idle quip isn't worth replaying).
2. Tag quip messages (`kind: 'quip'`) and render them visually distinct from assistant replies (dimmed/italic prefix "💭" or similar — smallest diff that reads as "aside, not answer").
3. Remove the "haven't set any timers" line from `quips.json` observations (having no timers is a normal state — report's own call).
4. No backend change (server-side idle detection can't see an in-flight WS request cheaply; the client-side queue covers the race regardless of source).

**Cheap check:** diff review; browser walk — send a chat message, trigger a quip (or emit one via console), observe it renders only after the reply, styled as an aside.

**Acceptance:** no quip appears between a user turn and its reply; the no-timers nudge is gone; quips are visually distinct.

### 25C — Honest playlist counts (auto: bug)

**Objective:** the playlist row shows a real track count or nothing.

**Files:** `bmo/pi/services/music_service.py` (`search_playlists` `:916-933`), `bmo/pi/web/templates/index.html` (`:461`).

**Steps:**

1. In `search_playlists`, sanitize `itemCount`: accept it only when it parses as a plain integer (allow thousands separators) **and** is plausible for a playlist (≤ 10 000 — YT's hard cap is 5 000); otherwise emit `""`. Inspect the raw result for a genuine count field first (`r.get("itemCount")` vs any `videoCount`-like key in the ytmusicapi payload — dump one live/recorded response; prefer the correct field over clamping if one exists, and note which in `## Completed`).
2. Template: unchanged (`pl.itemCount ? … : ''` already hides empties); adjust only if the sanitized value needs formatting.
3. Pytest: mapping unit test with a recorded result carrying a views-shaped `itemCount` ("941K" or 941000) → sanitized out; a real count (e.g. 42) → passed through.

**Cheap check:** `python -m pytest tests/test_music*.py -q` (or nearest module).

**Acceptance:** no "941K tracks"-class labels; genuine counts still render.

### 25D — Allow `yt3.ggpht.com` in `img-src` (auto: bug)

**Objective:** playlist artwork loads for all YT CDN hosts search actually returns.

**Files:** `bmo/pi/app.py` (`:199-202`), plus the CSP test module if one exists (`grep -rn 'img-src' bmo/pi/tests`).

**Steps:**

1. Add `https://yt3.ggpht.com` to `img-src`, with a one-line comment (older YT CDN host still used by community-playlist thumbnails). Host-scoped per the block's existing pattern; widen to `https://*.ggpht.com` only if live payloads show other shards (note the decision).
2. Pytest: extend/add the header assertion that `img-src` contains the host.

**Cheap check:** targeted pytest; browser walk — Playlists results render artwork, console clean of ggpht violations.

**Acceptance:** no CSP img violations for playlist results; allow-list stays host-scoped.

### 25E — Wrap Wi-Fi credentials in a `<form>` (gated: debt)

**Objective:** the console warning stops firing on every load; password-manager semantics work.

**Files:** `bmo/pi/web/templates/index.html` (`:1953` block).

**Steps:**

1. Wrap the SSID + password inputs in `<form @submit.prevent="…existing connect handler…">`, make the connect button `type="submit"`, and add `autocomplete="off"` on the form (kiosk shouldn't offer to save the home Wi-Fi to random browsers) — or `current-password` if the owner prefers manager support; default to `off` and note it.
2. Verify no Alpine handler regression (the connect action must still fire once).

**Cheap check:** browser walk — connect still works; console clean of the DOM warning.

**Acceptance:** no "[DOM] Password field…" warning on load; Wi-Fi connect unchanged.

### 25F — Copy/affordance nit batch (gated: info)

**Objective:** the three verified nits stop lying/surprising.

**Files:** `bmo/pi/web/static/js/bmo.js` (`_warnIfAlarmSilent` `:2421`), `bmo/pi/web/templates/index.html` (`:41-42` header; Browser Permissions block).

**Steps:**

1. **Alarm toast names the real culprit:** branch on which level is 0 — alarms-0 → "Alarm volume is 0% …"; system-0 (alarms > 0) → "Master volume is 0% — alarms will be silent. Raise Master volume in Settings."; both → name both.
2. **Header hotspot:** limit the Calendar shortcut to the clock/date group (move `@click` from `<header>` to the left `div.flex` group), add `cursor-pointer` + a subtle active/pressed style so the affordance is discoverable; verify the pill/bell `@click.stop`s can then be simplified (bell keeps its own handler). Coordinate with PHASE-20A (same lines).
3. **Chrome-flags advice:** keep the instructions (they are the only current laptop-mic path) but scope them with an explicit warning that the flag weakens browser security, applies per-origin only, and should list exactly the dashboard origin; add a pointer that the durable fix is HTTPS on the LAN. Log the LAN-HTTPS idea to `docs/logs/BMO-SUGGESTIONS-LOG.md` (rule 12) rather than planning it here.

**Cheap check:** diff review; walk — master-0 alarm toast names Master; header taps outside the clock no longer switch tabs.

**Acceptance:** toast copy matches the actual zero volume; the calendar shortcut is discoverable and bounded; the flag advice carries the security caveat.

## Test plan

- **Backend (25C, 25D):** targeted pytest; full sweep via `bmo-pi-pytest.yml`; `ruff check`; no new bare `print()`s.
- **Frontend (25A, 25B, 25E, 25F):** no JS harness — diff review + acceptance walks (pill popover, quip-during-request, Wi-Fi form, header hotspot) at kiosk 1024×600 and desktop, on the owner-run deploy (rule 6).

## Acceptance criteria

1. The health pill opens a detail popover naming failing components and actions.
2. Quips queue behind in-flight requests, render as asides, and the no-timers nudge is retired.
3. Playlist rows never display view-counts as track counts; ggpht artwork loads CSP-clean.
4. No form-less password warning; alarm toast and header hotspot behave as specified.
5. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **LAN HTTPS for the dashboard** (the durable mic-permission fix) — infra/owner decision; logged as a suggestion (25F step 3).
- **Narrow-viewport header/nav** — PHASE-20A/20B. **Unmute CTA / OLED face / queue panel** — PHASE-19B/19D/20C.
- **Server-side quip scheduling changes** (idle detection, per-surface budgets) — the client-side queue suffices for the reported race.
