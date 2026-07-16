# PHASE-21 — bmo docs auth-surface truth, README service-table truth & calendar CSP hygiene

> Authored 2026-07-02 from `bmo/docs/phases/QA/QA-report-2026-07-02.md` (run 4, live deploy `4c7bcd82`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Close the report's three **docs/config** findings — all "the docs/console say one thing, the system does another":

1. **QA INSTRUCTIONS claim "localhost + LAN are exempt from the API-key gate" — code trusts loopback only.** A LAN client hitting `http://<lan-ip>:5000/bmo` with `BMO_API_KEY` set gets **401**. And since 2026-07-02 the stale claim is doubly wrong: the new **transport source gate** (`bmo/pi/source_gate.py`, installed at `app.py:445-455`) rejects non-loopback/non-tailnet peers outright, precisely so the shared key never crosses the plain-HTTP LAN leg. *(docs, low — but security-adjacent wording, so precision matters)*
2. **README still lists a `bmo-ide` service on :5001** in its service table; on the live Pi no such unit exists and :5001 refuses connections. The prose at lines 18/42 was already qualified by PHASE-11/13 ("experimental… stalled/diverged… pending cutover/retirement"), but the **service table row** (`:125`) and a stray comment (`:228`) still present it as an installed, running unit. *(docs, low)*
3. **Every calendar add-form open logs a CSP violation** for the Google Places script — `bmo.js` injects `maps.googleapis.com/maps/api/js` while the CSP `script-src` allowlist doesn't include it, so location autocomplete silently rotted (the form already copes with placeholder copy). Either restore the feature via CSP or stop injecting a script that can never run. *(config, low)*

PLANNING/AUTHORING ONLY. Categories: **docs / config (low)** — gated on the status board per the autonomy policy. Doc edits + one small config/frontend decision; tiny pytest surface for the CSP header.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@b1128097`. Re-anchor before editing (rule 3).
- **F1's ground truth moved under this batch's feet:** the report tested `4c7bcd82`; between then and HEAD the **source gate** landed (SECURITY-LOG 2026-06-29, resolved 2026-07-02: `source_gate.py` + `install_source_gate(app)` fronting HTTP + socket.io). The doc fix must describe **HEAD's** two-layer reality (transport source gate → then bearer/CF-Access auth with loopback trust), not just the pre-gate one the QA saw.
- **The report's suggested target `bmo/docs/SECURITY.md` does not exist** at HEAD (`ls bmo/docs/` — no SECURITY.md). The stale wording lives in `bmo/docs/phases/QA/INSTRUCTIONS.md`; sweep for siblings rather than assuming the report's file list.
- **21C (CSP/Places) is a restore-vs-retire decision.** The plan's default is **restore** (add the Google origins to the CSP — the feature was deliberately built, a key is configured, and the loader/callback plumbing all still exists); retiring the loader instead is acceptable if the owner prefers a lean CSP, and the sub-phase spells out both paths so the status-board approval can pick one.

## Verified findings

All citations verified 2026-07-02 against `origin/master@b1128097`.

### F1 — "localhost + LAN are exempt" is stale twice over: bearer trust is loopback-only, and the source gate now drops LAN peers entirely

**Status: confirmed (Low/docs).** The stale claim:

> `http://bmo.local:5000/bmo` or `http://127.0.0.1:5000/bmo` (localhost + LAN are exempt from the API-key gate; the kiosk uses this)

(`bmo/docs/phases/QA/INSTRUCTIONS.md:47`; echoed in spirit at `:44`, `:91`, `:113` "test from the LAN/localhost path".) Reality at HEAD:

- **Auth layer:** `_bmo_bearer_authorized()` (`bmo/pi/app.py:327-333`) trusts only `_bmo_client_is_trusted_localhost()` (`:312-325`) — loopback peer **and** no forwarding headers. A LAN IP with `BMO_API_KEY` set → 401. (QA verified live.)
- **Transport layer (new, 2026-07-02):** `install_source_gate(app)` (`app.py:445-455`, `bmo/pi/source_gate.py`) rejects requests whose socket peer is neither loopback nor the tailnet **before** routing, "so a client authenticating there would put the shared BMO_API_KEY on the wire in cleartext" — i.e. a bare-LAN `bmo.local:5000` client is now refused regardless of the key. Escape hatches: `BMO_SOURCE_GATE=off` / `BMO_EXTRA_SOURCE_CIDRS`.

So the honest trust story is: **loopback (kiosk) → open; tailnet → bearer key; plain LAN → refused by design; external → Cloudflare Access.** The QA instructions telling the next QA agent to test from "the LAN path" will produce false 401/blocked findings.

```bash
sed -n '44,49p' bmo/docs/phases/QA/INSTRUCTIONS.md
sed -n '312,334p' bmo/pi/app.py
sed -n '442,456p' bmo/pi/app.py; head -40 bmo/pi/source_gate.py
grep -rn 'exempt\|LAN' bmo/docs/phases/QA/INSTRUCTIONS.md bmo/README.md bmo/docs/*.md | grep -i 'key\|gate\|auth' # sweep
```

### F2 — README service table + a comment still present the retired :5001 IDE as an installed service

**Status: confirmed (Low/docs).** `bmo/README.md:125` service table row: `| bmo-ide | Embedded web IDE — **experimental, loopback-only** … | 5001 |` — but no `bmo-ide.service` exists (system or user scope; QA verified `curl 127.0.0.1:5001` → connection refused). Line `:228` still says "or via the embedded IDE on :5001". The qualified prose at `:18`/`:42` (PHASE-11 11F / PHASE-13 13D) is fine — it's the *table row asserting an installed unit* and the stray `:228` reference that are wrong. `DESIGN-CONSTRAINTS.md` 47-56 (pending cutover/retirement) remains the decision record; the docs must stop implying the unit runs today. Note `:153` (`VTT_SYNC_URL` default `…:5001` on a **different host**) is unrelated — do not touch.

```bash
grep -n '5001\|bmo-ide' bmo/README.md
```

### F3 — `bmo.js` injects the Places loader that the CSP `script-src` can never allow

**Status: confirmed (Low/config).** CSP: `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.socket.io https://static.cloudflareinsights.com` (`bmo/pi/app.py:186`) — no `maps.googleapis.com`. Loader: `bmo.js:31-56` builds `https://maps.googleapis.com/maps/api/js?key=…&libraries=places&callback=_onPlacesReady&loading=async` whenever an API key is configured, so **every** add-form open logs a CSP violation; `_placesUnavailable` then drives the graceful "search unavailable — type it manually" placeholder (one warn per session via `_placesWarned`, 03B). The feature rotted silently rather than being consciously disabled.

```bash
sed -n '174,190p' bmo/pi/app.py
sed -n '31,56p' bmo/pi/web/static/js/bmo.js
```

## Sub-phases

> Doc edits + one config decision. One commit at phase end.

### 21A — Rewrite the auth-surface description in the QA instructions (and sweep siblings)

**Objective:** every doc describing the gate matches HEAD's two-layer model; the next QA run tests the right paths and files no false auth findings.

**Files:** `bmo/docs/phases/QA/INSTRUCTIONS.md` (`:44`, `:47-48`, `:91`, `:113`), plus any sweep hits (`bmo/README.md`, `bmo/docs/*.md`).

**Steps:**

1. Replace the `:47` bullet with the layered truth, e.g.: loopback (`http://127.0.0.1:5000/bmo`, the kiosk path) is the only key-gate-exempt surface; the plain-LAN leg (`bmo.local:5000` from another machine) is **refused by the transport source gate** (cleartext-key protection — `source_gate.py`; `BMO_SOURCE_GATE=off` / `BMO_EXTRA_SOURCE_CIDRS` are owner escape hatches); tailnet clients pass the gate but need the Bearer when `BMO_API_KEY` is set; external is Cloudflare Access + key gate.
2. Update the dependent phrasing at `:44` ("LAN/localhost"), `:91` ("confirm the localhost/LAN path is open" → "confirm loopback is open, plain-LAN is refused, external is gated") and `:113` accordingly — the auth-check instruction should now *expect* the LAN 401/refusal instead of reporting it.
3. Sweep the repo docs for the same stale claim (`grep -rn 'LAN.*exempt\|exempt.*LAN' bmo/`) and fix hits with the same wording. Optionally add one line on how a LAN/tailnet client is *supposed* to connect (tailnet + Bearer), per the report's suggestion.

**Cheap check:** re-read the section as if executing the QA skill — no instruction leads to a plain-LAN unauthenticated test; grep sweep returns no stale claims.

**Acceptance:** no repo doc claims LAN exemption; the QA instructions describe loopback/tailnet/LAN/external exactly as `app.py:312-333` + `source_gate.py` implement them.

### 21B — README: stop presenting `bmo-ide` as an installed service

**Objective:** the service table lists only units that exist; the :5001 IDE is consistently described as not-installed/retired-pending.

**Files:** `bmo/README.md` (`:125`, `:228`).

**Steps:**

1. Either remove the `bmo-ide` row or (better, preserves the pointer) change it to a footnote-style entry: "`ide_app` (:5001) — **not installed as a service**; experimental/diverged second IDE pending cutover/retirement, see `docs/DESIGN-CONSTRAINTS.md` 47-56". Match how the table formats other rows.
2. Fix `:228` ("edit code locally (or via the embedded IDE on :5001)") → point to the production `/ide` on :5000.
3. Leave `:18`/`:42` prose (already accurate) and `:153` (`VTT_SYNC_URL`, different host) untouched.

**Cheap check:** `grep -n '5001' bmo/README.md` — remaining hits are only the qualified prose + the unrelated VTT default.

**Acceptance:** README's service table matches `systemctl` reality; no doc implies the :5001 unit runs.

### 21C — Resolve the Places-loader/CSP contradiction (restore autocomplete, or retire the loader)

**Objective:** the add-form's console is clean and the location-search feature state is a *decision*, not rot.

**Files:** `bmo/pi/app.py` (`:186` CSP), `bmo/pi/web/static/js/bmo.js` (`:31-56`), `bmo/pi/tests/` (CSP header test — see `tests/test_app_endpoints.py` `test_security_headers`).

**Steps (default path — restore):**

1. Add the Google Maps origins to the CSP: `https://maps.googleapis.com` to `script-src` and (per Google's Places-JS CSP guidance — verify at implementation time) `https://maps.gstatic.com` where required (script/img) and `https://maps.googleapis.com` to `connect-src`/`img-src` if the header sets those directives. Keep the addition minimal — only directives the loader actually trips (test in-browser via the add-form).
2. Update/extend the CSP pytest (`test_security_headers` or sibling) to pin the new allowlist so future edits are deliberate.
3. Verify in-browser: add-form location field autocompletes; console clean; `_placesUnavailable` no longer set.

**Alternate path (retire — if the status-board approval prefers a lean CSP):** skip the injection entirely — guard `_loadPlaces()` behind a config flag defaulting to off (or delete the loader + `_onPlacesReady` plumbing), keep the "type it manually" placeholder as the permanent copy, and log the feature retirement in `docs/logs/BMO-ISSUES-LOG.md`/`DESIGN-CONSTRAINTS.md`. Console must be clean either way.

**Cheap check:** open the calendar add-form — zero CSP violations in the console; if restored, a location search returns suggestions (needs the live key — otherwise verify the script tag loads without violation and degrade copy still works).

**Acceptance:** no CSP violation on add-form open; location search either works (restored) or is consciously disabled with clean console + updated copy (retired); CSP pytest pins the outcome.

## Test plan

- **21A/21B:** doc-only — grep sweeps above + a re-read against `app.py`/`source_gate.py`/the Pi service list; no CI surface beyond markdown.
- **21C:** `python -m pytest tests/test_app_endpoints.py -q` (CSP header assertions updated); browser walk of the add-form for the console check. `ruff check`; no new prints.
- No live-Pi mutation (rule 6); the in-browser checks ride the owner-run deploy.

## Acceptance criteria

1. Repo docs describe the real trust boundary (loopback-only exemption + transport source gate + tailnet Bearer + CF Access); no "LAN exempt" claim remains.
2. README service table matches installed units; :5001 references are consistently "not installed / pending retirement".
3. Calendar add-form opens with a clean console; the Places feature is either restored or deliberately retired, pinned by the CSP test.
4. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **Actually cutting over / retiring `bmo/pi/ide_app/`** — the standing DESIGN-CONSTRAINTS 47-56 decision; this phase only makes the docs stop lying about it.
- **Pi OS timezone / location-config reconciliation** — owner action item recorded in the QA report (see PHASE-20's out-of-scope note).
- **Broader CSP hardening** (dropping `unsafe-eval` etc.) — separate security work; only the Places contradiction is in scope.

## Completed

Implemented 2026-07-15 (owner-approved via the status board) on `auto/bmo-phase-executer`.

- **21A** — QA instructions auth surface rewritten to HEAD's two-layer reality: loopback = only key-gate-exempt surface; plain LAN refused by the transport source gate (with owner escape hatches named); tailnet = Bearer when `BMO_API_KEY` set; external = CF Access + key gate (`bmo/docs/phases/QA/INSTRUCTIONS.md:47-50`, plus `:44`, the §4.9 auth-surface bullet, and the "Don't defeat the gates" rule now *expecting* the LAN refusal). Repo-wide sweep (`LAN.*exempt|exempt.*LAN`): remaining hits are this plan's own findings text, a QA-report historical record, and SERVICES.md's (accurate) key-gate-exemption sentence — no stale claims left.
- **21B** — README service table row now reads `ide_app` (:5001) — **not installed as a service**, pending cutover/retirement per DESIGN-CONSTRAINTS 47-56 (`bmo/README.md:125`); `:228` comment now points at the production `/ide` on :5000. `:18`/`:42` prose and `:153` (`VTT_SYNC_URL`, different host) untouched as directed.
- **21C** — **Restore path taken (plan default; the board approval carried no contrary instruction).** CSP allowlists added host-scoped: `maps.googleapis.com` + `maps.gstatic.com` in `script-src`, both in `img-src`, `maps.googleapis.com` in `connect-src` (`bmo/pi/app.py:187-220`). Pinned by `tests/test_security_headers.py::test_csp_allows_google_places`. In-browser console/autocomplete check rides the owner-run deploy (needs the live key).
- **Verification:** targeted pytest 13 passed (incl. the new CSP pin); `ruff check` clean; grep sweeps above.
