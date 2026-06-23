# BMO Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — BMO-domain only.**
>
> Sibling logs:
>
> - dnd-app suggestions → `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`
> - BMO active bugs / debt → `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - Security concerns (global, any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule:** `Domain: bmo` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to BMO behavior → mirrored here AND in `SUGGESTIONS-LOG-DNDAPP.md` where cross-tooling rules touch dnd-app too.

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-23] Split the 6.8k-line `bots/discord_social_bot.py` god-module into a `bots/social/` subpackage

- **Category:** debt
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (file-size + structure sweep)

**Description:**
`bmo/pi/bots/discord_social_bot.py` is **6,823 lines** — by far the largest file in the bmo tree (next is `app.py` at 2,831). It bundles ~17 top-level classes spanning unrelated concerns in one module: the music subsystem (`MusicQueue`, `VolumeSelect`, `PageButton`, `MusicControlView`), the `SocialBot(commands.Bot)` core (~2,800 lines on its own, lines 806-3651), and a large pile of self-contained mini-games each with its own View/Modal (`TriviaButton`/`TriviaView`, `WYRView`, `RPSView`, `BlackjackView`, `HangmanGuessModal`/`HangmanView`, `WordleGuessModal`/`WordleView`, `Connect4View`, `PollView`/`PollButton`). The games and the music UI have little coupling to the bot core beyond command registration, so the file is hard to navigate, review, and test in isolation.

**Hypothesis / root cause:** organic accretion — every new game/feature was appended to the single bot module instead of getting its own file.

**Proposed fix / improvement:**
- [ ] Create `bmo/pi/bots/social/` subpackage; move the bot core to `social/bot.py`.
- [ ] Extract each mini-game into `bmo/pi/bots/social/games/{trivia,wyr,rps,blackjack,hangman,wordle,connect4,poll}.py`, registered via a small `games/__init__.py` loader the bot calls at startup.
- [ ] Extract the music UI/queue into `social/music_ui.py`.
- [ ] Keep `bots/discord_social_bot.py` as a thin shim importing `social.bot` so the systemd `python -m bots.discord_social_bot` entry point and `bmo-social-bot.service` stay unchanged.

**Blocked by:** none (mechanical refactor; gated by existing bot tests + CI).

**Related files:** `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/bots/social_bot_utils.py`, `bmo/pi/kiosk/bmo-social-bot.service`, `bmo/pi/tests/test_dm_bot_control.py`

---

### [2026-06-23] Rename `bmo/pi/kiosk/` to `bmo/pi/systemd/` — the dir holds ALL units, not just the kiosk

- **Category:** debt, docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (systemd unit-location sweep)

**Description:**
`bmo/pi/kiosk/` is the single source of truth for **every** systemd unit in the project — 10 `.service` files + 2 `.timer` files (`bmo.service`, `bmo-fan.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`, `bmo-backup.service`/`.timer`, `bmo-voice-canary.service`/`.timer`, `bmo-ide.service`, plus `bmo-kiosk.service`) — yet only `bmo-kiosk.service` is actually kiosk-related. The directory name undersells its role and is misleading: a contributor looking for the main `bmo.service` definition would not think to open `kiosk/`. It also holds `install-kiosk.sh` and `logrotate.d-bmo-bots.example`, which are likewise not kiosk-specific.

**Hypothesis / root cause:** the dir started life holding only the kiosk unit, then became the consolidation point for all units (per the 2026-06-22 single-source consolidation) without a rename.

**Proposed fix / improvement:**
- [ ] `git mv bmo/pi/kiosk bmo/pi/systemd` (or `bmo/pi/units`).
- [ ] Update the ~9 references: `bmo/setup-bmo.sh` (~lines 221-227 unit-copy loop), `bmo/docs/SYSTEMD.md` (rows + lines 72/106/112/235), `bmo/docs/ARCHITECTURE.md` (~173), `bmo/docs/TROUBLESHOOTING.md` (~217), `bmo/README.md` tree.
- [ ] Keep `install-kiosk.sh` name (it does install the kiosk) but note in `SYSTEMD.md` that units now live under `systemd/`.

**Blocked by:** none. Low blast radius — all references are greppable string paths, no Python imports involved.

**Related files:** `bmo/pi/kiosk/` (whole dir), `bmo/setup-bmo.sh`, `bmo/docs/SYSTEMD.md`, `bmo/docs/ARCHITECTURE.md`, `bmo/docs/TROUBLESHOOTING.md`, `bmo/README.md`

**Related entries:** see the `bots/`-not-`discord/` design-gotcha in `bmo/docs/DESIGN-CONSTRAINTS.md` — same "name no longer matches contents" smell, opposite conclusion (kiosk SHOULD rename; bots/ must NOT because it shadows `discord.py`).

---

### [2026-06-23] `bmo/docs/ARCHITECTURE.md` (~line 173) wrongly says systemd units live in `ide_app/`

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (doc-vs-tree cross-check)

**Description:**
The Deployment section states: "Systemd unit definitions live in `bmo/pi/kiosk/` and `bmo/pi/ide_app/`." This is inaccurate — there are **zero** unit files under `bmo/pi/ide_app/`; all 10 services + 2 timers (including `bmo-ide.service`) live in `bmo/pi/kiosk/`. `bmo/docs/DESIGN-CONSTRAINTS.md` even correctly notes that the `ide_app` `bmo-ide.service` unit file lives in `kiosk/`. The stale clause would send a contributor to the wrong directory looking for the experimental IDE unit.

**Hypothesis / root cause:** doc drift — `ide_app/` may once have carried its own unit before the 2026-06-22 unit consolidation into `kiosk/`.

**Proposed fix / improvement:**
- [ ] Edit line ~173 to read "Systemd unit definitions live in `bmo/pi/kiosk/`." (drop the `ide_app/` clause). If renaming per the kiosk-to-systemd suggestion above, update to `bmo/pi/systemd/` in the same edit.

**Related files:** `bmo/docs/ARCHITECTURE.md` (~173), `bmo/pi/kiosk/`, `bmo/pi/ide_app/`

---

### [2026-06-23] `bmo/docs/AGENTS.md` opening line ("5 specialized AI agents") contradicts the "28 registered" line below it

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (doc accuracy sweep)

**Description:**
The first body line of `bmo/docs/AGENTS.md` reads "5 specialized AI agents, each owning one capability." The very next paragraph says "The registered/routable count is 28." The repo has ~40 modules in `bmo/pi/agents/`. The "5" is a stale headline from an earlier era of the agent system and now directly contradicts the rest of its own document.

**Hypothesis / root cause:** the headline number was never updated as agents were added (5 to 28 routable).

**Proposed fix / improvement:**
- [ ] Change the opening line to match: e.g. "A set of specialized AI agents (28 routable), each owning one capability." Or drop the count from the headline and let the per-section counts ("Core infrastructure (12)", etc.) be authoritative.
- [ ] While there, sanity-check the section counts against the actual `create_*_agent()` calls in `agent.py` + `agents/_registry.py`.

**Related files:** `bmo/docs/AGENTS.md`, `bmo/pi/agent.py`, `bmo/pi/agents/_registry.py`

---

### [2026-06-23] Group the 9 voice/audio service modules into a `services/voice/` subpackage

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (services/ cohesion review)

**Description:**
`bmo/pi/services/` is a flat directory of ~47 modules. Nine of them form a clear voice/audio cluster — `audio_output_service.py`, `bmo_say.py`, `discord_tts.py`, `system_audio.py`, `voice_canary.py`, `voice_casting.py`, `voice_metrics.py`, `voice_personality.py`, `voice_pipeline.py` (the last is the 2,232-line core). They are scattered alphabetically among calendar/music/game/list services, so the audio stack is hard to see as a unit. A `services/voice/` (or `services/audio/`) subpackage would make the boundary explicit and shrink the top-level listing.

**Hypothesis / root cause:** flat `services/` namespace never sub-grouped as the module count grew.

**Proposed fix / improvement:**
- [ ] Create `bmo/pi/services/voice/` and `git mv` the nine modules in, with a re-exporting `voice/__init__.py`.
- [ ] Update importers (`from services.voice_pipeline import ...` to `from services.voice import ...`), gated by CI/pytest.
- [ ] **Keep the existing module file names** per the "Service module names" rule in `bmo/docs/DESIGN-CONSTRAINTS.md` (avoid stdlib-shadowing renames during the move).

**Blocked by:** broader-than-trivial import churn — larger than the other items here; defer unless touching this area anyway.

**Related files:** `bmo/pi/services/voice_pipeline.py`, `bmo/pi/services/bmo_say.py`, `bmo/pi/services/discord_tts.py`, `bmo/pi/services/audio_output_service.py`, `bmo/pi/services/system_audio.py`, `bmo/pi/services/voice_canary.py`, `bmo/pi/services/voice_casting.py`, `bmo/pi/services/voice_metrics.py`, `bmo/pi/services/voice_personality.py`

**Related entries:** "Service module names" design-gotcha in `bmo/docs/DESIGN-CONSTRAINTS.md` (the stdlib-collision caveat applies to any renames done during the move).

---

### [2026-06-23] Add a `bmo/docs/README.md` index for the 9 docs in `bmo/docs/`

- **Category:** docs, future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** automated bmo cleanup/reorg scan (docs/ navigability review)

**Description:**
`bmo/docs/` holds 9 reference docs (`AGENTS.md`, `ARCHITECTURE.md`, `CLOUDFLARE_TUNNEL_SETUP.md`, `DEPLOY.md`, `DESIGN-CONSTRAINTS.md`, `NETWORK_ACCESS.md`, `SERVICES.md`, `SYSTEMD.md`, `TROUBLESHOOTING.md`) but no index/landing page. A new contributor has to open files blind to learn which covers what. A one-screen `README.md` with a one-line description + link per doc (and a pointer to the repo-root `docs/` logs) would make the set discoverable.

**Hypothesis / root cause:** docs accreted individually; no index was ever added.

**Proposed fix / improvement:**
- [ ] Add `bmo/docs/README.md` listing each doc with a one-line purpose and a link, plus a short "start here" pointer (ARCHITECTURE to SERVICES to SYSTEMD to TROUBLESHOOTING).
- [ ] Link to it from `bmo/README.md`.

**Related files:** `bmo/docs/` (all), `bmo/README.md`
### [2026-06-23] Export health + voice metrics in Prometheus format with a lightweight historical store

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (observability surface)

**Description:**
Observability today is point-in-time + push-only: `services/voice_metrics.py` keeps a bounded in-memory ring (200 samples/stage) exposed as a JSON snapshot at `GET /api/metrics/voice`, and `services/monitoring.py` evaluates health every 60s and pushes Discord/SocketIO/OLED alerts. There is no `/metrics` Prometheus endpoint and no time-series persistence, so trends (CPU-temp creep, voice p95 latency drift across a week, under-voltage frequency, fallback-to-Ollama rate) are invisible — every restart resets the rings and only the current moment is queryable.

**Proposed fix / improvement:**
- [ ] Add a `prometheus_client`-format `/metrics` endpoint (or hand-rolled text exposition) surfacing the existing voice-stage aggregates, monitoring service up/down gauges, Pi stats (temp/CPU/RAM/disk), and counters for LLM fallback / STT-TTS fallback.
- [ ] Pair with a tiny on-Pi scraper+store (VictoriaMetrics single-binary or Prometheus in the existing docker-compose, modest retention) and a couple of Grafana panels, or a static history file the Web UI charts.
- [ ] Keep recording cheap and non-raising (same discipline as `voice_metrics.record_stage`).

**Blocked by:** none. Mind the Pi's disk budget (baseline ~83% used) — pick a low-retention store.

**Related files:** `bmo/pi/services/voice_metrics.py`, `bmo/pi/routes/system_api.py` (`/api/metrics/voice`), `bmo/pi/services/monitoring.py`, `bmo/pi/docker-compose.yml`

---

### [2026-06-23] Add `.env.example` + fail-fast startup config preflight (degraded-mode banner)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (setup/reliability)

**Description:**
There is no `.env.example` (nor any `*.example`) in `bmo/pi/`, and `app.py` has no required-env/config preflight — the only "preflight" match in `app.py` is the CORS OPTIONS handler. The set of required secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`, `FISH_AUDIO_API_KEY`, `ANTHROPIC_API_KEY`, `OPENWEATHER_API_KEY`, `DISCORD_WEBHOOK_URL`, the Calendar OAuth token, etc.) is only discoverable by reading code, and a missing/typo'd key surfaces lazily at first use (a failed voice turn or a 500) rather than at boot. Two pain points: (1) standing up a fresh Pi is trial-and-error; (2) a degraded deploy is hard to diagnose because nothing reports "running without TTS — FISH_AUDIO_API_KEY unset, will use Piper".

**Proposed fix / improvement:**
- [ ] Commit a `.env.example` enumerating every consumed env var with a one-line comment and a placeholder value (no real secrets).
- [ ] Add a startup preflight that classifies each key as required/optional, logs a single concise summary at boot ("✅ 6/7 providers configured; ⚠️ degraded: TTS→local Piper"), and either hard-fails on a truly required-missing key or surfaces the degraded set on `/api/health/full`.
- [ ] Optionally generate the `.env.example` from the preflight's key registry so the two never drift.

**Blocked by:** none.

**Related files:** `bmo/pi/app.py`, `bmo/pi/services/cloud_providers.py`, `bmo/pi/services/voice_pipeline.py`, `bmo/pi/routes/system_api.py` (`/api/health/full`), `bmo/docs/ARCHITECTURE.md` (Cloud APIs table)

---

### [2026-06-23] Split monolithic `discord_social_bot.py` into discord.py cogs and add direct test coverage

- **Category:** future-idea
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (DX / maintainability)

**Description:**
`bmo/pi/bots/discord_social_bot.py` is the single largest source file in the tree at ~6,823 lines with ~264 top-level `class`/`def`/`async def` definitions, and it has no direct unit test (no test module imports `discord_social_bot`; the sibling DM bot at least has `tests/test_dm_bot_control.py`). A 6.8k-line god-module is hard to navigate, slow to load mentally, and risky to change — and being untested means regressions in music/games/trivia features ship silently. discord.py's Cog system exists precisely for this.

**Proposed fix / improvement:**
- [ ] Carve the bot into Cogs by feature area (music, trivia/games, moderation/util, TTS) under `bmo/pi/bots/social/cogs/`, leaving a thin loader.
- [ ] Add unit tests around the pure-logic pieces (command parsing, trivia scoring, queue management) with the discord client mocked, mirroring `test_dm_bot_control.py`.
- [ ] Do it incrementally (one cog per PR) so each step stays green under the existing CI gate.

**Blocked by:** none. Watch the package-naming gotcha in `DESIGN-CONSTRAINTS.md` (keep `bots/`; never create a `discord/` package that shadows `discord.py`).

**Related files:** `bmo/pi/bots/discord_social_bot.py`, `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/tests/test_dm_bot_control.py`

---

### [2026-06-23] Rotate the cron health-check log (`logs/health.log`) — app logs rotate, this one does not

- **Category:** future-idea
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (reliability / disk hygiene)

**Description:**
Application logging already rotates (`services/bmo_logging.py` uses `RotatingFileHandler`, 10 MB × 5). But the separate cron health check appends to `logs/health.log` via shell redirection (`*/5 * * * * .../scripts/health-check.sh >> .../logs/health.log 2>&1`, per `ARCHITECTURE.md`) with no `logrotate.d` entry for bmo and no rotation in the script itself. Every 5 minutes, forever, append-only — unbounded growth on a Pi whose baseline disk usage is already ~83%. Low probability of acute harm, but it is exactly the kind of slow leak that eventually trips the "Disk full" troubleshooting path.

**Proposed fix / improvement:**
- [ ] Add an `/etc/logrotate.d/bmo` entry (or have `setup-bmo.sh` install one) covering `logs/health.log` with weekly rotation + a small `rotate N` + `compress`.
- [ ] Alternatively have `health-check.sh` self-truncate/rotate, or pipe through `logger` to journald (which is already size-managed).

**Blocked by:** none.

**Related files:** `bmo/pi/scripts/health-check.sh`, `bmo/pi/services/bmo_logging.py`, `bmo/setup-bmo.sh`, `bmo/docs/ARCHITECTURE.md` (Scheduled Tasks / cron)

---

### [2026-06-23] Document + periodically verify a full bare-metal disaster-recovery restore

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** scheduled improvement scan of the bmo/ tree (portability / DR)

**Description:**
The backup story is one-directional and unverified end-to-end. `backup.sh` pushes `data/` + `config/` + `requirements.txt` to Google Drive nightly, and `setup-bmo.sh` rebuilds system deps/systemd/docker — but there is no single tested "stand BMO up on a fresh Pi from a cold backup" runbook, and no automated check that the gdrive backup is actually restorable. The only restore-named test, `tests/test_music_restore.py`, covers an in-app music-state feature, not the gdrive backup. So the recovery path (fresh Pi → run setup → `rclone sync` data/config back → re-auth calendar) is documented in fragments across `ARCHITECTURE.md`/`DEPLOY.md` and has, as far as the tree shows, never been exercised. A silently-corrupt or partial backup would only be discovered during a real outage.

**Proposed fix / improvement:**
- [ ] Write one consolidated DR runbook: fresh-Pi → `setup-bmo.sh` → restore data/config → calendar re-auth → health-check pass, with expected outputs.
- [ ] Add a lightweight monthly backup-integrity job: pull the latest gdrive backup into a temp dir, assert key files exist + parse (e.g. `alarms.json`, `recent_chat.json`, `config/token.json` shape) and a manifest checksum matches, alert via the existing Discord webhook on mismatch.
- [ ] Optionally snapshot the installed dep set so a restore reproduces a known-good environment, not just `requirements.txt`.

**Blocked by:** none.

**Related files:** `bmo/pi/backup.sh`, `bmo/setup-bmo.sh`, `bmo/docs/ARCHITECTURE.md` (Backup Strategy), `bmo/docs/DEPLOY.md`


---

---

---

---

---

---

---

---

---

---

---

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
