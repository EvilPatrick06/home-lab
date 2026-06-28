# BMO Issues Log

> **Active BMO bugs / tech debt / broken config / perf — domain-scoped to the Pi voice assistant + DM engine + Discord bots (`bmo/`).** Includes Pi-side infra/tooling that BMO depends on (the venv, pip caches, Pi systemd, etc.) since this is the Pi's primary domain.
>
> Sibling logs:
>
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - BMO future ideas / design gotchas / observations → `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`
> - Security concerns (any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule (BMO-domain entries):** Bug / debt / config / perf issues whose **Domain: bmo** (or Pi-side infra/tooling) → here. dnd-app entries → `ISSUES-LOG-DNDAPP.md`. `Domain: both` → mirror in both issue logs (small duplication is fine; one fix removes both). Security (any domain) → `SECURITY-LOG.md`. Design-gotcha / future-idea / info → `BMO-SUGGESTIONS-LOG.md`.

New entries go at the TOP of their severity section (newest first within each section).

**Process (read this):** This log is the **deferred** backlog, not a duplicate of every commit. Per `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`: if a bug is fixed in the same session / PR, we **do not** add a new entry here (the commit + moved archive entry are the record). That can make it look like the log "stopped" — it did not; it only tracks **outstanding** work. When an item is done, it moves to `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)` and is removed from here.

---

# Active BMO Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new BMO items below as they appear.

## Critical

*(none currently logged)*

## High

### [2026-06-28] discord_dm_bot.py hardcodes read-only dev-tree data paths (same trap that broke the social bot deploy)

- **Reported by:** ci-failure-triage (automated)
- **Category:** bug / latent
- **Severity:** high (will fail at runtime under the deploy-isolation sandbox)
- **Domain:** bmo
- **Context:** found while fix-forwarding bmo/deploy run 28334130910 (social bot crash)

**Description:**
The deploy-isolation hardening runs the bots from `~/home-lab-deploy` with `ProtectHome=read-only` and only `ReadWritePaths=~/home-lab-deploy/bmo/pi/data` writable. `bmo/pi/bots/social/bot.py` was fixed this cycle (commit 655a930f) to resolve its data dir relative to the module. But `bmo/pi/bots/discord_dm_bot.py` still hardcodes the dev-tree path in two spots:
- line 346: `_DM_STATE_PATH = os.path.expanduser("~/home-lab/bmo/pi/data/dm_session_state.json")`
- line 847: `rag_dir = os.path.expanduser("~/home-lab/bmo/pi/data/rag_data")`
(line 133 `DATA_DIR = Path.home() / "bmo" / "data" / "5e"` also points outside the deploy checkout.)
These are not executed at import time, so the service starts and deploy passes — but the first write to `_DM_STATE_PATH` (or a RAG read expecting the deploy tree) hits `OSError: Read-only file system` / wrong path at runtime.

**Fix needed:**
Resolve these paths relative to the module (mirror the social-bot fix: `Path(__file__).resolve().parents[2] / "data"`) or to the writable deploy data dir, so DM session state + RAG live under `~/home-lab-deploy/bmo/pi/data`. Verify against the systemd `ReadWritePaths` for bmo-dm-bot. Owner: bmo-resolver.

*(none currently logged)*

## Medium

*(none currently logged)*

## Low
