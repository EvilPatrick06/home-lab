# PHASE-14 — bmo IDE font-CSP correctness & IDE-tab redirect doc truth

> Authored 2026-06-29 from `bmo/docs/phases/QA/QA-report-2026-06-28-3.md`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the two **IDE-surface** findings from the third 2026-06-28 QA pass (run 3, live process `f51d9dc3` / driven against `origin/master@d9dccc65` over the Pi loopback) that PHASE-13 (IDE terminal cwd / paint / TV / service-doc truth) did not cover:

1. **`/ide` requests Google Fonts that the app's CSP blocks** — `web/templates/ide.html` `preconnect`s and `<link>`s `https://fonts.googleapis.com/css2?family=JetBrains+Mono…&family=Inter…`, but the app's `Content-Security-Policy` (`app.py`) allows neither `https://fonts.googleapis.com` in `style-src` nor `https://fonts.gstatic.com` in `font-src`. So **every** `/ide` load logs a CSP violation + a failed stylesheet `GET`, and the IDE renders in fallback fonts instead of the intended JetBrains Mono / Inter; and
2. **the dashboard "IDE tab" is a full-page redirect to `/ide`, not an in-tab panel** — selecting "IDE" runs `window.location.href = '/ide'`, navigating out of the SPA. This is intentional (consolidation onto the canonical standalone `/ide`, per `DESIGN-CONSTRAINTS`), but the QA INSTRUCTIONS §4.8 wording ("open it **in-tab**") implies an embedded editor, so the behavior reads as a defect. A one-line doc note removes the ambiguity.

This phase is a **CSP correctness fix** (`bmo/pi/app.py`, possibly `bmo/pi/web/templates/ide.html` / a self-hosted font) plus a **docs** clarification (`bmo/docs/DESIGN-CONSTRAINTS.md`, `bmo/docs/phases/QA/INSTRUCTIONS.md`). No behavior change to the IDE itself beyond the fonts loading (or not being requested).

PLANNING/AUTHORING ONLY. The executer does **not** restart the live Pi or deploy (rule 6) — the CSP change rides `bmo-pi-pytest.yml` + the docker/codeql guards; the docs change is diff-reviewed.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base verified against `origin/master@d9dccc65` (HEAD at authoring; the report drove live `f51d9dc3` against `d9dccc65` over loopback — line numbers re-anchored to current HEAD, INSTRUCTIONS.md rule 3).
- **14B extends the IDE doc-truth line PHASE-13 13D / PHASE-11 11F walked.** 13D reconciled `SERVICES.md` + the `bmo-ide.service` description to the live `/ide` on `:5000`; 11F corrected `bmo/README.md`. 14B adds the **distinct** fact that the dashboard *tab* is a redirect to that `/ide`, in `DESIGN-CONSTRAINTS.md` (the canonical "Two IDE implementations coexist" section, lines ~47-56) and the QA INSTRUCTIONS §4.8 wording — **different files / different sentences** than 13D/11F, so no conflict; 14B cross-references the same `DESIGN-CONSTRAINTS` section those cite.
- **CSP is shared (14A).** The `after_request` CSP in `app.py` applies to **every** response, including `/ide` and the dashboard. The two added font origins are scoped to the Google Fonts hosts only (mirroring the existing host-scoped `img-src` allowlist for YouTube/Google thumbnail hosts) — not a wildcard — so the change does not loosen the dashboard's policy beyond the fonts `ide.html` already references.
- **Live-Pi boundary (rule 6):** no `systemctl`, no deploy, no live `/ide` load on the device. The fix is verified by a header/template assertion test + diff; the real-process confirmation happens when the owner / `bmo-deploy.yml` deploys merged master.

## Verified findings

All citations verified 2026-06-29 against `origin/master@d9dccc65`. CSP: `bmo/pi/app.py` `after_request`. IDE template: `bmo/pi/web/templates/ide.html`. Dashboard SPA: `bmo/pi/web/templates/index.html`.

### F1 — `ide.html` loads Google Fonts that the CSP `style-src`/`font-src` do not allow → CSP violation + failed request on every `/ide` load

**Status: confirmed.** `web/templates/ide.html:9-10` carries `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`. The app's CSP (`app.py`, `Content-Security-Policy` set at `app.py:173`) declares `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net` (`app.py:187`) and `font-src 'self' data: https://cdn.jsdelivr.net` (`app.py:196`) — neither lists `https://fonts.googleapis.com` (the stylesheet origin) nor `https://fonts.gstatic.com` (the font-file origin the stylesheet pulls from). So the browser blocks the stylesheet (`style-src` violation), the `GET` fails, and the IDE falls back to system fonts. The terminal/editor still work; this is the report's **Low** finding. (The CSP already host-scopes its allowlists rather than using wildcards — e.g. the `img-src` YouTube/Google thumbnail hosts at `app.py:191-195` — so adding the two font hosts is consistent with the existing pattern.)

```bash
sed -n '9,10p'    bmo/pi/web/templates/ide.html              # preconnect + Google Fonts css2 stylesheet link
sed -n '173,196p' bmo/pi/app.py                              # CSP: style-src (187) / font-src (196) omit fonts.googleapis/gstatic
grep -n "fonts.googleapis\|gstatic" bmo/pi/app.py            # (none) — origins not allowlisted
```

### F2 — The dashboard "IDE tab" is a full-page redirect to `/ide`, not an embedded panel; QA §4.8 wording implies in-tab

**Status: confirmed (intentional; doc-truth gap).** In `web/templates/index.html` the IDE tab body is `<div x-show="tab === 'ide'" x-init="$watch('tab', v => { if(v === 'ide') window.location.href = '/ide'; })">` (`index.html:948`) showing only "Redirecting to IDE…" (`:950`), and the bottom-nav button does `@click="if(t.id === 'ide') { window.location.href = '/ide'; return; } tab = t.id"` (`index.html:2052`). So selecting "IDE" performs a full-page navigation to the standalone `/ide` page and drops the dashboard SPA state (Back returns). This matches `DESIGN-CONSTRAINTS.md` ("production IDE is `web/` + `routes/ide.py` … Runs on :5000", lines ~47-56) — i.e. a deliberate consolidation onto `/ide` — but `bmo/docs/phases/QA/INSTRUCTIONS.md:49` ("the **IDE tab** inside the dashboard") and §4.8 (`:85-86`, "open it **in-tab** and as the standalone `/ide` page") read as if the tab embeds an editor, which is why the QA pass flagged it. The actionable gap is **documentation**, not code: state that the tab is intentionally a redirect.

```bash
sed -n '947,951p'   bmo/pi/web/templates/index.html          # IDE tab: x-init watch → window.location.href='/ide'
sed -n '2052,2052p' bmo/pi/web/templates/index.html          # bottom-nav: IDE → window.location.href='/ide'
sed -n '47,56p'     bmo/docs/DESIGN-CONSTRAINTS.md            # 'Two IDE implementations coexist' — /ide on :5000 canonical
sed -n '49,49p;85,86p' bmo/docs/phases/QA/INSTRUCTIONS.md     # §4.8 'open it in-tab' wording that implies embedded
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the no-new-prints guard) — use the module logger for any new line.

### 14A — Stop the `/ide` Google-Fonts CSP violation

**Objective:** loading `/ide` produces **no** CSP violation and **no** failed font request, and the IDE gets its intended JetBrains Mono / Inter fonts (or deliberately uses local fonts with no remote request).

**Files:** `bmo/pi/app.py` (CSP), and either `bmo/pi/web/templates/ide.html` or a self-hosted font asset under `bmo/pi/web/static/` depending on the option chosen; `bmo/pi/tests/` (a header/template assertion).

**Steps:**

1. **Primary — allowlist the Google Fonts origins (smallest diff, preserves the intended fonts).** In the `after_request` CSP (`app.py:173-196`), add `https://fonts.googleapis.com` to `style-src` (`:187`) and `https://fonts.gstatic.com` to `font-src` (`:196`), host-scoped exactly like the existing `img-src` host allowlist — not a wildcard. Keep the inline-comment convention the surrounding directives use (a dated note explaining the two hosts cover the IDE's webfonts).
2. **Alternative (note in the plan; choose if offline-resilience is preferred) — self-host or drop the webfont.** The Pi can be offline, so a more robust option is to **self-host** JetBrains Mono / Inter under `web/static/ide/fonts/` and reference them with an `@font-face` served from `'self'` (already allowed), then **remove** the `fonts.googleapis.com` `<link>`+`preconnect` from `ide.html:9-10`; or simply **drop** the Google Fonts `<link>` and let the IDE use the local monospace stack. Either eliminates the external request entirely. If this option is taken, the CSP edit in step 1 is unnecessary — pick **one** approach, do not do both.
3. Whichever option: confirm no **other** template introduces a blocked font origin (the dashboard `index.html` does not load Google Fonts; only `ide.html` does), so the change is scoped to the IDE surface.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_app_headers.py -q && ruff check app.py` (substitute the actual CSP/header test filename; if none exists, add a minimal one that asserts the CSP string contains the font origins **or** that `ide.html` references no off-allowlist font origin, matching the option chosen).

**Acceptance:** a `/ide` load emits no `style-src`/`font-src` CSP violation and no failed font `GET`; the IDE renders its intended fonts (allowlist/self-host) or a documented local stack (drop); the dashboard CSP is not loosened beyond the two scoped font hosts.

### 14B — Document that the dashboard IDE tab is an intentional redirect to `/ide`

**Objective:** the docs state plainly that selecting the dashboard "IDE" tab navigates (full-page) to the standalone `/ide` page rather than embedding an editor in-tab, so a reader/QA pass doesn't file "the IDE tab doesn't switch in place" as a defect.

**Files:** `bmo/docs/DESIGN-CONSTRAINTS.md`, `bmo/docs/phases/QA/INSTRUCTIONS.md`.

**Steps:**

1. In `DESIGN-CONSTRAINTS.md`, in the existing "Two IDE implementations coexist" section (lines ~47-56), add a one-line note that the **dashboard "IDE" bottom-nav tab is a full-page redirect to the canonical `/ide` page** (`index.html` `window.location.href='/ide'`), not an in-SPA panel — so editing happens on the standalone page and the dashboard SPA state is dropped on entry (Back returns). Keep it consistent with that section's "single source of truth" framing.
2. In `bmo/docs/phases/QA/INSTRUCTIONS.md`, soften the §4.8 wording (`:85-86`) and the bullet at `:49` from "open it **in-tab**" to reflect that selecting "IDE" **redirects to `/ide`** (so a future QA pass tests the redirect + the standalone page, not an embedded panel). Keep the `bmo.local:5001` mismatch caveat 13D/11F already address.
3. Doc-only; no code change. Cross-reference the `DESIGN-CONSTRAINTS` section so the QA doc points at the canonical statement.

**Cheap check:** read the diff; confirm `DESIGN-CONSTRAINTS.md` documents the redirect and the QA §4.8 wording no longer implies an embedded in-tab editor.

**Acceptance:** `DESIGN-CONSTRAINTS.md` states the IDE tab is a redirect to `/ide`; QA INSTRUCTIONS §4.8 reflects that, so the redirect reads as intended behavior rather than a finding.

## Research notes

- **A CSP must list every origin a page actually fetches (14A).** Google Fonts is a two-origin dependency — the **stylesheet** comes from `fonts.googleapis.com` (so `style-src`) and the **font files** it references come from `fonts.gstatic.com` (so `font-src`). Allowlisting only one still breaks. The repo's CSP already host-scopes its allowlists (the `img-src` YouTube/Google thumbnail hosts), so adding the two font hosts is in-pattern. The more robust option on an occasionally-offline Pi is to self-host the fonts from `'self'` and drop the remote `<link>` entirely — no network dependency, no CSP exception — which is why it is offered as the alternative.
- **A redirect-as-a-tab is fine; an undocumented one is the trap (14B).** Consolidating the embedded editor onto the standalone `/ide` page is a reasonable design (one IDE surface to maintain, per `DESIGN-CONSTRAINTS`). The only cost is that a doc/QA reader expecting an in-tab panel reads the full-page nav as breakage. Documenting it where the IDE architecture is already described (`DESIGN-CONSTRAINTS`) and where QA is told to "open it in-tab" (§4.8) closes the gap without touching code.

## Test plan

- **14A** — a CSP/header test (existing or new): the `Content-Security-Policy` header contains `https://fonts.googleapis.com` (style-src) + `https://fonts.gstatic.com` (font-src) **or**, if the self-host/drop option is taken, `ide.html` references no off-allowlist font origin. `ruff check app.py` clean.
- **14B** — docs diff-reviewed: `DESIGN-CONSTRAINTS.md` + QA INSTRUCTIONS §4.8 document the IDE-tab redirect.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + the no-new-prints / docker / codeql guards are the gate. No live-Pi `/ide` load / restart / deploy (rule 6).

## Acceptance criteria

- [ ] Loading `/ide` produces no `style-src`/`font-src` CSP violation and no failed font request; the IDE uses its intended fonts (allowlist/self-host) or a documented local stack (drop).
- [ ] The CSP change (if taken) is scoped to the two Google Fonts hosts only — the dashboard policy is not otherwise loosened.
- [ ] `DESIGN-CONSTRAINTS.md` and QA INSTRUCTIONS §4.8 document that the dashboard "IDE" tab is an intentional full-page redirect to `/ide`.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Retiring `ide_app/` / `bmo-ide.service` or the `:5001` experimental rebuild** — owner cutover (DESIGN-CONSTRAINTS); PHASE-13 13D already marked the unit experimental in text. **`SERVICES.md` / `bmo-ide.service` port reconciliation** — PHASE-13 13D. **`bmo/README.md` IDE reference** — PHASE-11 11F. 14B adds only the *tab-is-a-redirect* fact in `DESIGN-CONSTRAINTS` + QA §4.8.
- **Embedding the IDE in-tab (reverting the redirect)** — that is a product/architecture decision against the `DESIGN-CONSTRAINTS` consolidation, not a QA fix; 14B documents the existing behavior rather than changing it.
- **The chat-agent outage and the chat-history clear/delete affordance** — the chat outage is **already planned (PHASE-09, merged; awaiting deploy)** and the clear/delete affordance is **PHASE-15**. **The Google Calendar OAuth reauth** — owner action, live-Pi data (rule 6); see PHASE-INDEX provenance.
- **Restarting/deploying the live Pi or loading `/ide` on the device** — owner/infra (rule 6).


## Completed

_Implemented 2026-06-29 on `auto/bmo-phase-executer` (worktree off `origin/master@e004827c`)._

- **14A — `/ide` Google-Fonts CSP fix (primary option: host-scoped allowlist, smallest diff).** Added `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src` in the `after_request` CSP, host-scoped (not wildcard) and matching the existing `img-src` host-allowlist pattern, with dated inline comments. `bmo/pi/app.py:193` (style-src) + `bmo/pi/app.py:204` (font-src). Chose the allowlist over self-host/drop to preserve the intended JetBrains Mono / Inter fonts with no template change; the two origins are scoped to the Google Fonts hosts only, so the dashboard policy is not otherwise loosened. Regression lock added: `bmo/pi/tests/test_security_headers.py::test_csp_allows_ide_google_fonts` asserts both origins are present in the CSP header (8 passed; `ruff check` clean).
- **14B — IDE-tab redirect doc truth.** `bmo/docs/DESIGN-CONSTRAINTS.md` "Two IDE implementations coexist" section now states the dashboard "IDE" bottom-nav tab is a full-page redirect (`window.location.href='/ide'`) to the canonical `/ide`, not an in-SPA panel. `bmo/docs/phases/QA/INSTRUCTIONS.md` bullet (§ dashboard surfaces) and §4.8 reworded from "open it in-tab" to test the redirect + the standalone page, cross-referencing the DESIGN-CONSTRAINTS section. Doc-only; no code/behavior change.
- **Live-Pi boundary respected (rule 6):** no `systemctl`/deploy/live `/ide` load. Verified by the header-assertion test + diff; real-process font load confirmed by the owner-run deploy.
