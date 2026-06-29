# PHASE-17 — bmo dashboard health-signal & narrow-viewport UX truth

> Authored 2026-06-29 from `bmo/docs/phases/QA/QA-report-2026-06-29.md` (run 1, live process `605e712f`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the two **dashboard-frontend** findings from the first 2026-06-29 QA pass that PHASE-16 (agent action-execution) does not cover — both are about the dashboard telling the user *less* than it knows:

1. **The "Degraded" health signal never names the failing subsystem.** When `overall` is `degraded`/`warning`, the top-bar pill renders a bare `BMO ⚠` and the System Status summary lists only healthy-looking metrics ("CPU 9.8%… Internet connection is good") — the actual cause (`google_calendar` down, vision/OCR degraded) is visible only after drilling into "Tap for detailed view." The `critical` branch already appends the failing service names to the pill; the `degraded`/`warning` branch hard-codes `'BMO ⚠'`. A user sees a red warning with green numbers and no explanation.
2. **The top header wraps to a tall, ragged block at narrow widths.** At ~375 px the clock and the location string each wrap across multiple lines (the location to three), because the location label has no truncation/condensation below a small breakpoint. Cards below stack fine; this is cosmetic but degrades the wall-display/phone layout the dashboard explicitly targets.

This phase surfaces the failing subsystem name in the degraded pill/summary (mirroring the existing `critical`-branch logic) and condenses the header at narrow widths.

PLANNING/AUTHORING ONLY. The executer does **not** restart the live Pi or deploy (INSTRUCTIONS.md rule 6) — the frontend change is diff-reviewed and rides the static-asset mtime cache-bust; CI guards (`bmo-pi-pytest.yml` / no-new-prints / docker / codeql) apply to the repo, and there is no JS unit harness for `bmo.js`, so the verification is a careful diff + the acceptance walk the owner-run deploy confirms.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@937f89f7` (HEAD at authoring). The report drove live `605e712f` over the Pi loopback; line numbers re-anchored to current HEAD per INSTRUCTIONS.md rule 3 — re-confirm before editing.
- **17A extends the PHASE-10 / PHASE-11 health-truth line.** PHASE-10 made the service-health signal honest (live-probe, no false "down"); PHASE-11/12 were the dashboard-UX rounds. This phase adds the *legibility* of an already-correct degraded signal — the pill/summary copy, not the health computation. Disjoint from PHASE-16 (agent), which touches no frontend.
- **17A is purely additive to one already-working branch.** The `critical` branch at `bmo.js` already builds `BMO ⚠ ${failing}` by filtering `data.services` for `status === 'down'`; 17A applies the same pattern to the `degraded`/`warning` branch (which today returns the bare string) and to the System Status summary card text. No change to the health payload or to `critical`/healthy rendering.
- **Live-Pi boundary (rule 6):** no `systemctl`, no deploy, no live dashboard edit on the device. Frontend-only; verified by diff + the acceptance walk on the owner-run deploy. The dashboard cache-busts static assets by file mtime, so the change ships on the next deploy without a manual cache step.

## Verified findings

All citations verified 2026-06-29 against `origin/master@937f89f7`. Dashboard behavior: `bmo/pi/web/static/js/bmo.js`. Dashboard template: `bmo/pi/web/templates/index.html`.

### F1 — The `degraded`/`warning` health branch hard-codes `BMO ⚠` and never names the failing service, unlike the `critical` branch

**Status: confirmed (Low/UX).** In `bmo.js`, the health-pill builder branches on `overall`:

```js
const overall = (data.overall || '').toLowerCase();
let next;
if (overall === 'critical') {
  const failing = Object.entries(data.services || {})
    .filter(([_, s]) => (s.status || '').toLowerCase() === 'down')
    .map(([name]) => name.replace(/^svc_|^google_/, ''))
    .slice(0, 2)
    .join(',');
  next = failing ? `BMO ⚠ ${failing}` : 'BMO ⚠';
} else if (overall === 'warning' || overall === 'degraded') {
  next = 'BMO ⚠';                       // <- hard-coded; failing service never named
} else {
  next = 'BMO';
}
this.healthSummary = next;
```

(`bmo/pi/web/static/js/bmo.js:1135-1149`.) A single down service such as `google_calendar` makes `overall: "degraded"` (not `critical`), so the pill renders the bare `BMO ⚠` with no cause. The header pill is bound to `healthSummary` (`index.html:48-49`, `x-text="healthSummary"`). The same omission applies to the System Status summary card copy, which lists healthy metrics but not the degraded/down subsystem.

```bash
sed -n '1135,1150p' bmo/pi/web/static/js/bmo.js     # critical names services; degraded/warning hard-codes 'BMO ⚠'
grep -n 'healthSummary\|System Status\|healthPillClass' bmo/pi/web/templates/index.html | head
```

### F2 — The top-bar location label has no narrow-width truncation -> clock + location wrap to a tall multi-line header at ~375 px

**Status: confirmed (Low/UX).** The header row is a flex container with the clock (`font-mono text-lg`) and a location label rendered with no max-width/`truncate`:

```html
<span x-show="locationLabel" class="text-text-dim text-xs" x-text="locationLabel"></span>
```

(`bmo/pi/web/templates/index.html:55`, inside the `<header class="h-[60px] …">` at `:41-86`.) At ~375 px the location string ("Overland Park, Kansas, United States") wraps to three lines and the clock to two, producing a tall ragged header that overflows the fixed `h-[60px]`. No `truncate`/`max-w`/`hidden`-below-breakpoint handling exists on the location or the secondary header items.

```bash
sed -n '41,86p' bmo/pi/web/templates/index.html      # header row; :55 locationLabel has no truncate/max-w
```

## Sub-phases

> No `bmo.js` unit harness exists; per-sub-phase check = a careful diff + `ruff check` is N/A for JS/HTML (frontend). Keep the change minimal and self-contained. One commit at phase end (INSTRUCTIONS.md rule 5).

### 17A — Name the failing subsystem in the degraded/warning pill and the System Status summary

**Objective:** when `overall` is `degraded`/`warning`, the pill and the System Status summary name the first failing (down or degraded) subsystem, the way the `critical` branch already names down services — so the cause is visible without drilling in.

**Files:** `bmo/pi/web/static/js/bmo.js` (the health-pill builder at `:1135-1149` and the System Status summary text), `bmo/pi/web/templates/index.html` (only if the summary card text is template-bound rather than JS-built).

**Steps:**

1. Factor the `critical` branch's service-name extraction into a small helper that takes a status predicate, e.g. `firstFailing(statuses)` returning the first 1–2 service names (stripping the `^svc_|^google_` prefix) whose status is in `statuses`. Reuse it in the `critical` branch (`['down']`) and the `degraded`/`warning` branch (`['down', 'degraded']`).
2. In the `degraded`/`warning` branch (`:1144-1145`), replace the hard-coded `next = 'BMO ⚠'` with `const failing = firstFailing(['down', 'degraded']); next = failing ? \`BMO ⚠ ${failing}\` : 'BMO ⚠';` — keeping the bare `BMO ⚠` only when no name is resolvable. Leave the `critical` and healthy branches' output byte-identical (the `critical` branch keeps its `['down']` predicate so its existing text is unchanged).
3. Apply the same first-failing name to the **System Status summary** copy so the summary sentence names the degraded/down subsystem (e.g. append "— calendar unavailable" or similar) rather than listing only healthy metrics. Locate the summary builder (search `System Status` / the summary string assembly in `bmo.js`/`index.html`) and include the failing-service name when `overall` is not healthy.
4. Keep the `localStorage` seed of `bmo_health_summary` (`:1153`) working — it stores whatever `next` becomes, so no change needed beyond the string content.

**Cheap check:** diff review; load `/bmo` in a browser against a payload with `overall: 'degraded'` and a down `google_calendar` (the current live state) and confirm the pill reads `BMO ⚠ calendar` and the summary names it. (Owner-run deploy confirms on-device; no JS unit harness in repo.)

**Acceptance:** with one down/degraded service and `overall: 'degraded'`, the top-bar pill reads `BMO ⚠ <service>` and the System Status summary names the failing subsystem; `critical` and healthy states render exactly as before; the persisted `bmo_health_summary` carries the named string.

### 17B — Condense the top header at narrow widths

**Objective:** at ~375 px the header stays within its `h-[60px]` row — the location label truncates/condenses (or drops to city-only / hides) rather than wrapping to three lines, and the clock does not wrap.

**Files:** `bmo/pi/web/templates/index.html` (the header row `:41-86`, especially the `locationLabel` span at `:55` and the secondary header items).

**Steps:**

1. Add narrow-width handling to the location label (`:55`): give it `truncate max-w-[...]` (or `hidden sm:inline` to drop it on the smallest widths), so it condenses to a single ellipsised line instead of wrapping. Tailwind `truncate` requires the element participate in a min-width-0 flex context — ensure the containing flex item allows shrink (`min-w-0`) so the ellipsis engages.
2. Prevent the clock from wrapping (`:44`): add `whitespace-nowrap` (the `font-mono text-lg` clock should never break "02:00 AM" across lines).
3. Spot-check the other secondary header items (temp/weather icon, health pill, bell) keep their single-row layout at 375 px; if the row still overflows, hide the lowest-priority item (the location label) below a small breakpoint rather than letting the row grow. Verify the kiosk (1024×600) and normal widths are unchanged.

**Cheap check:** load `/bmo` at 375 px and at kiosk 1024×600; confirm the header stays one row at both, location ellipsises (or hides) at 375 px, and nothing regresses at the wider widths.

**Acceptance:** at ~375 px the header is a single `h-[60px]` row with the location truncated/condensed and the clock un-wrapped; the kiosk and normal layouts are visually unchanged.

## Test plan

- **17A / 17B:** frontend-only; no `bmo.js`/HTML unit harness exists in `bmo/pi/tests` (the suite is Python/Flask). Verification is a careful diff + the acceptance browser walk (narrow + kiosk widths, degraded-state payload), confirmed on the owner-run deploy. The `bmo-pi-pytest.yml` gate still runs (it must stay green — no Python touched), plus no-new-prints / docker / codeql.

## Acceptance criteria

1. A `degraded`/`warning` overall health state names the first failing subsystem in both the top-bar pill (`BMO ⚠ <service>`) and the System Status summary copy; `critical` and healthy states are unchanged.
2. At ~375 px the top header stays within one `h-[60px]` row — location label truncated/condensed, clock un-wrapped — while the kiosk (1024×600) and normal layouts are unchanged.
3. `bmo-pi-pytest.yml` green (no Python change); one commit; plan moved to `completed/`.

## Out of scope (not re-planned — verified non-actionable or owned elsewhere)

- **Weather forecast shows the same ⚡ icon for all three days** (run 1 §1, flagged *info / unverified*). **Investigated and found non-actionable:** `bmo/pi/services/weather_service.py` `WMO_CODES` is a complete WMO weather-code table (codes 0–99) whose **default** for an unmapped code is `("Unknown", "clear")` -> ☀, *not* ⚡; only codes 95/96/99 map to `"storm"` -> ⚡. The forecast renderer (`bmo.js weatherIcon`, `index.html:176-180`) uses the same complete map. So three identical ⚡ icons mean Open-Meteo genuinely returned thunderstorm codes for all three days (a plausible late-June Kansas forecast), **not** a fallback/placeholder bug. No code change; the mapping is correct and exhaustive.
- **Alarm create vs. list show a different local time for the same instant** (run 1 §7) — the underlying Pi-system-TZ vs configured-location-TZ reconciliation is **intentional** per `bmo/docs/DESIGN-CONSTRAINTS.md` ("reconciliation remains an owner/config decision — out of scope"); the cross-endpoint formatting nit rides that same intentional policy and is not re-planned, consistent with the prior batch's reclassification of the header-clock TZ divergence.
- **README references an embedded editor at `:5001`** (run 1 §8) — **already addressed**: `bmo/README.md` at HEAD already qualifies `:5001` as "experimental … bound to loopback (127.0.0.1) only — not LAN-reachable … a stalled/diverged second IDE pending cutover/retirement" and points to `DESIGN-CONSTRAINTS.md` 47-56 (the doc-truth was corrected by PHASE-11 11F / PHASE-13 13D). The production IDE is documented as `/ide` on `:5000`. No re-plan.


## Completed

_Implemented 2026-06-29 on `auto/bmo-phase-executer` (worktree off `origin/master@e004827c`). Frontend-only; no Python touched._

- **17A — degraded/warning pill names the failing subsystem.** `bmo/pi/web/static/js/bmo.js` `pollHealth`: factored the critical branch's service-name extraction into a local `firstFailing(statuses)` helper and reused it in both branches — `critical` keeps `['down']` (output byte-identical), and the `degraded`/`warning` branch now builds `BMO ⚠ ${firstFailing(['down','degraded'])}` instead of the hard-coded `BMO ⚠`. Healthy unchanged; the persisted `bmo_health_summary` carries the named string.
- **17A — System Status summary card (plan-drift correction, kept frontend-only).** The summary is **backend-built** (`/api/status/summary` → `systemStatus.summary`), not JS-built as the plan assumed, and it **already** names failing services for `healthy`/`critical`/`warning` — but a **`degraded`** overall falls through every branch there and yields a metrics-only summary (the exact QA symptom). Since acceptance criterion 3 forbids a Python change, I added a frontend `systemStatusSummary()` helper and bound the card to it (`index.html`): for any non-healthy overall the backend summary does **not** handle (i.e. `degraded`), it appends "(Affected: <service>.)" from the raw status lists (`down_services`/`degraded_services`/`down_degraded_tier_services`/`down_noncritical_services`), deduped so the already-named warning/critical summaries are untouched. Names the cause without a backend change.
- **17B — header stays one row at narrow widths.** `index.html`: the clock span gained `whitespace-nowrap` (never breaks "02:00 AM"); the location label gained `truncate min-w-0` so it stays a single ellipsised line instead of wrapping to three. **Build-drift correction:** the dashboard serves a **purged, prebuilt** `web/static/css/tailwind.css` (no `sm:` breakpoint media query, no arbitrary `max-w-[160px]` present), so the plan's suggested `hidden sm:inline` / `max-w-[...]` would have been un-styled no-ops without a Tailwind rebuild (out of scope). I used only classes confirmed present in the built CSS (`truncate`, `whitespace-nowrap`, `min-w-0`); `truncate` forces `white-space:nowrap`, which on its own eliminates the multi-line wrap, and `min-w-0` lets the flex item shrink so the ellipsis engages. Kiosk/normal layouts unaffected (location simply shows in full when there's room).
- **Verification:** `node --check bmo.js` clean; the dashboard template still renders (`test_app_endpoints` + `test_security_headers`, 78 passed); no Python changed, so `bmo-pi-pytest.yml` stays green. The 375 px / kiosk 1024×600 visual walk and the live `degraded`-payload pill/summary confirm on the owner-run deploy (no JS/CSS harness in repo).
- **Out-of-scope items unchanged:** the weather ⚡ icon (verified non-actionable — complete WMO map), the alarm create-vs-list TZ display (intentional), and the README `:5001` note (already corrected) are not touched, per the plan.
