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

### [2026-06-24] DM bot loses all live session state on restart — only `campaign_memory` (NPCs/locations/threads) is persisted, not the active `DMSession`

- **Category:** future-idea (reliability + UX)
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of the Discord DM bot + DM engine

**Description:**
`DMSession` in `bots/discord_dm_bot.py` (class at ~line 343) holds the entire live state of a running D&D session purely in memory: the AI conversation history (`self.messages`, with `_compress_context` summarization), the initiative tracker (`initiative_order`, `initiative_round`, `initiative_collecting`), the `combat_log`, the active `players` set, and the voice-channel binding. None of it is serialized — `__init__` builds empty structures and `reset()` clears them. The only durable store is `services/campaign_memory.py` (sqlite: sessions, NPCs, locations, plot threads, notes) and the separate play-by-post `pbp_store.py`. So if `bmo-dm-bot.service` restarts mid-session — a deploy, an OOM kill, a crash, or a Pi reboot — the DM "forgets" everything about the in-progress encounter: whose turn it is, the round number, the combat log, and the running narration context. Players have to re-establish initiative and re-explain what just happened. This is not hypothetical on this host: BMO-RESOLVED documents a real boot-time clock-skew crash loop that took both bots down (2026-06-20), exactly the kind of mid-session restart that would wipe a live `DMSession`. The `Restart=on-failure` hardening that was added protects the *process*, but a restarted process comes back with a blank session.

**Hypothesis / root cause:** `DMSession` was designed as ephemeral runtime state; persistence work stopped at `campaign_memory` (long-term campaign facts) and `pbp_store` (async turn queue) and never extended to the live synchronous session.

**Proposed fix / improvement:**
- [ ] Serialize the recoverable parts of `DMSession` (messages/compressed-context, initiative_order + round, combat_log, players, text/voice channel IDs) to a small JSON or sqlite blob on each mutation (or on a short debounce), keyed by guild/channel.
- [ ] On `on_ready`/`setup_hook`, if a persisted session exists for the channel and is recent (e.g. < a few hours old), offer to resume it (a slash command like `/resume` or an auto-restore with a "recovered your session" notice) rather than starting blank.
- [ ] Exclude non-serializable live handles (`voice_client`, `synth_task`, the `asyncio.Queue`) — rebuild those on resume; persist only data.
- [ ] Reuse the existing eventId/dedup discipline from `agents/vtt_sync.py` so a resumed session does not double-push state to the VTT.

**Related files:** `bmo/pi/bots/discord_dm_bot.py:343` (`DMSession`), `bmo/pi/bots/discord_dm_bot.py` (`add_message`/`_compress_context`/`reset`), `bmo/pi/services/campaign_memory.py`, `bmo/pi/services/pbp_store.py`.

**Related entries:** BMO-RESOLVED 2026-06-20 (boot-time clock-skew crash loop took both Discord bots down) — the failure mode that makes this gap bite.

---

### [2026-06-24] Discord-bot health is process-level only (`systemctl is-active`) — no gateway-connection heartbeat, so a "zombie" bot (process up, gateway dropped / event loop stalled) is invisible and never restarted

- **Category:** future-idea (observability + reliability)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `services/monitoring.py` + the Discord bots + systemd units

**Description:**
`monitoring.py` watches the Discord bots via `_check_systemd_services()` over `_MONITORED_SERVICES = ["bmo", "docker", "bmo-dm-bot", "bmo-social-bot", "bmo-kiosk", "bmo-fan"]`, but the only signal it reads is `systemctl is-active`. That proves the *process* exists; it says nothing about whether the bot is actually connected to Discord's gateway. discord.py auto-reconnects from most gateway drops, but it does not cover a *stalled event loop* (a blocking call, a deadlocked synth/relay task) or a silent half-open connection — in those cases the process stays `active`, `Restart=on-failure` never fires (the process didn't exit), and monitoring reports green while the bot is functionally dead. There is no `WatchdogSec=`/`sd_notify` on any unit (`systemd/*.service` only set `Restart=`/`RestartSec=`), and neither bot surfaces `bot.latency` / `is_ready()` / `is_closed()` to the monitor or to the `dm_bot_control` plane. The recently-fixed swallow-and-exit-0 startup bug (BMO-RESOLVED 2026-06-20) closed the *crash* path; this is the complementary *liveness* path that crash-restart cannot catch.

**Hypothesis / root cause:** health monitoring was built around HTTP services and systemd unit state; the Discord bots have no HTTP surface, so they got the weakest available check (`is-active`) and no gateway-level liveness probe.

**Proposed fix / improvement:**
- [ ] Drive a systemd watchdog from each bot's event loop: set `WatchdogSec=` + `Type=notify` on `bmo-dm-bot.service` / `bmo-social-bot.service` and have a periodic asyncio task call `sd_notify("WATCHDOG=1")` only while `not bot.is_closed()` and `bot.is_ready()`. A stalled loop then misses the ping and systemd restarts the unit.
- [ ] Expose gateway health (`bot.latency` in ms, `is_ready`, last-heartbeat-ack age) over the existing `dm_bot_control` control plane (and an equivalent for the social bot), and have `monitoring.py` read it instead of relying solely on `is-active`.
- [ ] Optionally extend the voice-canary pattern (`bmo-voice-canary.timer`) to a lightweight Discord-relay canary that confirms an end-to-end round trip, not just process liveness.

**Related files:** `bmo/pi/services/monitoring.py:1139` (`_MONITORED_SERVICES`), `bmo/pi/services/monitoring.py` (`_check_systemd_services`), `bmo/pi/systemd/bmo-dm-bot.service`, `bmo/pi/systemd/bmo-social-bot.service`, `bmo/pi/bots/dm_bot_control.py`, `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/bots/social/bot.py`.

**Related entries:** BMO-RESOLVED 2026-06-20 (Discord bots swallowed startup exception + exited 0, defeating `Restart=on-failure`) — that closed the crash path; this covers the process-alive-but-disconnected path.

---

### [2026-06-24] VTT sync drops session events (rolls/messages/joins) when the VTT is offline longer than the bounded retry window — no persistent outbox / replay-on-reconnect

- **Category:** future-idea (reliability + UX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor
- **During:** read-only review of `agents/vtt_sync.py` (DM bot → VTT relay)

**Description:**
`agents/vtt_sync.py` pushes Discord-side session events to the VTT (`push_discord_message`, `push_discord_roll`, `push_player_join`, `push_player_leave`) via `_send_with_retry`, which does a bounded retry with backoff (3 retries → 4 attempts) on a daemon thread, with a stable `eventId` so the VTT can dedup. That is well-built for transient blips, but the retry budget is short (a few seconds total). If the VTT is down or unreachable for longer than that window — VTT app restart, host switching Wi-Fi, the laptop sleeping — the event is dropped silently and there is no persistent outbox to replay it once `/api/sync/health` reports the VTT back. For a live D&D relay, a dropped `push_discord_roll` means a player's `/roll d20` simply never lands in the VTT chat panel, with no indication to either side. The dedup/eventId machinery needed to make replay safe already exists; only the durable buffer + drain-on-reconnect is missing.

**Hypothesis / root cause:** the relay was designed as best-effort fire-and-forget with short retry; durability across a multi-minute VTT outage was out of scope at the time.

**Proposed fix / improvement:**
- [ ] On final retry exhaustion, append the event (with its existing `eventId`) to a small append-only outbox (JSON lines or sqlite) instead of dropping it.
- [ ] Add a periodic drainer that, when `GET /api/sync/health` is healthy again, replays queued events in order and relies on the VTT's existing eventId dedup; trim/expire entries older than a session-relevant TTL so stale rolls don't replay into a later session.
- [ ] Surface a lightweight "N events buffered, VTT offline" indicator (Discord status / control plane) so the table knows the relay is degraded rather than silently lossy.

**Related files:** `bmo/pi/agents/vtt_sync.py:131` (`_send_with_retry`), `bmo/pi/agents/vtt_sync.py` (`push_discord_message`/`push_discord_roll`/`push_player_join`/`push_player_leave`, `/api/sync/health` probe), `bmo/pi/bots/discord_dm_bot.py`.

---

### [2026-06-23] Router has no per-tier decision telemetry, and Tier-3 LLM classification is hard-commented-out rather than gated by `router.disable_tiers`

- **Category:** future-idea (observability + UX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor

**Description:**
`agents/router.py` resolves every message through Tier 1 (explicit `!prefix`) → Tier 2 (substring keyword scoring) → default `conversation`, but emits **no telemetry about which tier resolved a route or how often messages fall through to the catch-all**. The prior voice-latency metrics work (BMO-RESOLVED 2026-06-22, `/metrics` + `voice_metrics`) instruments stage *durations* including agent-routing *time*, but not routing *outcomes* — so a misroute (a smart-home or timer request that misses every keyword and silently lands in `conversation`) is invisible. There is already a process-lifetime counter facility (`services/metrics_counters.py`) feeding the hand-rolled Prometheus exposition in `routes/system_api.py:_prometheus_text`, so adding routing counters is cheap and fits the existing pattern. Two concrete gaps: (1) no counter like `bmo_router_tier_total{tier="prefix|keyword|default"}` to see the fall-through rate; (2) the Tier-3 LLM classifier is **commented out** at `agents/router.py:302-306`, yet the comment says "To re-enable: remove llm from `router.disable_tiers` in settings" — that setting does nothing because the call site is dead code, so the documented re-enable path is a no-op (config/code drift).

**Proposed fix / improvement:**
- [ ] Increment a `metrics_counters` counter in `route()` tagged by the tier that resolved (prefix / keyword / default), and export it via the existing `/metrics` endpoint; this surfaces the keyword-miss rate that would justify (or not) re-enabling Tier 3.
- [ ] Make Tier 3 actually honor `router.disable_tiers` — restore the gated call site so `disable_tiers` controls it, and consider enabling it **only for non-voice channels** (Discord text, IDE chat) where the 10-20 s LLM latency is acceptable but routing accuracy matters, keeping it off on the latency-critical voice path.
- [ ] Optionally log the chosen agent + tier at DEBUG for offline misroute analysis.

**Related files:** `bmo/pi/agents/router.py:269` (`route`), `bmo/pi/agents/router.py:297-306` (disabled Tier 3 + stale re-enable comment), `bmo/pi/services/metrics_counters.py`, `bmo/pi/routes/system_api.py:798` (`_prometheus_text`), `bmo/pi/services/voice/voice_metrics.py`.

---

### [2026-06-23] Social-bot decomposition stopped at the package move — `bots/social/bot.py` is still a 6,695-line / 261 KB god-module (per-game + music-UI extraction never done)

- **Category:** future-idea (architecture / DX)
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-suggestor

**Description:**
The "split the social-bot god-module" work (BMO-RESOLVED 2026-06-23, `248143ef`) is marked done, but it only created the `bots/social/` package, `git mv`d the file to `bots/social/bot.py`, and extracted **pure helper functions** into `bots/social/games_logic.py` (9 small functions: deck/hand math, fuzzy title match, time parsing). The two largest checklist items from that resolved entry were **not** completed: "extract each mini-game into `social/games/{trivia,wyr,rps,blackjack,hangman,wordle,connect4,poll}.py`" and "extract the music UI/queue into `social/music_ui.py`". As a result `bots/social/bot.py` is **still 6,695 lines / 261 KB — by far the largest source file in the bmo tree** (next is `app.py` at ~2,947), holding 17 top-level classes spanning three unrelated concerns in one module: the music subsystem (`MusicQueue` + its `VoiceListenerSink`, `VolumeSelect`, `PageButton`, `MusicControlView` — lines 244-808), the `SocialBot(commands.Bot)` core (~2,830 lines, 810-3639), and 8 self-contained mini-games each with its own View/Modal (`TriviaButton`/`TriviaView`, `WYRView`, `RPSView`, `BlackjackView`, `HangmanGuessModal`/`HangmanView`, `WordleGuessModal`/`WordleView`, `Connect4View`, `PollView`/`PollButton` — lines 3640-6480). The games and music UI couple to the bot core only via command registration, so the bulk of the file is still hard to navigate, review, and test in isolation. The seams (`games_logic.py`, `social_bot_utils.py`, `social_youtube.py`) already exist — only the View/Modal classes themselves remain unmoved.

**Proposed fix / improvement:**
- [ ] Finish the planned extraction: move each mini-game's View/Modal into `bots/social/games/<game>.py`, registered via a small `games/__init__.py` loader called at bot startup; the pure logic already lives in `games_logic.py` next door.
- [ ] Extract `MusicQueue` + the music Views into `bots/social/music_ui.py`.
- [ ] Keep `bots/social/bot.py` as the bot core + the existing `bots/discord_social_bot.py` shim so the systemd `python -m bots.discord_social_bot` entry point stays unchanged.
- [ ] Behavior-identical reorg; the existing `test_social_bot_import.py` (asserts 50+ commands register) guards against accidental command-loss during the move.

**Related files:** `bmo/pi/bots/social/bot.py` (244-6480), `bmo/pi/bots/social/games_logic.py`, `bmo/pi/bots/social/__init__.py`, `bmo/pi/bots/discord_social_bot.py` (shim), `bmo/pi/tests/test_social_bot_import.py`.

---

### [2026-06-23] Routine automation engine ships with no starter/example routines — a powerful feature most users never discover

- **Category:** future-idea (UX / quality-of-life)
- **Severity:** low
- **Domain:** bmo

**Discovered by:** bmo-suggestor

**Description:**
`services/routine_service.py` is a capable automation engine — it chains actions (commands, speech, delays) off voice-phrase, cron-schedule, or system-event triggers, persisted to `data/routines.json` — and `agents/routine_agent.py` exposes create/list/trigger/enable/disable/delete via voice and chat. But the feature is **entirely empty on a fresh install**: `data/routines.json` starts blank, nothing is shipped, and BMO never volunteers that the capability exists, so a user has to already know to say "create a routine" and then hand-author triggers/actions by voice with no template to copy. High-value, obviously-useful automations the existing primitives already support — a spoken **morning briefing** (calendar + weather + last session recap on a weekday cron), a **"good night"** routine (lights off, music stop, alarms armed), a **"leaving home"** routine (TV/Chromecast off, lights off) — are all buildable today but invisible. This is a discoverability/QoL gap, not a missing capability.

**Proposed fix / improvement:**
- [ ] Ship a small library of disabled-by-default **example routines** (e.g. `data/routines.example.json` or seeded on first boot) covering morning-briefing / good-night / leaving-home, so users have working templates to enable or clone.
- [ ] Have `routine_agent` surface a "you have no routines yet — want me to set up a morning briefing?" nudge on first list, and document the example set in `docs/SERVICES.md`.
- [ ] Optional: a compose-a-briefing helper that wires `calendar_agent` + `weather_agent` + `session_recap_agent` into one spoken routine action, demonstrating cross-agent chaining.

**Related files:** `bmo/pi/services/routine_service.py`, `bmo/pi/agents/routine_agent.py`, `bmo/pi/data/routines.json`, `bmo/pi/docs/SERVICES.md` (`../docs/SERVICES.md`), `bmo/pi/agents/{calendar_agent,weather_agent,session_recap_agent}.py`.

---

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
