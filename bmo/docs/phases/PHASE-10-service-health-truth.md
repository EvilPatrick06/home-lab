# PHASE-10 — bmo service-health truth & critical-alert surfacing

> Authored 2026-06-28 from `bmo/docs/phases/QA/QA-report-2026-06-28.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Make bmo's health signal **tell the truth and surface its critical states where the user actually looks**. The 2026-06-28 QA pass found the Google Calendar integration genuinely down (refresh token revoked — `invalid_grant`), which is an **operational reauth** the owner must run (rule 6, see Out of scope). But around that real outage the QA found four **code-side** signal/observability defects this phase fixes: (1) `/api/health/full` reports **two different "expired" magnitudes** for the same token (config-preflight `calendar_token_ttl_s: -316701` ≈ 3.7 days vs the service probe's "Token expired 43m ago") with no way to tell which clock is authoritative; (2) a single expired third-party OAuth token escalates **whole-device** health to `overall: critical` even though the Pi, voice, music, TV, LEDs and 30+ services are healthy; (3) a multi-day `overall: critical` raises **no in-dashboard notification** — only the small passive header `⚠ calendar` badge — so a user relying on the notification bell never learns the calendar broke; and (4) the `mdns` health check reports a bare `unknown` ("avahi-resolve-host-name not installed") instead of a clear, honest skip.

This phase is **server-side Python** (`bmo/pi/services/monitoring.py`, `bmo/pi/services/config_preflight.py`, pytest) plus a small dashboard mirror so a critical service-down also appears in the notification center.

PLANNING/AUTHORING ONLY. The executer does **not** run `reauth_calendar.py`, touch live `token.json`, or restart Pi services (rule 6) — this phase makes the *signal* honest and the *alert* visible; the genuinely revoked token still needs the owner's one-click reauth.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@a2d87c53`. Builds directly on the health-truth lineage: **PHASE-05** added token persistence + the live-read reconciliation, and **PHASE-08** surfaced deploy/runtime version truth + the calendar token TTL on `/health/full`. This phase tightens the *reporting* (one expiry figure), the *severity tiering* (calendar ≠ whole-device-critical), and the *surfacing* (notification center) — none of which 05/08 covered.
- **Independent of PHASE-09 (chat) and PHASE-11 (UX).** Disjoint files; any order. The 10C notification-center mirror touches the dashboard notification feed, which PHASE-11 does **not** edit (11 touches the header badge, Cal tab, add-event, TV pair, console hygiene) — no collision.
- **Operational vs code (rule 6):** the calendar is down because the stored **refresh token** is revoked (`invalid_grant: Token has been expired or revoked`). Only a human reauth (`reauth_calendar.py`, or the in-dashboard re-authorize button) fixes that, and moving the Google OAuth app to "Production" stops the weekly refresh-token expiry — both owner actions (Out of scope / PHASE-INDEX provenance). This phase ensures that when it *is* down the signal is accurate and loud, and when it recovers the signal clears.

## Verified findings

All citations verified 2026-06-28 against `origin/master@a2d87c53` (the report tested live process `568af48a`; line numbers re-anchored to current HEAD — INSTRUCTIONS.md rule 3). The monitor is `bmo/pi/services/monitoring.py`; the boot-time classifier is `bmo/pi/services/config_preflight.py`.

### F1 — `/api/health/full` reports two different "expired" magnitudes for the same calendar token

**Status: confirmed.** Two independent producers compute "expired" from different sources and both label it "expired" with no qualifier. `config_preflight.run_preflight` reads the stored credential's `expiry` field (`config_preflight.py:99-105`) and emits `calendar_token_expiry` + `calendar_token_ttl_s` (`:143-144`) — the QA saw `ttl_s: -316701` (≈ token file stale 3.7 days, expiry `2026-06-25T03:10:35Z`). The monitor's calendar check (`monitoring.py:1528` `_check_calendar_token`) computes its own "Token expired {mins:.0f}m …" string from the last refresh attempt (`monitoring.py:1648-1659`) — the QA saw "Token expired 43m". They measure different things (on-disk credential-file staleness vs the monitor's last-refresh delta) but a reader can't tell which clock is authoritative.

```bash
sed -n '88,108p'  bmo/pi/services/config_preflight.py          # reads token.json expiry → ttl_s/expiry
sed -n '140,145p' bmo/pi/services/config_preflight.py          # emits calendar_token_expiry / calendar_token_ttl_s
sed -n '1640,1670p' bmo/pi/services/monitoring.py              # "Token expired {mins}m …" from last refresh
```

### F2 — A single expired calendar OAuth token escalates whole-device health to `overall: critical`

**Status: confirmed (intentional classification — flagged for re-tiering).** `google_calendar` is in the monitor's "drive overall=critical when down" set (`monitoring.py:620-626`, the membership at `:626`), so an expired Google Calendar OAuth token makes `/api/health/full` report `overall: "critical"` and `down_required_services: ["google_calendar"]` even when every on-device subsystem is healthy. "Critical" normally implies the device is broken; here it means "a cloud convenience integration needs re-auth." Note this is distinct from the **transient-check** critical set `_CRITICAL_SERVICES = ["bmo", "docker"]` (`monitoring.py:1138`) used for the periodic check loop — the overall-rollup set at `:620-626` is the one that pins `overall: critical`.

```bash
sed -n '618,628p'  bmo/pi/services/monitoring.py              # overall=critical set incl. google_calendar
sed -n '1136,1140p' bmo/pi/services/monitoring.py             # separate transient _CRITICAL_SERVICES = bmo, docker
```

### F3 — A multi-day `overall: critical` raises no in-dashboard notification — only the passive header badge

**Status: confirmed.** Service-down alerts route to the Discord webhook (`_send_discord_webhook`, `monitoring.py:233`) and the header `⚠ calendar` badge, but nothing mirrors them into the dashboard's in-app notification center — the QA opened the bell with `overall: critical` (calendar down ~3.7 days) and saw "No notifications". A user who relies on the notification feed has no in-UI signal of a multi-day critical condition. The webhook path already computes a de-duped alert fingerprint (`_alert_fingerprint`, `monitoring.py:578`; state at `:307,355,369`), so a parallel "mirror to the notification feed" emit can reuse the same gating.

```bash
sed -n '233,266p'  bmo/pi/services/monitoring.py              # _send_discord_webhook — the existing alert sink
sed -n '578,600p'  bmo/pi/services/monitoring.py              # _alert_fingerprint — de-dupe to reuse
```

### F4 — `mdns` health check reports a bare `unknown` instead of a clear, honest skip

**Status: confirmed.** `/api/health/full` shows `services.mdns.status = "unknown"` with message "avahi-resolve-host-name not installed" (the mdns probe in `monitoring.py`). The tool genuinely isn't present (so `bmo.local` also won't resolve from other LAN machines — see PHASE-INDEX owner/infra note to install `avahi-utils`), but "unknown" reads as a probe failure rather than an intentional "not configured on this host" skip. The code-side half is to report a definitive, clearly-worded skip; installing `avahi-utils` is the owner half.

```bash
grep -n "avahi\|mdns\|resolve-host-name\|unknown" bmo/pi/services/monitoring.py | head
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the no-new-prints guard) — use the module logger.

### 10A — Normalize calendar expiry reporting (one figure, or clearly-distinct labels) + honest mdns skip

**Objective:** `/api/health/full` presents calendar expiry as one authoritative number, or as two clearly-labelled distinct measurements, so a reader is never confronted with "3.7 days" and "43m" both labelled "expired"; and the mdns check reports a definitive skip instead of a bare `unknown`.

**Files:** `bmo/pi/services/monitoring.py`, `bmo/pi/services/config_preflight.py`, `bmo/pi/tests/` (monitoring + preflight tests).

**Steps:**

1. Pick one source-of-truth timestamp for the calendar credential and have both producers derive from it, OR relabel them so each says what it measures — e.g. config-preflight → "credential file stale 3.7d" (on-disk `expiry`), the monitor probe → "access token expired 43m ago" (last-refresh delta). Implement the relabel at minimum (lowest risk); prefer also having the monitor read the same `expiry` source config-preflight uses so the two figures reconcile. Keep the JSON keys stable; only the human `message` strings (and optionally an added explicit label) change.
2. Change the mdns probe to a definitive skip: when `avahi-resolve-host-name` is absent, report `status: "skipped"` (or the monitor's existing not-applicable state) with a clear message ("mDNS check skipped — avahi-utils not installed; bmo.local won't resolve on the LAN until it is") rather than `unknown`. Do not invent a new severity if one already fits.
3. Tests: assert the two expiry figures are either equal or carry distinct labels; assert the mdns-missing path yields the definitive skip status + message.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_monitoring.py -q && ruff check services/monitoring.py services/config_preflight.py` (substitute actual test filenames).

**Acceptance:** no two "expired" figures for the same token without distinct labels; mdns reports a clear intentional skip, not `unknown`.

### 10B — Re-tier expired third-party OAuth so calendar-down ≠ whole-device `overall: critical`

**Objective:** an expired Google Calendar OAuth token surfaces as a prominent **degraded/high** ("cloud integration needs re-auth"), not as `overall: critical` implying the device itself is broken — while a genuinely critical on-device failure still rolls up to `critical`.

**Files:** `bmo/pi/services/monitoring.py`, `bmo/pi/tests/test_monitoring.py`.

**Steps:**

1. Remove `google_calendar` from the overall-critical rollup set (`monitoring.py:620-626`) and route it into a "degraded but device-healthy" tier so `/api/health/full` reports `overall: degraded` (not `critical`) when only the calendar OAuth is down. Keep the per-service `google_calendar` status itself accurate (down/needs-reauth) and keep the actionable reauth message — only the **whole-device rollup** changes.
2. Confirm the on-device criticals (`bmo`, `docker`, and any genuine hardware/service whose loss does mean the device is broken) still drive `overall: critical`. Add a short comment at the rollup set explaining the tier rationale (third-party convenience integrations degrade; on-device failures are critical) so a future reader doesn't "fix" it back.
3. Tests: calendar-only down → `overall: degraded`, `google_calendar` still flagged with the reauth message; a real on-device critical (e.g. `bmo`/`docker` down) → `overall: critical`.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_monitoring.py -q && ruff check services/monitoring.py`.

**Acceptance:** calendar-token expiry yields `overall: degraded` (calendar still clearly flagged + reauth message intact); on-device criticals still escalate to `critical`.

### 10C — Mirror critical/persistent service-down into the in-dashboard notification center

**Objective:** a critical (or persistent multi-day) service-down condition raises an in-app notification, so the bell is not empty while the device is in a critical/degraded state.

**Files:** `bmo/pi/services/monitoring.py`, the notification feed it should write to (the in-dashboard notification store/endpoint), `bmo/pi/tests/`.

**Steps:**

1. At the point alerts fan out to the Discord webhook (`monitoring.py:233`+), also emit the same alert into the in-dashboard notification center feed (the store the bell reads). Reuse the existing `_alert_fingerprint` de-dupe (`monitoring.py:578`) so a sustained condition produces one notification, not a per-poll storm, and so recovery can clear/append a "recovered" notice.
2. Add a proactive notification when the calendar token TTL goes negative (config-preflight `calendar_token_ttl_s < 0`) rather than relying solely on the passive header badge — so the user is told "Calendar needs re-authorization" the first time it lapses. Gate it through the same de-dupe.
3. Keep it server-authoritative: the frontend already polls the notification feed; do not add client-only state. (The header-badge → System Status deep-link and the Cal-tab auth affordance are PHASE-11's job — 10C only ensures the *data* exists in the feed.)
4. Tests: a critical service-down writes exactly one notification (de-duped across repeated checks); recovery appends/clears; a negative calendar TTL produces the proactive re-auth notification once.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_monitoring.py -q && ruff check services/monitoring.py`.

**Acceptance:** with `overall` critical/degraded the bell shows a (single, de-duped) notification; recovery is reflected; a lapsed calendar token raises a proactive re-auth notification.

## Research notes

- **A health check must report one clock per fact (10A).** Two subsystems independently labelling the same credential "expired" with different magnitudes is a classic observability smell — the fix is a single source-of-truth timestamp or explicit, distinct labels for the two distinct measurements (on-disk credential staleness vs live access-token delta). This is the "auto-diagnose to the responsible mechanism" rule applied to the signal itself (INSTRUCTIONS.md rule 28).
- **Severity should describe blast radius (10B).** `overall: critical` is a device-level claim; a third-party OAuth convenience integration lapsing does not break the device, so it belongs in a degraded tier that is still loud but doesn't cry wolf. Keeping the per-service status + actionable reauth message intact preserves the signal while fixing the rollup — the same "make the alarm honest" stance PHASE-05 took for the false-CRITICAL.
- **Alerts must reach where the user looks (10C).** Routing critical alerts only to a Discord webhook + a passive badge means the in-app notification center — the obvious place a user checks — stays empty during a multi-day outage. Mirroring the existing, already-de-duped alert into the feed closes that gap without a second alerting system.

## Test plan

- **10A** — monitoring + preflight tests: reconciled/labelled expiry figures; mdns-missing → definitive skip.
- **10B** — `tests/test_monitoring.py`: calendar-only down → `overall: degraded` (+ reauth message); on-device critical → `overall: critical`.
- **10C** — `tests/test_monitoring.py`: critical down → one de-duped notification; recovery reflected; negative calendar TTL → proactive re-auth notification.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + guards are the gate. No `reauth_calendar.py` / `token.json` mutation / Pi restart (rule 6).

## Acceptance criteria

- [ ] `/api/health/full` no longer shows two unlabelled "expired" magnitudes for the calendar token; the mdns check reports a clear intentional skip, not `unknown`.
- [ ] An expired calendar OAuth token yields `overall: degraded` (calendar still flagged with the actionable reauth message); genuine on-device failures still drive `overall: critical`.
- [ ] A critical/degraded service-down condition raises a single, de-duped in-dashboard notification; recovery is reflected; a lapsed calendar token raises a proactive re-auth notification.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Running `reauth_calendar.py` / editing live `token.json` / moving the Google OAuth app to "Production"** — owner actions, live-Pi data (rule 6, PHASE-INDEX provenance). This phase makes the down/recovered signal honest and visible; the revoked refresh token still needs the owner's one-click reauth.
- **Installing `avahi-utils`** — owner/ops (PHASE-INDEX provenance); 10A only makes the *check message* honest.
- **The header-badge deep-link + Cal-tab re-auth affordance** — PHASE-11 (this phase only ensures the notification *data* exists). **Chat agent** — PHASE-09.
