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
