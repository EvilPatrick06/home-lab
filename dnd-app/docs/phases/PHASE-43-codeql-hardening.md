# PHASE-43 — CodeQL alert triage + security hardening

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Drive the repository's open code-scanning alert count from its current default-setup
baseline down to a defensible, fully-triaged state by (1) **refreshing the alert data
first** so we act on live numbers rather than the 2026-06-10 snapshot, (2) converting
CodeQL from default setup to **advanced setup** so non-production directories
(`_archive/`, `dev/`, `scripts/`, `tools/`, test files) can be excluded from extraction
via `paths-ignore`, (3) **individually verifying** every excluded path is genuinely
non-production before excluding it, (4) hardening the real production sinks — most
importantly **deleting the two `pickle.load` arbitrary-code-execution shims** — and
(5) adding least-privilege `permissions:` blocks to the five GitHub Actions workflows
that lack them. The triage philosophy is owner-mandated: an alert is judged by whether
its sink is **reachable / plantable by an attacker**, never by "is it used today." A
code path that does something unsafe with attacker-controllable input is an attack
surface even if no caller exercises it now — the fix is to remove the unsafe capability,
not to dismiss-as-unused.

## Dependencies & cross-phase notes

- **Recommended-after PHASE-15 (`bmo-hygiene`) and PHASE-16 (`bmo-blueprint-refactor`)**
  per the index. The reason is overlap, not a hard block:
  - **PHASE-15 owns the `cloud_providers.py` curl command-injection criticals**
    (the curl-config-file helper that hides the API key + adds `--fail`). CodeQL flags
    `py/command-line-injection` at `bmo/pi/services/cloud_providers.py:206` (gemini curl),
    `:422` (groq curl), `:506` (fish_audio curl) — alerts **#175, #176, #177**. PHASE-43
    must **NOT re-fix these**; it verifies they are CLOSED by the fresh scan if PHASE-15
    ran first, and if PHASE-15 has not run, it leaves them for PHASE-15 (logs the cross-ref,
    does not touch `cloud_providers.py`). Same for the fish_audio key-on-cmdline + `--fail`
    item (PHASE-15 bullet, audit "Security/medium").
  - **PHASE-16 refactors `app.py` into Flask blueprints** (calendar/music/tv/chat/system/
    realtime). `app.py` carries **36 `py/stack-trace-exposure`** + **18 `py/log-injection`**
    + **4 `py/path-injection`** production alerts. If PHASE-16 ran first, those line numbers
    move and many alerts relocate to the new blueprint files. PHASE-43 re-derives counts
    from the **fresh scan** (sub-phase 43A) precisely so this drift is absorbed. If PHASE-16
    has **not** run, PHASE-43 still hardens `app.py` in place (the helper-function approach
    is refactor-neutral — a `fail()` error helper and a `_s()` log-sanitizer survive the
    blueprint split unchanged).
- **PHASE-13 owns the dnd-app `campaignId` path-injection** (its bullet: "TEN
  unsanitized-campaignId AI IPC handlers — extend NET-1 `sanitizeCampaignId`"). CodeQL's
  single `js/path-injection` prod alert in dnd-app and the broader campaignId family should
  be CLOSED by the fresh scan if PHASE-13 ran first. PHASE-43 verifies rather than re-fixes.
- **File collisions to coordinate:**
  - `.github/workflows/security-audit.yml`, `dnd-app-ci.yml`, `bmo-pi-pytest.yml`,
    `dnd-app-validate-5e.yml` — PHASE-43 adds `permissions:` blocks. PHASE-42
    (`bmo-deploy-automation`) may add a **new** workflow (`deploy-bmo.yml` or similar);
    that new file must also carry a `permissions:` block — coordinate so the new workflow
    is born with least-privilege rather than triggering a fresh alert. PHASE-43 runs after
    PHASE-42 in numeric order, so if PHASE-42's workflow exists at execution time, harden it
    too (the fresh scan in 43A will surface it).
  - `bmo/pi/services/bmo_logging.py` — PHASE-43 may add a CRLF-escaping helper. No other
    phase touches it.
  - `bmo/pi/services/voice_pipeline.py`, `bmo/pi/hardware/camera_service.py` — PHASE-43
    deletes the pickle shims. PHASE-21 (`discord-voice-quality`) touches TTS but not the
    voice-profile loader in `voice_pipeline.py`; verify no collision at execution time.

## Verified findings

All findings below were verified against the live tree and the live GitHub code-scanning /
Dependabot APIs on **2026-06-11** (system clock; the scan baseline itself is dated
2026-06-10T23:14:19Z, CodeQL tool version 2.25.6, build-mode `none`, default setup =
`dynamic/github-code-scanning/codeql:analyze`). **The executor MUST re-run sub-phase 43A
to refresh these numbers before acting** — they are a verified snapshot, not a license to
skip the refresh.

### F1 — There is NO CodeQL workflow file; scanning is via GitHub "default setup"

Verification:
```bash
ls .github/workflows/                       # bmo-pi-pytest.yml deploy.yml dnd-app-ci.yml
                                            # dnd-app-validate-5e.yml release.yml security-audit.yml
find .github -iname '*codeql*'              # (no output — no CodeQL workflow exists)
```
The scan runs as GitHub-managed **default setup** (confirmed by the alert
`most_recent_instance.analysis_key = "dynamic/github-code-scanning/codeql:analyze"` and
`environment.build-mode = "none"`). Default setup hides the workflow YAML and offers **no
`paths-ignore`** — the only way to exclude `_archive/`/dev/scripts/tests is to convert to
**advanced setup** (a committed `.github/workflows/codeql.yml` + optional
`.github/codeql/codeql-config.yml`). This is the central enabling step of the phase.

### F2 — 552 open code-scanning alerts; verified rule + severity breakdown

Verification (writes to a temp file because `gh ... --paginate` concatenates JSON arrays
with `][`, which must be joined before parsing):
```bash
gh api "repos/EvilPatrick06/home-lab/code-scanning/alerts?state=open&per_page=100" \
  --paginate > /tmp/cs_alerts.json
python3 - <<'PY'
import json
data=json.loads(open('/tmp/cs_alerts.json').read().replace('][',','))
print('TOTAL OPEN:', len(data))
from collections import Counter
sev=Counter(); rules=Counter()
for a in data:
    sev[a['rule'].get('security_severity_level') or a['rule'].get('severity')]+=1
    rules[a['rule']['id']]+=1
for k,v in sev.most_common(): print(v,k)
for k,v in rules.most_common(): print(v,k)
PY
```
Confirmed **552 open** (47 critical, 238 high, 267 medium). Top rules:

| Count | Rule | Sev | Domain |
|---|---|---|---|
| 162 | `py/stack-trace-exposure` | medium | bmo |
| 115 | `py/path-injection` | high | bmo |
| 81 | `py/log-injection` | medium | bmo |
| 20 | `py/polynomial-redos` | high | bmo |
| 19 | `py/clear-text-logging-sensitive-data` | high | bmo |
| 18 | `js/file-system-race` | high | dnd-app (mostly tests) |
| 16 | `js/request-forgery` | critical | dnd-app |
| 15 | `py/partial-ssrf` | critical | bmo |
| 13 | `js/insecure-temporary-file` | high | dnd-app (all in `book-storage.test.ts`) |
| 11 | `js/file-access-to-http` | medium | dnd-app |
| 10 | `js/remote-property-injection` | high | dnd-app |
| 10 | `js/incomplete-multi-character-sanitization` | high | dnd-app importers |
| 8 | `py/command-line-injection` | critical | bmo |
| 5 | `actions/missing-workflow-permissions` | medium | `.github` |
| 2 | `py/unsafe-deserialization` (pickle) | critical | bmo |

(Full long-tail of single-digit rules omitted; the executor's 43A refresh regenerates the
complete table.)

### F3 — Noise vs production split: 165 noise candidates, 387 production

Verification (the classification function; `_archive/` exists at repo root, `dev/` =
`bmo/pi/dev/`, `scripts/` = `dnd-app/scripts/*`, `tools/` = `dnd-app/tools/`):
```bash
python3 - <<'PY'
import json
data=json.loads(open('/tmp/cs_alerts.json').read().replace('][',','))
from collections import Counter
def noise_kind(p):
    parts=p.split('/')
    if '_archive' in parts: return 'archive'
    if p.endswith('.test.ts') or p.endswith('.test.tsx') or '.test.' in p: return 'tests'
    if any(s in ('test','tests','__tests__') for s in parts): return 'tests'
    if 'dev' in parts: return 'dev'
    if 'scripts' in parts: return 'scripts'
    if 'tools' in parts: return 'tools'
    return None
noise=Counter(); prod=Counter()
for a in data:
    p=a['most_recent_instance']['location']['path']
    nk=noise_kind(p)
    (noise if nk else prod)[nk or p.split('/')[0]]+=1
print('NOISE', dict(noise), 'sum', sum(noise.values()))
print('PROD', dict(prod), 'sum', sum(prod.values()))
PY
```
Confirmed: **noise = 165** (84 archive, 32 dev, 30 scripts, 18 tests, 1 tools) and
**production = 387** (322 bmo, 60 dnd-app, 5 `.github`). The audit's "~164 noise" and
"60 dnd-app production" match. **Owner directive: each of the 165 candidates must be
individually confirmed non-production before exclusion** — `_archive/` = quarantined dead
code from the 2026-04 reorg (`_archive/2026-04-reorg/old-bmo-standalone`,
`pi-deploy-old`, `root-junk`, `scripts-junk`); `bmo/pi/dev/` = scratch; `dnd-app/scripts/*`
= local-run build/release/audit scripts (audit, batch-utils, build, i18n, release, submit);
test files = no production surface. **Any candidate that actually reaches production behavior
is PROMOTED to the triage list, not excluded.** `dnd-app/tools/replace-console-logs.js`
(1 alert) is borderline (a codemod run by a human) — confirm it cannot run in production and
exclude only if confirmed.

### F4 — Two `pickle.load` arbitrary-code-execution shims (CRITICAL — must be deleted)

Verification:
```bash
grep -rn 'pickle.load' bmo/pi/
# bmo/pi/hardware/camera_service.py:235:  self._known_faces = pickle.load(f)
# bmo/pi/services/voice_pipeline.py:284:  self._voice_profiles = pickle.load(f)
gh api "repos/EvilPatrick06/home-lab/code-scanning/alerts/6" --jq '.most_recent_instance.location'
gh api "repos/EvilPatrick06/home-lab/code-scanning/alerts/7" --jq '.most_recent_instance.location'
```
Alert **#7** = `voice_pipeline.py:284`, alert **#6** = `camera_service.py:235`, both rule
`py/unsafe-deserialization` (critical). **Note the path drift:** the audit text said
`camera_service.py` is under `services/`; it is actually at
**`bmo/pi/hardware/camera_service.py`** (PHASE-INDEX has the correct line, the audit prose
did not). Both sites are legacy **migration shims** that read a `.pkl`, convert to JSON, then
delete the `.pkl`:

`voice_pipeline.py:275-290` (`_load_voice_profiles`):
```python
def _load_voice_profiles(self):
    if os.path.exists(VOICE_PROFILES_JSON):
        with open(VOICE_PROFILES_JSON, encoding="utf-8") as f:
            raw = json.load(f)
        self._voice_profiles = {k: np.asarray(v, dtype=np.float32) for k, v in raw.items()}
    elif os.path.exists(VOICE_PROFILES_PATH):          # legacy .pkl branch — DELETE
        with open(VOICE_PROFILES_PATH, "rb") as f:
            self._voice_profiles = pickle.load(f)       # ACE sink
        self._save_voice_profiles_json()
        try: os.remove(VOICE_PROFILES_PATH)
        except OSError: pass
    return self._voice_profiles
```
Constants: `VOICE_PROFILES_PATH = .../voice_profiles.pkl` (line 35),
`VOICE_PROFILES_JSON = .../voice_profiles.json` (line 36); `import pickle` at line 12.

`camera_service.py:222-241` (`_load_known_faces`) is the exact same shape:
`KNOWN_FACES_PATH = .../known_faces.pkl` (line 21), `KNOWN_FACES_JSON` (line 20),
`import pickle` at line 9, legacy branch at `:233-240`.

`pickle.load` on a file path is an arbitrary-code-execution sink. The absence of `.pkl`
files on the Pi today is NOT the safety argument — a planted file (restored backup,
path-traversal write, compromised data dir) would execute code on load. **Remove the
capability entirely** — drop the `elif ... .pkl` branch, the `import pickle`, and the unused
`*_PATH` constant. No safe-loader substitute is needed: the JSON path is already the live
format, and any genuinely-needed old `.pkl` can be migrated once, out-of-band, by a human
running a one-off script (not on every service start).

### F5 — dnd-app request-forgery family (28 prod): main-process fetches to user-configured URLs

Verification:
```bash
python3 - <<'PY'
import json
data=json.loads(open('/tmp/cs_alerts.json').read().replace('][',','))
fam={'js/request-forgery','js/file-access-to-http','js/http-to-file-access'}
for a in data:
    if a['rule']['id'] in fam:
        l=a['most_recent_instance']['location']
        if l['path'].startswith('dnd-app') and '.test.' not in l['path']:
            print(a['number'], l['path']+':'+str(l['start_line']))
PY
grep -n 'ollamaBaseUrl' dnd-app/src/main/ai/ollama-client.ts   # let ollamaBaseUrl = OLLAMA_BASE_URL; setter strips trailing /
```
28 production fetch-family alerts, all in the **main process**, all where the URL base is a
value the **local user configures in Settings**:
- `ai/ollama-client.ts` (9) — `fetch(\`${ollamaBaseUrl}/...\`)` at lines 36, 48, 93, 227;
  `ollamaBaseUrl` is set by `setOllamaBaseUrl(url)` from the user's Ollama URL setting.
- `cloud-sync.ts` (4) — `fetch(\`${getBmoBaseUrl()}/api/rclone/...\`)` (lines 78, 159, 208,
  256); base is the user's configured BMO/rclone endpoint.
- `discord-integration/discord-service.ts` (5), `ai/gemini-client.ts` (2),
  `storage/atomic-write.ts` (2), `bmo-bridge.ts`, `registry-bridge.ts`, `library-bridge.ts`,
  `lan-discovery.ts`, `sound-cache.ts`, `log.ts` (1 each).

Per the owner directive in the index: **a fetch to a URL the LOCAL user configures in
Settings is low-risk by design** and may be **dismissed-with-reason** ("won't fix" /
"false positive" + a comment stating the URL is local-user-configured, not remote/peer/AI
influenced). **But any URL influenced by remote/peer/AI input is real and gets fixed —
do not blanket-dismiss the family.** Each of the 28 must be inspected for its URL source
during 43E; the verification above confirms the four highest-count files (ollama, cloud-sync)
are user-configured. Two more in the raw alert set (`registry-bridge.integration.test.ts:36`
and `:119`, alerts #447/#448) are **test files** → covered by the `paths-ignore` exclusion,
not dismissed individually.

### F6 — dnd-app importer incomplete-sanitization (10 prod): REAL, fix them

Verification:
```bash
python3 - <<'PY'
import json
data=json.loads(open('/tmp/cs_alerts.json').read().replace('][',','))
for a in data:
    if a['rule']['id'] in {'js/incomplete-multi-character-sanitization','js/incomplete-sanitization'}:
        l=a['most_recent_instance']['location']
        if not l['path'].endswith('.test.ts'):
            print(a['number'], l['path']+':'+str(l['start_line']))
PY
```
10 alerts in the D&D Beyond / Foundry importers:
`services/io/import-dnd-beyond/features.ts` (4), `inventory.ts` (3), `import-foundry.ts` (2),
`spells.ts` (1). These parse **remote/imported data** (HTML descriptions from external VTTs),
so the source IS attacker-influenceable — these are **fixed, not dismissed**. The typical
cause is a single-pass `.replace(/<[^>]*>/g, '')`-style tag strip that misses overlapping or
nested patterns; the fix is to loop the replacement to a fixed point or use a proper
sanitizer.

### F7 — Five workflows lack `permissions:` blocks

Verification:
```bash
for f in .github/workflows/*.yml; do echo "$f:"; grep -n 'permissions:' "$f" || echo '  NONE'; done
# deploy.yml:11 + release.yml:24 HAVE permissions; the other FIVE do not:
# bmo-pi-pytest.yml, dnd-app-ci.yml, dnd-app-validate-5e.yml, security-audit.yml — NO block
```
Alerts **#1–#5** (`actions/missing-workflow-permissions`): `dnd-app-ci.yml:29`,
`dnd-app-validate-5e.yml:21`, `bmo-pi-pytest.yml:25`, `security-audit.yml:22`,
`security-audit.yml:38`. All four files (security-audit has two jobs) run read-only CI and
need only `permissions: contents: read` at the workflow top level. Note `deploy.yml` and
`release.yml` already scope permissions (release needs `contents: write` for asset upload —
do NOT touch it).

### F8 — Dependabot: 2 open alerts, both torch CVE-2025-3000, no patch exists

Verification:
```bash
gh api "repos/EvilPatrick06/home-lab/dependabot/alerts?state=open&per_page=100" --paginate \
  > /tmp/dep_alerts.json
python3 - <<'PY'
import json
data=json.loads(open('/tmp/dep_alerts.json').read().replace('][',','))
print('TOTAL OPEN:', len(data))
for a in data:
    adv=a['security_advisory']
    print(a['number'], adv['severity'], a['dependency']['package']['name'],
          a['dependency']['manifest_path'], adv['ghsa_id'],
          [v.get('first_patched_version') for v in adv['vulnerabilities']])
PY
grep -n '^torch==' bmo/pi/requirements.txt bmo/pi/requirements-ci.txt   # torch==2.12.0+cpu
```
**2 open**, both `torch` GHSA-rrmf-rvhw-rf47 / CVE-2025-3000 (`requirements.txt` #85,
`requirements-ci.txt` #84). Severity **low** (CVSS 5.3, `AV:L/AC:L/PR:L`), memory corruption
via `torch.jit.script` on attacker-controlled input. Vulnerable range `<= 2.12.0`,
**`first_patched_version: None`** — no fixed release exists as of 2026-06-11. BMO pins
`torch==2.12.0+cpu` and does not call `torch.jit.script` on untrusted input (it uses Silero
VAD inference only — `voice_pipeline.py:264` runs a pre-trained model, no JIT compilation of
user data). **Action: dismiss-with-reason ("no patch available; not reachable — BMO does not
`torch.jit.script` untrusted input") or leave to Dependabot auto-resolve when a patch lands.**
Re-check for a patched release at execution time before dismissing.

## Sub-phases

> Execute in order. 43A is **mandatory and first** — it refreshes the data every later
> sub-phase depends on. Sub-phases that only change Python under `bmo/pi/` add `pytest
> bmo/pi/tests/` to the end-of-phase gate (rule 5). API-only sub-phases (43A, 43B, 43E
> dismissals, 43H) touch no source and run no gate beyond a sanity re-query.

### 43A — Refresh the data (MANDATORY FIRST)

Objective: replace every 2026-06-10/06-11 number in this plan with a live count before
acting. Many phases (13, 15, 16, 42) may have landed between authoring and execution and
will have fixed/moved/auto-closed alerts.

Files to touch: none (data-gathering + this plan's `## Completed` notes only).

Steps:
1. `gh auth status` — confirm authenticated (rule 19 precheck). If not → rule 9 STOP+ask.
2. **Trigger a fresh CodeQL scan.** Default setup scans on push to `master`; the end-of-phase
   commit will trigger it, but for an up-front baseline either (a) re-run the latest CodeQL
   workflow run:
   ```bash
   gh api repos/EvilPatrick06/home-lab/actions/workflows --jq '.workflows[]|select(.name|test("CodeQL"))|.id'
   gh run list --workflow=<codeql-workflow-id> --limit 1            # find latest run id
   gh api -X POST repos/EvilPatrick06/home-lab/actions/runs/<run-id>/rerun
   ```
   or (b) proceed straight to 43B (convert to advanced setup) and dispatch the new
   `codeql.yml` via `gh workflow run codeql.yml`. **Wait for the run to complete**
   (`gh run watch <id>`) before re-deriving counts.
3. **Refresh Dependabot.** There is no POST-to-rescan endpoint; the dependency graph
   refreshes on a manifest-touching push and on GitHub's own schedule. Just re-query open
   alerts (`gh api .../dependabot/alerts?state=open`) — that reflects the current graph.
4. **Re-derive ALL counts** with the F2/F3 scripts above. Write the refreshed totals into
   this plan's `## Completed` section (rule 17) so later sub-phases cite live numbers.
5. **Diff against the F2/F3 baseline** for new / modified / auto-closed entries. Specifically
   confirm: the `cloud_providers.py` command-injection alerts (#175/#176/#177) — CLOSED if
   PHASE-15 ran; the dnd-app `campaignId` path-injection — CLOSED if PHASE-13 ran; the
   `app.py` line numbers — moved if PHASE-16 ran. Note each cross-ref result.

Cheap check: `gh api .../code-scanning/alerts?state=open --jq 'length'` returns a number;
`gh auth status` is green.

Acceptance: refreshed total + per-rule + noise/prod counts recorded in `## Completed`;
cross-ref status (PHASE-13/15/16) noted; fresh CodeQL run completed.

### 43B — Convert to CodeQL advanced setup with `paths-ignore`

Objective: replace default setup with a committed advanced-setup workflow so non-production
paths can be excluded from extraction.

Files to touch: **new** `.github/workflows/codeql.yml`, **new**
`.github/codeql/codeql-config.yml`.

Steps:
1. Create `.github/codeql/codeql-config.yml` with the **verified** exclusions from F3
   (only paths individually confirmed non-production in 43C — author the list here, but the
   per-path confirmation is 43C's gate; if 43C demotes a path, edit this file before the
   phase commit):
   ```yaml
   name: "CodeQL config"
   paths-ignore:
     - '_archive/**'
     - 'bmo/pi/dev/**'
     - 'dnd-app/scripts/**'
     - '**/*.test.ts'
     - '**/*.test.tsx'
     - 'bmo/pi/tests/**'
     # tools/replace-console-logs.js: include ONLY if 43C confirms non-production
   ```
2. Create `.github/workflows/codeql.yml` (matrix over `python` and
   `javascript-typescript`, `build-mode: none` for both — matching the current default-setup
   environment), top-level `permissions: { contents: read, security-events: write }`,
   `on: { push: { branches: [master] }, pull_request: { branches: [master] },
   schedule: [{ cron: '18 5 * * 1' }], workflow_dispatch: {} }`, and the
   `github/codeql-action/init@v3` step with `config-file: ./.github/codeql/codeql-config.yml`
   (or inline `config:`). Add `actions` to the language matrix so the
   `actions/missing-workflow-permissions` family keeps being scanned. Pin the action to the
   current major (`@v3`).
3. **In the GitHub UI, switch the repo from CodeQL default setup to advanced setup**
   (Settings → Code security → Code scanning → CodeQL → "Switch to advanced"). This step is
   manual/UI — document it in `## Completed` as a user-action item if the API/CLI cannot do
   it headlessly. NOTE: the committed `codeql.yml` is inert until default setup is disabled;
   having both produces duplicate runs. **This is a user-action callout** (the agent commits
   the workflow; the owner flips the UI toggle).
4. After advanced setup is active and a scan completes (43A's re-run or this commit's push),
   confirm the excluded paths no longer produce alerts.

Cheap check: `yamllint .github/workflows/codeql.yml .github/codeql/codeql-config.yml` if
available; otherwise `python3 -c "import yaml,sys; [yaml.safe_load(open(p)) for p in sys.argv[1:]]" .github/workflows/codeql.yml .github/codeql/codeql-config.yml` parses both.

Acceptance: both files exist and parse; `codeql.yml` has a least-privilege `permissions:`
block; `paths-ignore` lists only 43C-confirmed paths; user-action toggle is documented.

### 43C — Individually verify the 165 noise candidates before excluding

Objective: confirm each excluded path is genuinely non-production; promote any that reaches
production behavior to the triage list (43D-43G).

Files to touch: none beyond editing `.github/codeql/codeql-config.yml` (43B) if a path is
demoted; record results in `## Completed`.

Steps:
1. List every noise-candidate path + its alert rule:
   ```bash
   python3 - <<'PY'
   import json
   data=json.loads(open('/tmp/cs_alerts.json').read().replace('][',','))
   def noise_kind(p):
       parts=p.split('/')
       if '_archive' in parts: return 'archive'
       if p.endswith('.test.ts') or p.endswith('.test.tsx') or '.test.' in p: return 'tests'
       if any(s in ('test','tests','__tests__') for s in parts): return 'tests'
       if 'dev' in parts: return 'dev'
       if 'scripts' in parts: return 'scripts'
       if 'tools' in parts: return 'tools'
       return None
   for a in sorted(data,key=lambda a:a['most_recent_instance']['location']['path']):
       p=a['most_recent_instance']['location']['path']
       k=noise_kind(p)
       if k: print(k, a['number'], p+':'+str(a['most_recent_instance']['location']['start_line']), a['rule']['id'])
   PY
   ```
2. Confirm each bucket non-production:
   - `_archive/**` — quarantined dead code; `grep -rn 'import.*_archive\|from.*_archive\|require.*_archive' bmo dnd-app` returns nothing (no live code imports `_archive/`). Confirm.
   - `bmo/pi/dev/**` — scratch; confirm `bmo/pi/dev/dev_tools.py` is not imported by `app.py` or any systemd entrypoint (`grep -rn 'from dev\.\|import dev_tools\|dev\.dev_tools' bmo/pi --include='*.py' | grep -v '/dev/'`).
   - `dnd-app/scripts/**` — local-run only; confirm none are referenced by `package.json` `main`/`build`/runtime (they appear only in `scripts:` npm targets, which are dev-time).
   - test files (`**/*.test.ts(x)`, `bmo/pi/tests/**`) — no production surface by definition.
   - `dnd-app/tools/replace-console-logs.js` — a codemod; confirm it is invoked only manually (`grep -rn 'replace-console-logs' dnd-app/package.json dnd-app/scripts`).
3. **Any candidate whose sink reaches production behavior is PROMOTED** — remove its path
   from the `paths-ignore` list (43B) and add it to the appropriate triage sub-phase. Record
   the promotion + reason.

Cheap check: the grep commands above return empty (no live import of excluded dirs).

Acceptance: every one of the 165 (or refreshed count) candidates has a one-line
non-production justification OR a promotion note in `## Completed`; `paths-ignore` reflects
only confirmed-non-production paths.

### 43D — Delete the two `pickle.load` ACE shims

Objective: remove the arbitrary-code-execution capability entirely (F4).

Files to touch: `bmo/pi/services/voice_pipeline.py`,
`bmo/pi/hardware/camera_service.py`.

Steps:
1. `voice_pipeline.py`: in `_load_voice_profiles` (lines 275-290) delete the entire
   `elif os.path.exists(VOICE_PROFILES_PATH): ...` branch (lines 282-289). Remove
   `import pickle` (line 12) and `VOICE_PROFILES_PATH = ... .pkl` (line 35) **only if
   nothing else references them** (`grep -n 'pickle\|VOICE_PROFILES_PATH' bmo/pi/services/voice_pipeline.py`
   after the edit returns nothing). Keep the JSON branch unchanged.
2. `camera_service.py`: in `_load_known_faces` (lines 222-241) delete the
   `elif os.path.exists(KNOWN_FACES_PATH): ...` branch (lines 233-240). Remove
   `import pickle` (line 9) and `KNOWN_FACES_PATH = ... .pkl` (line 21) if unreferenced
   after the edit. Keep the JSON branch.
3. Update or remove `_save_*_json` callers only if they were called solely from the deleted
   branch — verify they are still called from the live write paths (they are: profiles/faces
   are saved when enrolled). Do NOT remove the JSON save methods.
4. Add a one-line code comment noting the legacy `.pkl` migration was removed for security
   (`py/unsafe-deserialization`); if a stray `.pkl` ever needs importing, do it once
   out-of-band with a human-run script.

Cheap check:
```bash
python3 -c "import ast; ast.parse(open('bmo/pi/services/voice_pipeline.py').read()); ast.parse(open('bmo/pi/hardware/camera_service.py').read()); print('parse ok')"
grep -rn 'pickle' bmo/pi/   # must return nothing
```

Acceptance: no `pickle` import or `pickle.load` anywhere in `bmo/pi/`; both modules parse;
JSON load/save paths intact; existing tests (if any cover face/voice loading) updated to drop
the `.pkl` case.

### 43E — dnd-app request-forgery family: fix the real, dismiss the local-configured

Objective: triage the 28 prod fetch-family alerts (F5) — fix any with remote/peer/AI-influenced
URLs; dismiss-with-reason the local-user-configured ones.

Files to touch (only if a fix is warranted): the cited dnd-app main-process files; plus
**code-scanning dismissals via API** for the rest.

Steps:
1. For each of the 28 alerts, inspect the URL source:
   ```bash
   python3 - <<'PY'
   import json
   data=json.loads(open('/tmp/cs_alerts.json').read().replace('][',','))
   fam={'js/request-forgery','js/file-access-to-http','js/http-to-file-access','js/partial-ssrf'}
   for a in data:
       if a['rule']['id'] in fam:
           l=a['most_recent_instance']['location']
           if l['path'].startswith('dnd-app') and '.test.' not in l['path']:
               print(a['number'], a['rule']['id'], l['path']+':'+str(l['start_line']))
   PY
   ```
2. **Classify each:** URL base from a Settings value the local user controls (ollama URL,
   BMO/rclone base, gemini/registry/library/bmo bridges, lan-discovery, discord webhook,
   sound-cache CDN) → **dismiss-with-reason**. URL influenced by remote/peer/AI text (none
   found in F5 verification, but re-check after refresh — e.g. an AI-emitted URL fetched
   without an allowlist) → **fix** (validate scheme is `http(s)`, host is in an allowlist,
   reject `file:`/`data:`; for AI-sourced URLs require user approval — coordinate with the
   AI web-search approval path).
3. **Dismiss** each confirmed-local alert via the API (F-verified endpoint):
   ```bash
   gh api -X PATCH repos/EvilPatrick06/home-lab/code-scanning/alerts/<N> \
     -f state=dismissed -f dismissed_reason="won't fix" \
     -f dismissed_comment="URL base is a local-user-configured Settings value (Ollama/BMO/rclone/registry endpoint), not remote/peer/AI input. Low-risk by design."
   ```
   (`dismissed_reason` ∈ {`false positive`, `won't fix`, `used in tests`}; comment ≤ 280
   chars. There is **no batch endpoint** — one PATCH per alert.)
4. For any **fixed** alert, the fresh scan after the phase commit auto-closes it — do not
   dismiss those.

Cheap check: if any code was changed, `npx tsc --noEmit -p tsconfig.web.json` (or node config
for main-process files) on the changed surface; the dismissal PATCHes return 200.

Acceptance: every fetch-family prod alert is either fixed (code change + will auto-close) or
dismissed-with-a-specific-reason; no blanket family dismissal; dismissal comments cite the
local-configured rationale per alert.

### 43F — dnd-app importer incomplete-sanitization: fix (10 prod)

Objective: fix the 10 importer sanitization alerts (F6) — these parse remote VTT data, so
they are real.

Files to touch: `dnd-app/src/renderer/src/services/io/import-dnd-beyond/features.ts`,
`inventory.ts`, `spells.ts`, `dnd-app/src/renderer/src/services/io/import-foundry.ts`.

Steps:
1. For each cited line, find the offending `.replace()` (typically a single-pass HTML-tag
   or entity strip on imported description text). The CodeQL finding is that a single pass
   misses overlapping/nested patterns (e.g. `<<b>>` → `<b>` after one strip).
2. Replace single-pass strips with a fixed-point loop or a vetted sanitizer:
   - Loop: `while (prev !== s) { prev = s; s = s.replace(/<[^>]*>/g, '') }` (run to
     convergence), OR
   - Prefer an existing sanitizer if the codebase already has one (`grep -rn 'sanitize\|DOMPurify\|stripHtml' dnd-app/src/renderer/src/services/io` first; reuse before adding a dependency).
3. Keep the import output semantics identical for well-formed input — only the
   adversarial/nested case changes.
4. Add/extend a colocated `.test.ts` with a nested-tag fixture proving the strip converges.

Cheap check: `npx vitest run dnd-app/src/renderer/src/services/io/import-dnd-beyond/features.test.ts`
(and the new/affected importer test files); `npx tsc --noEmit -p tsconfig.web.json` on the
changed files.

Acceptance: each importer strips nested/overlapping tags to a fixed point; new test covers
the adversarial fixture; fresh scan auto-closes the 10 alerts.

### 43G — bmo Flask hardening: helpers for stack-trace + log injection

Objective: close the production stack-trace-exposure (97) and log-injection (80) alerts with
two shared helpers, judged by **reachability** not current usage. **Skip `cloud_providers.py`
(PHASE-15 owns it) and re-derive line numbers from the fresh scan if PHASE-16 moved `app.py`
code into blueprints.**

Files to touch: **new** sanitizer helper in `bmo/pi/services/bmo_logging.py` (verified
central logging shim — every module does `from services.bmo_logging import get_logger`);
the production route/app files carrying alerts: `bmo/pi/routes/ide.py`, `bmo/pi/app.py`,
`bmo/pi/ide_app/ide_app.py`, `bmo/pi/routes/rclone_api.py`, and the log-injection sites in
`bmo/pi/services/voice_pipeline.py`, `bmo/pi/agents/mcp_client.py`,
`bmo/pi/services/scene_service.py`, `music_service.py`, `audio_output_service.py`.
**(All paths re-derived in 43A; the above is the 2026-06-11 distribution.)**

Steps:
1. **stack-trace-exposure** (`return jsonify({"error": str(e)})` / `return traceback.format_exc()`
   patterns leaking exception text to HTTP clients): add a small Flask error helper and route
   it through. Canonical CodeQL-recognized pattern (server-side log + generic client message):
   ```python
   # in bmo/pi/services/bmo_logging.py (or a routes/_errors.py helper)
   def fail(log, exc, status=500, public="An internal error occurred"):
       log.exception("request failed")            # full traceback to journald only
       from flask import jsonify
       return jsonify({"ok": False, "error": public}), status
   ```
   Replace each `return jsonify({..., "error": str(e)}), 500` with
   `return fail(log, e)`. Keep the *intentional* user-facing messages that are static strings
   (`"path escapes the library root"`, `"invalid or missing campaign_id"` — these are not
   exception text and are not alerts). Only the dynamic `str(e)`/`format_exc()` returns change.
2. **log-injection** (CRLF in `log.info(f"...{user_input}...")`): add a CRLF-stripping
   sanitizer that CodeQL recognizes as a sanitizer (an inline `.replace`):
   ```python
   # in bmo/pi/services/bmo_logging.py
   def _s(v):
       """Strip CR/LF so user input can't forge log lines (CWE-117)."""
       return str(v).replace("\r", "").replace("\n", " ")
   ```
   Wrap user-controlled interpolations at each flagged log call:
   `log.info("loaded profile %s", _s(name))` (prefer `%s` lazy args over f-strings; wrap the
   user value with `_s`). **Also** harden the central formatter as defense-in-depth: subclass
   the human + JSON formatters to escape `\r`/`\n` in `record.getMessage()` — this catches
   future un-wrapped sites even though CodeQL only credits the inline `_s()` for closing the
   alert. Apply `_s()` at every flagged log-injection site (re-derived in 43A).
3. **Do NOT touch `cloud_providers.py`** (PHASE-15) — if its command-injection/stack-trace
   alerts are still open at execution time, leave them; log the cross-ref.
4. For the `ide.py` / `ide_app.py` concentration (46 + 14 stack-trace alerts): these are the
   "under construction" IDE (PHASE-15 bullet flags an "under construction marker"). Judge by
   reachability — the IDE routes ARE registered in the live Flask app (verify with
   `grep -rn "register.*ide\|ide_bp\|/api/ide" bmo/pi/app.py bmo/pi/routes/__init__.py`),
   so their error leaks are reachable and **get the `fail()` treatment** (the directive:
   "not currently used" is never a reason to leave a dangerous sink). If 43A shows them
   gated/unregistered, still harden (a future route registration reaches them).

Cheap check:
```bash
python3 -c "import ast,glob; [ast.parse(open(f).read()) for f in ['bmo/pi/services/bmo_logging.py','bmo/pi/routes/ide.py','bmo/pi/app.py','bmo/pi/routes/rclone_api.py']]; print('parse ok')"
cd bmo/pi && python -m pytest tests/ -k "logging or error or sanitize" -q   # if such tests exist
```

Acceptance: a `fail()` helper + `_s()` sanitizer exist in `bmo_logging.py`; every production
stack-trace-exposure return uses `fail()` (or an equivalent generic-message path); every
production log-injection site wraps user input with `_s()`; the central formatter escapes
CRLF as defense-in-depth; `cloud_providers.py` untouched; fresh scan closes the targeted
alerts.

### 43H — Workflow permissions + Dependabot torch disposition

Objective: close the 5 `actions/missing-workflow-permissions` alerts (F7) and dispose of the
2 torch Dependabot alerts (F8).

Files to touch: `.github/workflows/bmo-pi-pytest.yml`, `dnd-app-ci.yml`,
`dnd-app-validate-5e.yml`, `security-audit.yml` (and any new PHASE-42 workflow present at
execution time). Dependabot disposition is via API/UI (no file change unless a patch exists).

Steps:
1. Add a top-level least-privilege block to each of the four workflows (read-only CI):
   ```yaml
   permissions:
     contents: read
   ```
   Place it after `on:` and before `jobs:`. `security-audit.yml` has two jobs but a
   top-level block covers both; if either job needs more (none do — both are read-only audit
   jobs), scope per-job instead. **Do not touch `release.yml` (needs `contents: write`) or
   `deploy.yml` (already scoped).**
2. **Re-check torch for a patch** (`gh api .../dependabot/alerts/85 --jq
   '.security_advisory.vulnerabilities[].first_patched_version'`). If a patched release now
   exists, bump `torch==` in both `requirements.txt` and `requirements-ci.txt` (regenerate via
   the pinned `pip-compile --extra-index-url=https://download.pytorch.org/whl/cpu` command in
   each file's header) and let Dependabot auto-close. If still **no patch** (F8 state), dismiss
   both with reason:
   ```bash
   gh api -X PATCH repos/EvilPatrick06/home-lab/dependabot/alerts/85 \
     -f state=dismissed -f dismissed_reason=tolerable_risk \
     -f dismissed_comment="No patch released (range <=2.12.0, first_patched=None). Low sev (CVSS 5.3, local). BMO does not torch.jit.script untrusted input — VAD inference only."
   ```
   (Dependabot `dismissed_reason` ∈ {`fix_started`, `inaccurate`, `no_bandwidth`,
   `not_used`, `tolerable_risk`}. Use `tolerable_risk`.) Repeat for #84.
3. After advanced setup (43B) is active and a scan runs, confirm #1–#5 are closed.

Cheap check: `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ['.github/workflows/bmo-pi-pytest.yml','.github/workflows/dnd-app-ci.yml','.github/workflows/dnd-app-validate-5e.yml','.github/workflows/security-audit.yml']]; print('yaml ok')"`.

Acceptance: all four CI workflows carry a `permissions:` block; `release.yml`/`deploy.yml`
unchanged; torch alerts either bumped (if patch exists) or dismissed `tolerable_risk` with a
reachability comment.

## Research notes

- **Default → advanced setup is the only way to exclude paths.** GitHub default setup hides
  the workflow and exposes no `paths-ignore`; advanced setup commits a `codeql.yml` +
  optional `codeql-config.yml` and supports `paths-ignore` for interpreted languages without
  build (Python + JS/TS here, both `build-mode: none`). Having both default and advanced
  active produces duplicate runs, so disabling default setup in the UI is a required
  user-action. Sources:
  [Customizing advanced setup](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning),
  [config-file `paths-ignore` example](https://github.com/leftrightleft/example-code-scanning-workflows/blob/main/.github/workflows/codeql-python-exclude-tests.yml),
  [ignore files in CodeQL](https://josh-ops.com/posts/github-codeql-ignore-files/).
- **`paths-ignore` semantics:** it excludes files from *extraction/analysis* (the alerts
  disappear), unlike alert *dismissal* (the alert stays, marked resolved). For dead/test code
  we exclude; for real-but-accepted-risk (local-configured URLs, unpatched torch) we dismiss
  with a reason. Both are legitimate; the choice is per the owner's reachability test.
- **Dismissal API.** `PATCH /repos/{owner}/{repo}/code-scanning/alerts/{n}` with
  `state=dismissed`, `dismissed_reason ∈ {false positive, won't fix, used in tests}`,
  `dismissed_comment ≤ 280` chars. No batch endpoint — one PATCH per alert. Dependabot uses
  a different endpoint and reason vocabulary (`tolerable_risk`, `no_bandwidth`, `not_used`,
  `inaccurate`, `fix_started`). Sources:
  [Resolving code scanning alerts](https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts/resolving-code-scanning-alerts),
  [REST API for code scanning](https://docs.github.com/en/rest/code-scanning/code-scanning).
- **stack-trace-exposure fix** — log full traceback server-side, return a generic message
  (`"An internal error has occurred!"`). A shared `fail()` helper is the lowest-churn way and
  survives the PHASE-16 blueprint split. Source:
  [py/stack-trace-exposure](https://codeql.github.com/codeql-query-help/python/py-stack-trace-exposure/).
- **log-injection fix** — strip CR/LF (`\r`, `\n`) from user input before logging (CWE-117).
  CodeQL recognizes an inline `.replace('\r','').replace('\n','')` as a sanitizer; it does
  **not** credit a custom `logging.Formatter` (verified by community discussion), so the
  inline `_s()` wrapper is what closes the alerts — the formatter subclass is defense-in-depth
  only. The drop-in [`logging-formatter-anticrlf`](https://github.com/darrenpmeyer/logging-formatter-anticrlf)
  Formatter was considered for the global layer but rejected as the primary fix because it
  adds a dependency and won't close the alerts. Sources:
  [py/log-injection](https://codeql.github.com/codeql-query-help/python/py-log-injection/),
  [making CodeQL see a log sanitizer](https://github.com/github/codeql/discussions/10702).
- **path-injection fix** (if any prod py/path-injection survives the 43A refresh and is not
  PHASE-13's campaignId family) — normalize then verify containment with
  `os.path.commonpath([base, os.path.realpath(joined)]) == base`, or `pathlib`'s
  `resolve()` + `is_relative_to(base)`. `library_api.py` already does this ("path escapes the
  library root"). Source:
  [py/path-injection](https://codeql.github.com/codeql-query-help/python/py-path-injection/),
  [OpenStack path-handling guide](https://security.openstack.org/guidelines/dg_using-file-paths.html).
- **request-forgery for local-configured URLs** — dismissing is defensible because the URL
  base is a value the operator types into Settings; CodeQL flags any non-constant fetch URL.
  The owner directive explicitly permits dismissal here while requiring fixes for
  remote/peer/AI-influenced URLs. No upstream caveat — this is a policy call, documented per
  alert.
- **torch CVE-2025-3000** — CVSS 5.3 low, local-access, `torch.jit.script` on untrusted input;
  no patched release (`first_patched_version: None`, range `<= 2.12.0`). BMO runs Silero VAD
  inference only, never JIT-compiles user data, so unreachable. Dismiss `tolerable_risk` or
  monitor. Sources:
  [CVE-2025-3000 / NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-3000),
  [pytorch#149623](https://github.com/pytorch/pytorch/issues/149623).
- **Alternatives considered:** (a) staying on default setup + per-alert dismissing all 165
  noise alerts — rejected: 165 PATCH calls is brittle, and new noise re-appears on every
  scan; `paths-ignore` is durable. (b) Deleting `_archive/` outright — rejected: the owner
  reserves `_archive/` deletions for explicit confirmation (CLAUDE.md safety rule); excluding
  from scan is non-destructive. (c) Replacing `pickle` with a "safe" unpickler (`hmac`-signed
  pickle) — rejected: the data is already JSON; removing the capability is strictly safer than
  any signed-pickle scheme.

## Test plan

- **43B/43C/43H (workflow + config YAML):** parse-check each YAML
  (`python3 -c "import yaml; yaml.safe_load(open(f))"`); no unit tests (CI config).
- **43D (pickle deletion):** `ast.parse` both modules; `grep -rn 'pickle' bmo/pi/` empty.
  If `bmo/pi/tests/` has coverage for face/voice loading, update it to drop the `.pkl` case
  and assert JSON-only load. Pi-side → pytest runs in the end-of-phase gate.
- **43E (dnd-app fetch triage):** if any code changed, the affected `.test.ts` + targeted
  `tsc`. Dismissals are API-only (no test).
- **43F (importer sanitization):** new/extended colocated `.test.ts` in
  `import-dnd-beyond/` + `import-foundry` with nested-tag fixtures proving fixed-point strip;
  run those files with `npx vitest run <file>`.
- **43G (Flask helpers):** add `bmo/pi/tests/test_bmo_logging.py` asserting `_s()` strips
  `\r`/`\n` and `fail()` returns a generic message (no `str(e)` leakage). Pi-side → pytest in
  the gate.
- **End-of-phase 4-gate (rule 5):** from `dnd-app/` — `npm run lint`,
  `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`,
  `npx vitest run`. **Plus** `pytest bmo/pi/tests/` from `bmo/pi/` (this phase touches Pi
  Python in 43D + 43G). All must be green before the single phase commit + push.

## Acceptance criteria

- 43A re-ran: live alert total + per-rule + noise/prod counts recorded in `## Completed`;
  cross-ref status for PHASE-13/15/16 noted; a fresh CodeQL scan completed.
- CodeQL on **advanced setup** with a committed `codeql.yml` + `codeql-config.yml`; default
  setup disabled (user-action documented); `paths-ignore` lists only individually-confirmed
  non-production paths.
- Every noise candidate has a non-production justification or a promotion note; no production
  sink was excluded.
- **Zero `pickle.load` / `import pickle` anywhere in `bmo/pi/`** (`grep -rn 'pickle' bmo/pi/`
  empty); both modules parse and keep their JSON load/save paths.
- Every dnd-app fetch-family prod alert is fixed (code) or dismissed-with-a-specific
  per-alert reason (no blanket family dismissal).
- The 10 importer sanitization alerts are fixed with fixed-point strips + adversarial tests.
- Production stack-trace-exposure returns use a generic-message helper; production
  log-injection sites wrap user input in a CRLF sanitizer; `cloud_providers.py` untouched
  (PHASE-15 ownership respected).
- All four CI workflows carry a least-privilege `permissions:` block; `release.yml` /
  `deploy.yml` unchanged.
- torch Dependabot alerts bumped (if a patch exists at execution time) or dismissed
  `tolerable_risk` with a reachability comment.
- End-of-phase 4-gate (+ pytest) green; single commit + push; plan moved to `completed/`.

## Out of scope

- **`cloud_providers.py` curl command-injection criticals + fish_audio key-on-cmdline /
  `--fail`** — owned by **PHASE-15** (curl config-file helper). 43A verifies they close; 43G
  must not touch the file.
- **dnd-app `campaignId` path-injection (10 AI IPC handlers + `sanitizeCampaignId`
  extension)** — owned by **PHASE-13**. 43A verifies the fresh scan reflects PHASE-13's fix.
- **`app.py` blueprint refactor / AppState consolidation** — owned by **PHASE-16**. 43G
  hardens `app.py` error/log sites in place; it does not restructure the file.
- **Flask security headers (`flask-talisman` HSTS/CSP/etc.)** — owned by **PHASE-15** (its
  bullet) — not a CodeQL alert, so not triaged here.
- **The IDE "under construction" decision** (whether to ship/gate the IDE) — owned by
  **PHASE-15**. 43G only hardens the IDE routes' error/log leaks by reachability; it does not
  decide the IDE's product fate.
- **dungeon-scholar security round** (CSP, RLS, oracle endpoint, prod logging) — owned by
  **PHASE-18** (separate domain, not in this repo's CodeQL Python/JS-TS scan scope for
  bmo/dnd-app).

## Completed

> Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with a
> file:line citation and what landed. (Empty until execution.)
