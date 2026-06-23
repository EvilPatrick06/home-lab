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
