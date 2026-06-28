# PHASE-08 — bmo deploy/runtime version truth on the health endpoint

> Authored 2026-06-24 from `bmo/docs/phases/QA/QA-report-2026-06-24-3.md` (with the token-TTL ask from `QA-report-2026-06-24-4.md` §6). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Make **deploy↔restart version skew self-diagnosing from the API**, closing the recurring blind spot the third QA pass spent its whole run on. Report-3's top finding was that the deployed working tree was at `8c6811d5` while the **running** Flask process (pid 1726) had started ~6 min *before* that source landed on disk — so every `/api/*` call served pre-phase code, and the QA agent could only detect it by cross-checking `ps -o lstart` against `stat` mtimes. Report-4 confirmed the same skew closed only after a manual restart. The structural deploy fix ("make deploy restart the service") is an owner/ops action already tracked in `docs/logs/BMO-ISSUES-LOG.md`; this phase delivers the **code complement report-3 explicitly asked for** — *"Optionally expose the running code's SHA via `/api/v1/health` so deploy/runtime skew is detectable."* Today `/api/v1/health` returns only `{"status":"ok","api_version":"v1"}` (`system_api.py:51-54`): nothing identifies which code is actually running, so the skew is invisible to any consumer (QA agent, the health monitor, a human curl). We add the **running code's identity** — the git SHA captured at process start, the served asset build stamp, and the process start time / uptime — to the health payload, plus (report-4 §6) the **calendar token TTL** to the full-health payload so a session can see token expiry without forcing it.

This phase is **server-side Python only** (`bmo/pi/routes/system_api.py`, a tiny boot-time capture in `bmo/pi/app.py`, `bmo/pi/services/config_preflight.py`, pytest). It is **purely additive and read-only**: existing health keys are kept verbatim (back-compat), no live-Pi mutation, no deploy/restart, no secrets in the payload.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Base is `origin/master@3c89d787`. In the lineage of PHASE-05 ("calendar token persistence & health *truth*") — PHASE-05 reconciled the calendar *status*; this phase adds *version/runtime truth* (which SHA is running) and the calendar token *TTL number* to the health surface.
- **Independent of PHASE-04/06/07.** Touches the health/system surface only; any order.
- **Operational boundary (rule 6):** this phase does **not** change deploy mechanics or restart anything. The "restart on deploy" structural fix (so the running SHA matches the tree after `deploy.sh`) is the owner's ops action, already in `docs/logs/BMO-ISSUES-LOG.md`. This phase only makes the skew **observable** — capturing the SHA at boot and surfacing it; it does not (and must not) reach into `deploy.sh` or `bmo-deploy.yml`.
- **No secrets exposure:** the payload carries a git SHA, a file mtime integer, ISO timestamps, and a calendar-token *expiry/TTL* — never the token itself, never env-var values. `config_preflight` is already documented as "cheap + side-effect-free (pure env + file-exists reads)"; the TTL read stays within that contract.

## Verified findings

All citations verified 2026-06-24 against `origin/master@3c89d787`.

### F1 — `/api/v1/health` carries no running-code identity, so deploy↔restart skew is undetectable from the API

**Status: confirmed.** The `health()` handler (`routes/system_api.py:51-54`) returns exactly `{"status": "ok", "api_version": "v1"}`. There is no field identifying the SHA/build the process is running, so a consumer cannot tell a fresh process from one whose imported modules predate the on-disk source — which is precisely the report-3 situation (running pid started 16:06, source landed 16:12). The inline comment even notes the bare `status` key is kept "verbatim so existing unversioned probes (dnd-app lan-discovery.ts) are unaffected" — so additive keys are the established, safe way to extend this route.

```bash
sed -n '49,66p' bmo/pi/routes/system_api.py     # health(): {"status":"ok","api_version":"v1"} — no SHA/build
```

### F2 — the asset build stamp and process start time exist but are not on the health surface

**Status: confirmed.** The app already computes a per-file asset mtime for cache-busting — `_static_mtime("js/bmo.js")` (`app.py:1068-1094`, used as `js_v` at `:1094-1099`) — which is exactly the "served build stamp" the QA reports keyed off (`bmo.js?v=1782339164`). But it lives only in the index-template render path, not on `/health`. There is no recorded process-start timestamp either. So the two signals that would localize skew (fresh JS vs stale Python; how long the process has run) are computable but unexposed.

```bash
sed -n '1068,1101p' bmo/pi/app.py               # _static_mtime + js_v/css_v cache-bust (the build stamp)
```

### F3 — `/api/health/full` reports calendar token presence but not its TTL/expiry

**Status: confirmed.** `api_health_full` (`system_api.py:64-99`) folds in `config_preflight.run_preflight()` under `payload["config"]`. `run_preflight` returns `calendar_token: bool` (presence only) — `services/config_preflight.py` docstring + `_TOKEN_FILE = …/config/token.json`. Report-4 §6 asked for "a health probe that reports token TTL" so a session can see expiry without forcing a refresh (forcing one mutates live auth state — out of bounds). The expiry is in `token.json` and is a cheap, side-effect-free read, fitting `run_preflight`'s existing "file-exists reads" contract.

```bash
sed -n '64,99p' bmo/pi/routes/system_api.py     # /health/full folds in run_preflight() under payload["config"]
sed -n '40,75p' bmo/pi/services/config_preflight.py   # run_preflight returns calendar_token: bool (presence only)
```

## Sub-phases

> Run pytest from `bmo/pi`. Cheap per-sub-phase check = the single affected test file + `ruff check` on touched files. No bare `print()` (the `no-new-prints` guard).

### 08A — Capture the running-code identity at boot and surface it on `/api/v1/health`

**Objective:** `/api/v1/health` (and its `/health` alias) reports which code is actually running — the git SHA captured at process start, the served asset build stamp, the process start time, and uptime — so a deploy↔restart skew is visible in one GET.

**Files:** `bmo/pi/app.py` (boot-time capture), `bmo/pi/routes/system_api.py` (health payload), `bmo/pi/tests/test_system_api.py`.

**Steps:**

1. **Capture the running SHA + start time once, at import/boot.** In `app.py` (module level, near the other startup constants), record `_PROCESS_STARTED_AT = datetime.now(timezone.utc)` and `_RUNNING_COMMIT = <git rev-parse HEAD>` computed **once** at import. Reuse the existing git helper rather than a new subprocess shape: `from dev.dev_tools import git_command_args` → `git_command_args(["rev-parse", "HEAD"], <repo_root>)`, taking `output.strip()[:12]` when `exit_code == 0`, else `None`. Derive `<repo_root>` from `__file__` (the `bmo/pi` dir's repo). **Capturing at import time is the whole point**: it pins the SHA the process *started* with, so after the tree advances the health endpoint still reports the older running SHA — exactly the report-3 skew signal. Wrap in try/except so a non-git environment (Docker image, CI) degrades to `commit: null`, never raises at import.
2. **Surface it on the health route.** In `health()` (`system_api.py:51-54`), keep `status` and `api_version` **verbatim** (back-compat per the existing comment) and add: `commit` (the boot-captured SHA or `null`), `asset_build` (`_app()._static_mtime("js/bmo.js")` — the same integer the index uses; guard to `null` on error), `started_at` (ISO 8601), and `uptime_s` (int seconds since `_PROCESS_STARTED_AT`). Resolve these via `_app()` so the late-binding/test-mock pattern the module already uses keeps working.
3. **Keep it cheap and non-throwing.** The SHA is read from the cached boot value (no per-request subprocess); the mtime is a single `os.path.getmtime`; never let a missing file or git failure 500 the health route — each added field degrades to `null`.
4. Tests in `tests/test_system_api.py`: extend `test_health_ok` (or add `test_health_reports_running_identity`) to assert `status == "ok"`, `api_version == "v1"`, and that `commit`, `asset_build`, `started_at`, `uptime_s` keys are present with the right types; monkeypatch the boot SHA + a tmp asset path so the values are deterministic; assert a forced git/mtime failure still returns 200 with those fields `null` (no raise).

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_system_api.py -q && ruff check routes/system_api.py app.py`.

**Acceptance:** `GET /api/v1/health` (and `/health`) returns the existing `status`/`api_version` plus `commit`/`asset_build`/`started_at`/`uptime_s`; a non-git or missing-asset environment still returns 200 with those fields `null`.

### 08B — Surface the calendar token TTL on `/api/health/full`

**Objective:** the full-health payload reports the calendar token's expiry/TTL (not just presence), so a session can see how close it is to expiring without forcing a refresh.

**Files:** `bmo/pi/services/config_preflight.py`, `bmo/pi/tests/` (the preflight/full-health test — `test_system_api.py` covers `/health/full`; add a focused preflight test if none exists).

**Steps:**

1. In `run_preflight` (`config_preflight.py`), in addition to the existing `calendar_token: bool`, read `token.json`'s `expiry` (the `_TOKEN_FILE` it already references) and add `calendar_token_expiry` (ISO string or `null`) and `calendar_token_ttl_s` (int seconds until expiry, may be negative if already expired, or `null` if no token / unparseable). Keep it pure file-read + parse — no Google client construction, no network, consistent with the module's "cheap + side-effect-free" contract; wrap in try/except so a missing/garbled token never breaks preflight.
2. Because `api_health_full` already folds `run_preflight()` into `payload["config"]` (`system_api.py:84-85`), no route change is needed — the new keys flow through automatically. (Optionally also mirror `calendar_token_ttl_s` to the top-level `config` summary if that reads cleaner; not required.)
3. Tests: a tmp `token.json` with a known future `expiry` → `calendar_token_ttl_s` positive and `calendar_token_expiry` set; an already-past expiry → negative TTL; a missing/garbled token → both `null` and `calendar_token: false`/`true` unchanged; assert `/api/health/full` 200 carries the keys under `config`.

**Cheap check:** `cd bmo/pi && python -m pytest tests/test_system_api.py -q && ruff check services/config_preflight.py`.

**Acceptance:** `/api/health/full` `config` block reports `calendar_token_expiry` + `calendar_token_ttl_s` (cheap, no refresh, no secret); missing/garbled token degrades to `null` without breaking preflight or the route.

## Research notes

- **Boot-time SHA capture is what makes skew observable (08A):** a process's imported modules are fixed at start; reading `git rev-parse HEAD` *per request* would report the **tree** SHA (which advances on deploy) and would therefore *hide* the skew — it'd look fresh while the code is stale. Capturing once at import pins the SHA the running code was built from, so `health.commit` (boot) diverging from the tree HEAD / `asset_build` (fresh files) is the exact signal report-3 reconstructed by hand from `ps`/`stat`. This is the API-level form of INSTRUCTIONS.md rule 28 (auto-diagnose to the responsible mechanism) — the endpoint now *tells* you the running build.
- **Additive, verbatim-preserving health changes (08A):** the route's own comment establishes the convention — keep `status` and `api_version` exactly so existing unversioned probes (`dnd-app lan-discovery.ts`) and the `/health` auth-exemption (`app.py:356`) are unaffected; only *add* fields. `/api/v1/health/full` already demonstrates the "guarantee documented keys, pass through extras" forward-compat shape.
- **TTL without forcing a refresh (08B):** the QA could not exercise the token *refresh* path because forcing an expiry mutates live auth (out of bounds). Surfacing the *stored* expiry is the read-only middle ground: it lets a session judge token health (and the monitor reason about it) from a number, not a forced failure — complementing PHASE-05's status reconciliation with a concrete TTL.
- **No-secret discipline:** none of the added fields expose a secret — a 12-char commit, a file mtime, ISO timestamps, and an expiry/TTL are safe to return on a route that is auth-exempt by design. The token *value* is never read into the payload.

## Test plan

- **08A** — `tests/test_system_api.py`: health returns `status`/`api_version` verbatim + `commit`/`asset_build`/`started_at`/`uptime_s` with correct types; boot-SHA + asset-path monkeypatched for determinism; forced git/mtime failure → 200 with those fields `null` (no raise).
- **08B** — preflight/full-health test: future-expiry token → positive `calendar_token_ttl_s` + ISO `calendar_token_expiry`; past expiry → negative TTL; missing/garbled → `null`; `/api/health/full` 200 carries the keys under `config`.
- **End of phase (INSTRUCTIONS.md rule 5):** push; `bmo-pi-pytest.yml` + guards are the authoritative gate. No live-Pi deploy / restart / `deploy.sh` / `token.json` mutation (rule 6).

## Acceptance criteria

- [ ] `GET /api/v1/health` (+ `/health`) returns the existing `status`/`api_version` plus `commit` (boot-captured SHA), `asset_build`, `started_at`, `uptime_s`; degrades each to `null` (still 200) in a non-git / missing-asset environment.
- [ ] `/api/health/full` `config` block reports `calendar_token_expiry` + `calendar_token_ttl_s` from a cheap file read (no refresh, no secret); missing/garbled token → `null` without breaking preflight.
- [ ] No deploy/restart mechanics changed (the "restart on deploy" structural fix stays the owner's ops action, tracked in `docs/logs/BMO-ISSUES-LOG.md`); no secrets in any payload.
- [ ] `bmo-pi-pytest.yml` + guards green on `auto/bmo-phase-executer`; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Making `deploy.sh` / `bmo-deploy.yml` restart the bmo service after a pull** — the structural fix that *prevents* the skew; owner/ops action, already in `docs/logs/BMO-ISSUES-LOG.md`. This phase makes the skew *observable*, not *impossible*.
- **The browser-QA coverage blocker** (BMO_API_KEY gate + off-Pi automation browsers, report-3/4 §9 High) — an automation/infra gap (attach a Pi-local browser), **not** bmo app code; it is a QA-infra item for the owner, not a code phase. Tracked via the QA reports; not re-planned here.
- **Forcing/observing the live Google token refresh** — mutates live auth state (rule 6); 08B only surfaces the stored expiry.
- **A `/api/alarms` list-GET** (report-3 low observation) — investigated and found already satisfied: alarms persist to `data/alarms.json` (`services/timer_service.py` `_save_alarms`/`_load_alarms`) and rehydrate on dashboard load via the combined `GET /api/timers` (`get_all()` includes non-fired alarms) → `bmo.js` `fetchTimers()` at init. No code change needed.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one entry per sub-phase as it lands.)*
