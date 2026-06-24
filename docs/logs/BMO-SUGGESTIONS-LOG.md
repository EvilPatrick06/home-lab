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
