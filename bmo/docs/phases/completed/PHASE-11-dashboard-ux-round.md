# PHASE-11 — bmo dashboard UX round

> Authored 2026-06-28 from `bmo/docs/phases/QA/QA-report-2026-06-28.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Close the frontend/UX findings from the 2026-06-28 QA pass — the first to drive the rendered SPA — so the dashboard guides the user to act on broken states instead of leaving them at a dead end. Five disjoint frontend fixes: (1) the most-visible "something is wrong" signal — the header `⚠ calendar` badge — is a non-interactive `<span>`, so clicking it does nothing while the actual re-authorize control sits several clicks deep under Settings → System Status; (2) the Calendar tab renders a bare "No events" whether the calendar is empty **or** unauthorized/down, giving a user no hint the integration is broken; (3) the add-event form's validation toast says "Fill in title and date" even when the title is already filled and only the date is missing; (4) the TV "Pair with TV" flow jumps straight to "Enter the PIN shown on your TV" with no hint that the TV must be powered on/reachable, so a user can wait for a PIN that can't appear; and (5) two console-hygiene items — the geolocation Permissions-Policy info logged twice on load, and the Google Places/Maps JS browser key failing its referrer check with only a console-only warning (the referrer allowlist fix itself is an owner/cloud-console item — see PHASE-INDEX provenance).

This phase is **frontend** (`bmo/pi/web/templates/index.html`, `bmo/pi/web/static/js/bmo.js`) plus a small TV-route reachability surface and a one-line README/IDE doc reconciliation. The calendar API already returns the `needs_auth`/`offline` flags the Cal tab needs (PHASE-05/07 territory) — this phase only renders them.

PLANNING/AUTHORING ONLY. No live-Pi mutation, no cloud-console change (rule 6) — the Maps referrer-allowlist fix is surfaced as an owner step; this phase ships the in-repo UX.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@a2d87c53`. Continues the dashboard-UX lineage (**PHASE-03**, **PHASE-06**). The Cal-tab auth state (11B) consumes the `needs_auth`/`offline` shape the calendar API already returns (`calendar_api.py:59-110`), so no backend change is needed.
- **Independent of PHASE-09 (chat) and PHASE-10 (health).** Disjoint files: PHASE-10 writes the notification-feed *data* for a critical service-down; 11A makes the header badge a *deep-link* to System Status — complementary, no collision. The two reuse the **existing** `startCalendarAuth()` / `showStatusDetail` affordances rather than adding new ones.
- **Frontend test boundary:** `bmo.js`/`index.html` have no unit-test harness in this repo (per PHASE-02/03); the gate for these edits is a surgical diff reviewed against the cited handlers + the Python-side checks for any `tv_api.py` change. Keep each edit self-contained.
- **Live-Pi / cloud boundary (rule 6):** the Maps/Places browser-key **referrer allowlist** (add `bmo.mybmoai.work`) is a Google Cloud Console change the executer must **not** make — 11E only gates/labels the feature client-side; the allowlist is an owner step (PHASE-INDEX provenance, already flagged in `DESIGN-CONSTRAINTS` 69-70).

## Verified findings

All citations verified 2026-06-28 against `origin/master@a2d87c53` (report tested live process `568af48a`; line numbers re-anchored to current HEAD — INSTRUCTIONS.md rule 3). The dashboard template is `bmo/pi/web/templates/index.html`; the SPA logic is `bmo/pi/web/static/js/bmo.js`.

### F1 — The header `⚠ calendar` status badge is a non-interactive `<span>`; the re-auth path is buried in Settings

**Status: confirmed.** The header status indicator is `<span … x-text="statusText">` (`index.html:157`) with **no `@click`** — clicking it does nothing. The actual recovery affordance is the System Status detail, opened by `@click="showStatusDetail = true; fetchDetailedStatus()"` on the Settings-tab "📊 System Status" header/div (`index.html:1407,1411`), which contains the calendar re-authorize button `@click="showStatusDetail = false; tab = 'calendar'; startCalendarAuth()"` (`index.html:2404`). So the most-prominent warning is a dead end while its fix is several clicks away.

```bash
sed -n '155,159p'   bmo/pi/web/templates/index.html           # header status span — x-text, NO @click
sed -n '1404,1412p' bmo/pi/web/templates/index.html           # System Status toggle: showStatusDetail + fetchDetailedStatus
sed -n '2400,2406p' bmo/pi/web/templates/index.html           # re-authorize button (startCalendarAuth)
```

### F2 — The Calendar tab shows a bare "No events" with no indication the calendar is unauthorized/down

**Status: confirmed.** The calendar API already returns the auth state: `/events`, `/today`, `/next` and the blueprint `before_request` all return `{"offline": true, "needs_auth": true, "events": []}` when unauthorized (`calendar_api.py:59-110`), and the frontend tracks `calOffline` (`bmo.js:206`, set on API error at `:1844-1856`, cleared on recover at `:1848-1849`). But the Cal-tab empty state doesn't branch on `needs_auth`/`offline` — it renders the same "No events" whether the calendar is connected-and-empty or broken, so a user concludes they simply have no events. The re-auth control (`startCalendarAuth()`) already exists elsewhere (`index.html:971`, `:2404`) and can be surfaced here.

```bash
sed -n '59,110p'    bmo/pi/routes/calendar_api.py             # /events,/today,/next return {offline, needs_auth, events:[]}
sed -n '204,208p'   bmo/pi/web/static/js/bmo.js               # calOffline state
sed -n '1842,1858p' bmo/pi/web/static/js/bmo.js               # calOffline set/recover on cal fetch
```

### F3 — Add-event validation toast names "title" even when only the date is missing

**Status: confirmed.** The add-event create path shows the static toast `this.showNotification('Fill in title and date')` whenever either field is missing — and the same string appears at **two** call sites (`bmo.js:1978` and `bmo.js:2115`, the create and quick-add paths). With a title present and only the date blank, naming "title" is misleading.

```bash
sed -n '1972,1982p' bmo/pi/web/static/js/bmo.js               # call site 1: 'Fill in title and date'
sed -n '2109,2119p' bmo/pi/web/static/js/bmo.js               # call site 2: same static message
```

### F4 — TV "Pair with TV" jumps to the PIN step with no reachability hint

**Status: confirmed.** With the TV off (`/api/tv/status` → `connected:false`; startup "[tv] ADB connect failed"), the TV tab correctly shows "TV not connected / Pair with TV", but tapping it goes straight to "Enter the PIN shown on your TV" (Cancel/Connect) via `/pair/start` (`tv_api.py:329` `api_tv_pair_start`) with no check that the device is reachable — if the TV is off there will never be a PIN. The status endpoint already does a quick reachability test (`tv_api.py:~305-318`, `connected = _tv_remote is not None` + a connect probe), so a pre-flight signal exists to gate the PIN step on.

```bash
sed -n '300,320p' bmo/pi/routes/tv_api.py                     # status: connected + quick connect test (reachability signal)
sed -n '329,345p' bmo/pi/routes/tv_api.py                     # /pair/start — begins PIN prompt unconditionally
```

### F5 — Console hygiene: geolocation info logged twice; Places/Maps JS key fails referrer check with a console-only warning

**Status: confirmed.** On home-tab load the identical INFO "[bmo] Geolocation disabled by Permissions-Policy — skipping device-location updates." is logged twice in the same tick (`bmo.js:571`), which usually means the location-init path runs twice. Separately, the Places/Maps JS browser key fails to load on the external host: `loadPlacesAPI` logs "[bmo] Google Places API failed to load — check the API key, its HTTP-referrer restriction…" (`bmo.js:35-44`, warning at `:44`); the loader is already lazy (fires on event-form open, `bmo.js:56,61`) per DESIGN-CONSTRAINTS 69-70, but location autocomplete is silently unavailable with only a console warning, no visible feature degradation. The **referrer-allowlist fix** (add `bmo.mybmoai.work` to the browser key) is an owner/cloud-console item (DESIGN-CONSTRAINTS 69-70); the **code half** is to de-dupe the geolocation log and gate/label the location feature when the API is unavailable.

```bash
sed -n '35,62p'  bmo/pi/web/static/js/bmo.js                  # loadPlacesAPI warning + lazy initPlacesAutocomplete
sed -n '568,573p' bmo/pi/web/static/js/bmo.js                 # geolocation Permissions-Policy info (logged twice)
```

## Sub-phases

> Frontend JS/HTML has no unit-test harness in this repo (PHASE-02/03) — keep edits surgical and self-contained, and verify by reading the diff against the cited handlers. The 11D `tv_api.py` change is covered by the `bmo-pi-pytest.yml` gate; do not add bare `print()` (Python) — use the logger.

### 11A — Make the header `⚠ calendar` status badge actionable (deep-link to System Status)

**Objective:** clicking the most-prominent warning opens the System Status detail (which already holds the calendar re-auth button), so the warning is the entry point to its own fix.

**Files:** `bmo/pi/web/templates/index.html`.

**Steps:**

1. Add to the header status span (`index.html:157`) the same handler the Settings "System Status" header uses: `@click="showStatusDetail = true; fetchDetailedStatus()"` plus a `cursor-pointer` class (and an accessible affordance — `role="button"` / `tabindex="0"` / a title) so it's discoverably interactive.
2. Keep the existing `x-text="statusText"` / `:class="statusTextColor"` binding unchanged — only add the click + affordance. Confirm `showStatusDetail` and `fetchDetailedStatus()` are in scope for the header (same Alpine component as the Settings toggle at `:1407`).

**Cheap check:** read the diff; confirm the header span now opens the same modal as `index.html:1407`.

**Acceptance:** clicking the header status badge opens the System Status detail with hardware metrics + the calendar re-authorize row; non-calendar states still render the badge unchanged.

### 11B — Calendar tab: branch the empty state on `needs_auth`/`offline` and surface re-auth

**Objective:** when the calendar is unauthorized/down the Cal tab shows a distinct "Calendar not connected — Authorize" state (reusing `startCalendarAuth()`), not the generic "No events".

**Files:** `bmo/pi/web/templates/index.html` (Cal tab), `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. In the Cal-tab empty state, branch on the `needs_auth`/`offline` flags already returned by `/api/calendar/events` & `/today` (and tracked as `calOffline`, `bmo.js:206,1844-1856`): when `needs_auth`/`offline` is true, render a "Calendar not connected — Authorize" affordance wired to the existing `startCalendarAuth()` (as at `index.html:971,2404`); otherwise keep the plain "No events".
2. Ensure the flags are captured where the Cal tab reads them (if only `calOffline` is currently stored, also retain `needs_auth` from the response so the auth-vs-transient-offline distinction is available). Keep it read-only — no calendar writes.

**Cheap check:** read the diff; confirm the Cal tab shows the auth state when `needs_auth`/`offline` and "No events" otherwise.

**Acceptance:** with the calendar unauthorized/down the Cal tab shows a distinct authorize affordance; with a connected-empty calendar it still shows "No events".

### 11C — Per-field add-event validation messages

**Objective:** the add-event validation message reflects what's actually missing instead of always naming "title and date".

**Files:** `bmo/pi/web/static/js/bmo.js`.

**Steps:**

1. At both call sites (`bmo.js:1978` and `bmo.js:2115`), replace the single static `'Fill in title and date'` with per-field checks: title-missing → "Please enter a title"; date-missing → "Please choose a date"; both → the combined message. Keep the existing client-side required-field gating that fires before any network call.
2. Factor the per-field check into one small helper if both call sites share the logic, to avoid drift between the two add-event paths.

**Cheap check:** read the diff; confirm each missing-field case maps to its own message at both sites.

**Acceptance:** entering only a title and pressing Create says "Please choose a date" (not "Fill in title and date"); the all-missing case still names both.

### 11D — Gate the TV pair PIN step on a reachability probe / inline hint

**Objective:** the pair flow tells the user to power on/reach the TV when it's unreachable, instead of prompting for a PIN that can't appear.

**Files:** `bmo/pi/routes/tv_api.py`, `bmo/pi/web/templates/index.html` (TV tab) / `bmo/pi/web/static/js/bmo.js`, `bmo/pi/tests/test_tv*.py` (if present).

**Steps:**

1. Pre-flight reachability before showing the PIN input: either have `/pair/start` (`tv_api.py:329`) return an "unreachable" result when the device can't be reached (reusing the status endpoint's connect probe, `tv_api.py:~305-318`), or have the frontend check `/api/tv/status` `connected`/reachability before advancing to the PIN step.
2. When unreachable, show an inline hint ("Can't reach the TV — make sure it's powered on and on the same network") instead of / above the PIN prompt; keep the PIN step reachable once the device responds. Don't actuate the TV.
3. If a `tv_api.py` change is made, add/extend a pytest asserting the unreachable path returns the handled "unreachable" signal (not a PIN prompt).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_tv_api.py -q && ruff check routes/tv_api.py` (substitute actual test filename); read the frontend diff.

**Acceptance:** with the TV off, "Pair with TV" surfaces a reachability hint rather than an un-fulfillable PIN prompt; with the TV reachable the PIN flow is unchanged.

### 11E — Frontend console hygiene: de-dupe geolocation log; gate/label the location feature when Places is unavailable

**Objective:** the geolocation INFO logs once, and location autocomplete degrades visibly (or is hidden) when the Places/Maps JS key is unavailable, instead of failing with only a console warning.

**Files:** `bmo/pi/web/static/js/bmo.js`, `bmo/pi/web/templates/index.html` (location inputs).

**Steps:**

1. De-dupe the location-init path so "[bmo] Geolocation disabled by Permissions-Policy …" (`bmo.js:571`) logs once — guard the init call so it isn't invoked twice on load, or log once behind a flag.
2. When `loadPlacesAPI` fails (`bmo.js:44`), set a flag the location inputs can read and either disable/hide the autocomplete with a small "location search unavailable" label, or fall back to a plain text input, so the failure is a visible, explained degradation rather than a silent console-only warning. Keep the lazy-load behaviour (fires on event-form open) intact.
3. Leave the actual key/referrer fix to the owner (PHASE-INDEX provenance) — 11E only handles the client-side degradation + log hygiene.

**Cheap check:** read the diff; confirm a single geolocation log and a visible/labelled fallback when Places is unavailable.

**Acceptance:** the geolocation INFO logs once on load; with the Places key unavailable the location feature degrades visibly/labelled instead of silently.

### 11F — Reconcile the IDE doc reference (production `/ide` vs experimental `:5001`)

**Objective:** `bmo/README.md` accurately states the production IDE is `/ide` on `:5000`, and the `:5001` `ide_app` is the experimental/loopback-only rebuild — so the doc matches what runs.

**Files:** `bmo/README.md`.

**Steps:**

1. The dashboard "IDE" tab navigates to the standalone `/ide` page (`app.py` `/ide` route) — the production IDE. The README's `http://bmo.local:5001` reference maps to the **experimental** `ide_app/` (run by `systemd/bmo-ide.service`, bound to `127.0.0.1`, not LAN-reachable), which `DESIGN-CONSTRAINTS` 47-56 documents as a stalled/diverged second IDE recommended for cutover/retirement. Update the README to state the production IDE is `/ide` on `:5000`, and that `ide_app` on `:5001` is experimental and loopback-only (cross-reference DESIGN-CONSTRAINTS 47-56). Doc-only; no behavior change.

**Cheap check:** read the diff; confirm the README no longer implies `:5001` is the live LAN IDE.

**Acceptance:** `bmo/README.md` correctly distinguishes the production `/ide` (`:5000`) from the experimental loopback `ide_app` (`:5001`).

## Research notes

- **The most-visible signal should be the entry point to its fix (11A).** A prominent non-interactive warning badge, with the remedy buried several clicks away, is a dead end; making the badge deep-link to the panel that already contains the fix is the minimal, highest-leverage UX repair.
- **Distinct states deserve distinct empty states (11B).** "No events" and "calendar broken/unauthorized" are different conditions; rendering them identically silently mis-informs the user. The data to distinguish them (`needs_auth`/`offline`) already exists on the response — this is purely a render-the-flag fix.
- **Validation should name the actually-missing field (11C) and flows should pre-flight their preconditions (11D).** Telling a user to "fill in title" when the title is filled, or to read a PIN off a powered-off TV, both erode trust; per-field messages and a reachability pre-flight align the UI with reality.
- **Failures should degrade visibly, not only in the console (11E).** A silent console warning is invisible to users; a labelled fallback (or hidden feature) makes the Places-key gap legible while the owner fixes the referrer allowlist.

## Test plan

- **11A/11B/11C/11E/11F** — frontend/doc: surgical diffs reviewed against the cited handlers (no JS unit harness in repo, per PHASE-02/03).
- **11D** — `tests/test_tv_api.py` (if a `tv_api.py` change is made): unreachable path returns the handled "unreachable" signal, not a PIN prompt.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + guards are the gate (covers any `tv_api.py` edit). No live-Pi mutation / no cloud-console change (rule 6).

## Acceptance criteria

- [ ] The header `⚠ calendar` badge is clickable and opens System Status (the re-authorize entry point).
- [ ] The Calendar tab shows a distinct "authorize" state when `needs_auth`/`offline`, and "No events" only when truly empty.
- [ ] Add-event validation names the actually-missing field(s) at both call sites.
- [ ] The TV pair flow surfaces a reachability hint when the TV is unreachable instead of an un-fulfillable PIN prompt.
- [ ] The geolocation INFO logs once; the location feature degrades visibly/labelled when the Places key is unavailable; `bmo/README.md` distinguishes `/ide` (`:5000`) from the experimental `ide_app` (`:5001`).
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **The Maps/Places browser-key referrer allowlist (add `bmo.mybmoai.work`) + confirming Maps JS API enabled** — owner/cloud-console (DESIGN-CONSTRAINTS 69-70, PHASE-INDEX provenance). 11E only degrades the feature client-side.
- **Embedding `/ide` in-tab vs. keeping it standalone, and retiring `ide_app`** — known per DESIGN-CONSTRAINTS 47-56; 11F only corrects the README reference, it does not change the architecture.
- **Calendar live event CRUD as a feature / the calendar reauth itself** — out of QA scope / owner action (rule 6). **Chat agent** — PHASE-09. **Health-signal truth + notification-feed data** — PHASE-10 (11A/11B consume those, they don't author them).

## Completed

Implemented 2026-06-28 on `auto/bmo-phase-executer` (base `origin/master@a28aa11e`; lines re-anchored from the plan's `a2d87c53` per INSTRUCTIONS.md rule 3). Frontend has no JS unit harness (per PHASE-02/03), so JS/HTML edits are surgical diffs verified against the cited handlers + `node --check web/static/js/bmo.js` (clean); the `tv_api.py` change is covered by pytest. Cheap checks green: `ruff check routes/tv_api.py` clean; `pytest tests/test_tv_api.py` = 8 passed.

- **11A — header badge is now actionable.** The header status `<span>` (`web/templates/index.html:157`) gained `@click`/`@keydown.enter="showStatusDetail = true; fetchDetailedStatus()"` + `cursor-pointer` + `role="button"`/`tabindex="0"`/`title`, so the most-prominent warning deep-links to System Status (which holds the calendar re-authorize row). Bindings `x-text="statusText"` / `:class` unchanged.
- **11B — Cal tab distinguishes "not connected" from "empty".** Added `calNeedsAuth` state (`web/static/js/bmo.js:216`), captured from the `needs_auth`/`offline` flags the calendar API already returns (`bmo.js` cal fetch). The Cal-tab empty state now branches: `(calNeedsAuth || calOffline)` → a "Calendar not connected — Authorize Calendar" affordance wired to the existing `startCalendarAuth()`; otherwise the prior "free today 🎉" / "No events" (`index.html` Cal-tab empty state).
- **11C — per-field add-event validation.** Both call sites (`createCalEvent`, `updateCalEvent`) now use a shared `_missingEventFieldMsg(e)` helper → "Please enter a title" / "Please choose a date" / combined, replacing the static "Fill in title and date" (`web/static/js/bmo.js`).
- **11D — TV pair flow pre-flights reachability.** `tv_api.py` gained `_tv_reachable()` (a 1.5s TCP probe to `TV_IP:6467`); `/pair/start` returns a handled `{"unreachable": true, "error": …}` when the TV can't be reached instead of starting a PIN prompt (`routes/tv_api.py:api_tv_pair_start`). `tvStartPairing()` no longer optimistically shows the PIN step — it only advances when pairing actually starts, and renders a `tvPairHint` ("Can't reach the TV — make sure it's powered on…") under the Pair button (`web/static/js/bmo.js`, `index.html` TV tab). New pytest: unreachable → handled signal; reachable → proceeds.
- **11E — console hygiene + visible degradation.** The geolocation Permissions-Policy INFO now logs once even if the init path runs twice (guarded on `_geoBlocked`, `bmo.js:~570`). On a Places/Maps JS load failure the loader sets `window._placesUnavailable` and relabels the location inputs to "Location (search unavailable — type it manually)"; `initPlacesAutocomplete` short-circuits with the same label when already-unavailable — a visible, explained degradation rather than a console-only warning (`bmo.js` `loadPlacesAPI`/`initPlacesAutocomplete`).
- **11F — README IDE reference reconciled.** `bmo/README.md` now states the production IDE is the dashboard **IDE** tab → `/ide` on **:5000**, and that `ide_app` on **:5001** is experimental and **loopback-only** (not LAN-reachable), cross-referencing `docs/DESIGN-CONSTRAINTS.md` 47-56 (three spots: features bullet, Web-IDE section, service table). Doc-only.
- **Not done (owner/cloud-console, rule 6 / Out of scope):** the Maps/Places browser-key **referrer allowlist** (add `bmo.mybmoai.work`) + confirming Maps JS API enabled — 11E only degrades the feature client-side. Embedding `/ide` in-tab / retiring `ide_app` (architecture) — 11F only corrects the doc.
