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

### [2026-06-28] ide_app.py startup-banner print() trips bmo print() ratchet on auto/bmo-resolver

- **Reported by:** ci-failure-triage (automated)
- **Category:** ci / lint (print ratchet)
- **Severity:** high (branch CI red; blocks bmo-resolver integration)
- **Domain:** bmo
- **Failing run:** 28338228795 (2026-06-28T22:32Z) — job `bmo print() ratchet`, step `bash bmo/pi/scripts/check-no-new-prints.sh`, exit 1 (production print() count=164 baseline=163 → 1 new). Paired `dnd-app CI` run 28338228779 on the same push was a benign concurrency-cancel (ignored).
- **Branch / commit:** `auto/bmo-resolver` @ 363c8cef ("docs(logs): archive social-bot god-module split (#12) — now resolved")

**Root cause:**
The commit adds one `print()` at `bmo/pi/ide_app/ide_app.py:798`: a startup banner `print(f'... BMO IDE Test App starting on {_host}:{_port} ...')` (confirmed via `git diff origin/master 363c8cef -- *ide_app.py`). Count 163 → 164.

**Fix needed:**
Replace the startup-banner `print()` with `services.bmo_logging.get_logger(__name__).info(...)`, then re-run the ratchet. Owner: bmo-resolver / bmo domain.

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
