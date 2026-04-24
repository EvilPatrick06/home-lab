# Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations.**
> Sibling logs:
> - Active bugs / debt → [`ISSUES-LOG.md`](./ISSUES-LOG.md)
> - Security concerns → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved entries → [`RESOLVED-ISSUES.md`](./RESOLVED-ISSUES.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

New entries go at the TOP of their section (newest first).

---

# Future ideas

*(no non-security future-ideas currently logged — security improvements live in [`SECURITY-LOG.md`](./SECURITY-LOG.md))*

---

# Design gotchas (warnings for future agents)

### [2026-04-23] DO NOT leave task-list items as `pending` / `in_progress` at session end

- **Category:** design-gotcha, docs
- **Severity:** medium
- **Domain:** tooling

**Why it's tempting:** Once you're deep in execution, updating `TodoWrite` state feels like bookkeeping overhead — "I'll flip them all in the wrap-up message." Or you use `merge: true` and forget that drifted IDs from earlier calls are still accumulating in Cursor's aggregate view.

**Why it's wrong:** Cursor's UI counts status literally. A session that actually finished 43 of 43 tasks but only flipped 24 IDs to `completed` displays as "25/43 completed" — the user can't tell whether 18 tasks were genuinely skipped or just unrecorded. Observed in transcript `39e39f59-584b-4ec9-bbfe-1e1747217aa9` (the DnD→home-lab reorg): 17 items ended `pending`, 2 ended `in_progress`, despite the final summary + commit log showing the work was done (commits `030be55`, `c8909c5`, `6b2fc53`, `a234242` prove it).

**What to do instead:** Follow the Task List Discipline section in `AGENTS.md`. Key points:
- Flip status immediately when a task finishes (don't batch).
- Only ONE `in_progress` at a time.
- Before the final summary, walk every non-`completed` ID and reconcile it: mark `completed` (with evidence), `cancelled` (with reason), or flag as genuine user follow-up.
- When splitting a parent task into sub-phases, mark the parent `cancelled` with "split into Xa-Xf" — don't leave it `pending` alongside its children.

**Related entries:** Noted in session `[Cursor project dir cleanup](11f4ff15-afbc-46ab-aa3e-56a4645775ad)` while cleaning up the old `home-patrick-DnD/` Cursor project dir and investigating the 25/43 count.

**Related files:** `AGENTS.md` (§ Task List Discipline)

---

### [2026-04-23] DO NOT rename `bmo/pi/bots/` to `discord/`

- **Category:** design-gotcha
- **Severity:** high

**Why it's tempting:** Looks inconsistent — `services/`, `hardware/`, `bots/` → some might want to rename to `discord/` to match bot purpose.

**Why it's wrong:** Python imports from `discord.py` library use `import discord`. A local `discord/` subpackage (with `__init__.py`) SHADOWS the library — all Discord bot imports break with `ImportError`.

**What to do instead:** Keep `bots/`. Document purpose clearly in README. If you hate the name, "`discord_bots/`" is also safe.

---

### [2026-04-23] DO NOT rename `services/calendar_service.py` to `services/calendar.py`

- **Category:** design-gotcha
- **Severity:** medium

**Why it's tempting:** `_service` suffix feels redundant when inside `services/`.

**Why it's wrong:** Python stdlib has a `calendar` module. If any part of BMO does `import calendar` (stdlib use), having `services/calendar.py` creates ambiguity depending on sys.path. Even with subpackage disambiguation, it's fragile.

**What to do instead:** Keep the `_service` suffix. Same applies to `list_service.py` (builtin `list`), and avoid renaming to any stdlib module name.

---

### [2026-04-23] DO NOT restructure `dnd-app/src/{main,preload,renderer,shared}/`

- **Category:** design-gotcha
- **Severity:** high

**Why it's tempting:** Internal layout inside each process can be improved (feature-based grouping within `renderer/src/components/`, etc.). That's fine. But the TOP-LEVEL `src/main`, `src/preload`, `src/renderer`, `src/shared` — tempting to merge, split, or rename.

**Why it's wrong:** `electron-vite` (the build tool) hardcodes these directory names. Renaming = instant build breakage.

**What to do instead:** Keep the 4 top-level subdirs. Reorganize FREELY inside each of them.

---

# Info / Observations

### [2026-04-23] 5 game-data JSONs byte-identical between `dnd-app/` and `bmo/pi/data/5e/`

- **Category:** design-gotcha, docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** Claude Opus
- **During:** workspace duplicate-hash pass

**Description:** The following 5 files have identical SHA-256 between the two domains:

| dnd-app path | bmo/pi path |
|---|---|
| `public/data/5e/hazards/conditions.json` | `data/5e/conditions.json` |
| `public/data/5e/encounters/encounter-presets.json` | `data/5e/encounter-presets.json` |
| `public/data/5e/encounters/random-tables.json` | `data/5e/random-tables.json` |
| `public/data/5e/equipment/magic-items.json` | `data/5e/magic-items.json` |
| `public/data/5e/world/treasure-tables.json` | `data/5e/treasure-tables.json` |

**Why useful to future agents:** This is almost certainly intentional per the "each domain owns its own storage" pattern (see sibling Info entry on data ownership) — the VTT ships the data to the renderer, BMO ships the same data to the DM agent. But if one side changes, the other will silently go stale. Two options: (a) keep the duplicate and document that a **sync script is required** when any of these 5 files changes, or (b) promote to a shared asset directory and have both domains read from one source.

**Related files:** listed above, plus `docs/DATA-FLOW.md` (candidate for a note), `dnd-app/tools/build-index.*` (likely generator if one exists)

---

### [2026-04-23] Data ownership pattern: dnd-app vs bmo

- **Category:** design-gotcha, docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** Claude Opus
- **During:** DATA-FLOW.md drafting

**Description:** Each domain owns its own storage. dnd-app writes to `%APPDATA%/dnd-vtt/` (per-user, per-install). bmo writes to `/home/patrick/home-lab/bmo/pi/data/` (shared, on Pi). No cross-domain filesystem access — they communicate via HTTP only.

**Why useful to future agents:** If adding a feature that "needs data from the other side" — DON'T reach across filesystem. Add HTTP endpoint + use `bmo-bridge.ts` or `vtt_sync.py`.

**Related files:** `docs/DATA-FLOW.md`, `dnd-app/src/main/bmo-bridge.ts`, `bmo/pi/agents/vtt_sync.py`
