# BMO Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — BMO-domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved BMO entries → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: bmo` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to BMO behavior → mirrored here AND in `SUGGESTIONS-LOG-DNDAPP.md`. Cross-tooling rules that touch BMO contributors → here (and mirror in dnd-app file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

*(none currently logged)*

---

# Design gotchas (warnings for future agents)

### [2026-04-23] DO NOT leave task-list items as `pending` / `in_progress` at session end

- **Category:** design-gotcha, docs
- **Severity:** medium
- **Domain:** tooling *(applies to any AI session — mirrored in [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md))*

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

### [2026-04-24] DO NOT remove `shell=True` from `agents/hooks.py:_run_hook_command` — user-supplied hook commands are shell strings by design

- **Category:** design-gotcha, security
- **Severity:** medium
- **Domain:** bmo

**Why it's tempting:** `agents/hooks.py:54` does `subprocess.run(command, shell=True, input=json.dumps(stdin_data), ...)`. bandit and ruff both flag B602/S602 here as "subprocess call with shell=True identified, security issue." Knee-jerk fix: replace with `subprocess.run(shlex.split(command), shell=False, ...)` to silence the warning.

**Why it's wrong:** The hook commands are user-configured pre/post-tool-use commands defined in `mcp_servers/mcp_settings.json`'s `hooks.preToolUse` / `hooks.postToolUse` blocks. They're SHELL STRINGS by design — users write things like `cat /tmp/audit.log | grep $TOOL_NAME && notify-send "..."`. Splitting them with `shlex.split` would break:
- Any pipeline (`|`, `&&`, `;`)
- Any redirect (`>`, `<`, `2>&1`)
- Any variable expansion (`$VAR`, `${VAR:-default}`)
- Any command substitution (`$(...)`, backticks)

The `shell=True` is the feature, not the bug. The threat model is: "users who configure their own hooks already have full code-execution rights on their own Pi" — passing user-configured shell strings to a shell is identical in privilege to letting them edit `~/.bashrc`.

**What to do instead:**
- Leave the call site as-is.
- If you want the bandit warning to stop yelling, add a `# nosec B602  # hook commands are user-configured shell strings — see BMO-SUGGESTIONS-LOG.md` inline comment with this rationale.
- If you ever add a parallel "structured hook" (e.g., MCP tool-call hooks defined as JSON arrays), implement that as a SEPARATE function with `shell=False` — don't try to make this one do both.
- Document the threat model briefly in `mcp_settings.json`'s leading comment so users understand they're trusting the file as much as `~/.bashrc`.

**Related files:** `bmo/pi/agents/hooks.py:54`, `bmo/pi/mcp_servers/mcp_settings.json` (the `hooks.*` blocks)

---

### [2026-04-24] DO NOT replace `os.system("curl …")` in `services/cloud_providers.py` with `subprocess.run(shell=False, …)` or `requests.post`

- **Category:** design-gotcha
- **Severity:** medium
- **Domain:** bmo

**Why it's tempting:** `services/cloud_providers.py` uses `os.system(f"curl -sS -X POST … -d @{shlex.quote(payload_path)} -o {shlex.quote(out_path)}")` for three cloud calls (Gemini chat, Groq STT, Fish Audio TTS). This looks like a textbook "should be rewritten" — `os.system` with f-string interpolation is normally a security and ergonomics anti-pattern, and modern Python style says use `subprocess.run([...])` with a list of args, or `requests.post(...)` for HTTP.

**Why it's wrong:** The file's own comment (line ~201) explains it: **`os.system` bypasses gevent monkey-patching**. BMO's main process runs under gevent (`gevent.monkey.patch_all()` in `app.py`). gevent patches `subprocess` and the `requests` HTTP socket layer to be cooperative, but those patched paths add latency and can deadlock under heavy concurrent voice/audio traffic. `os.system` shells out to a separate process that uses the OS's blocking syscalls directly — predictable, fast, and isolates the slow cloud calls from the gevent event loop.

A "fix" to `subprocess.run(...)` or `requests.post(...)` would silently regress voice latency (Groq STT was the original motivating case) and reintroduce gevent-related hangs that show up only under load.

The current code already protects against shell injection — every interpolated value is wrapped in `shlex.quote()` (only the `tmp_path` from `tempfile.NamedTemporaryFile` is unquoted, which is safe since OS-generated paths have no shell metacharacters). API keys appear in the shell command line, but only as values of `Authorization: Bearer …` headers, which are not user-controllable.

**What to do instead:** Leave it alone. If you're tempted to "modernize," first read the comment, then test under heavy concurrent voice/STT load before changing. If a refactor is genuinely needed, the right shape is `gevent.subprocess.Popen([...])` (gevent-aware but still subprocess) or use the asyncio variant cleanly inside an async-only module — never just plain `subprocess` or `requests`.

**Related files:** `bmo/pi/services/cloud_providers.py:200-218` (Gemini), `:415-432` (Groq STT), `:498-516` (Fish Audio TTS); `bmo/pi/app.py` (gevent.monkey.patch_all callsite)

---

### [2026-04-23] DO NOT rename `bmo/pi/bots/` to `discord/`

- **Category:** design-gotcha
- **Severity:** high
- **Domain:** bmo

**Why it's tempting:** Looks inconsistent — `services/`, `hardware/`, `bots/` → some might want to rename to `discord/` to match bot purpose.

**Why it's wrong:** Python imports from `discord.py` library use `import discord`. A local `discord/` subpackage (with `__init__.py`) SHADOWS the library — all Discord bot imports break with `ImportError`.

**What to do instead:** Keep `bots/`. Document purpose clearly in README. If you hate the name, "`discord_bots/`" is also safe.

---

### [2026-04-23] DO NOT rename `services/calendar_service.py` to `services/calendar.py`

- **Category:** design-gotcha
- **Severity:** medium
- **Domain:** bmo

**Why it's tempting:** `_service` suffix feels redundant when inside `services/`.

**Why it's wrong:** Python stdlib has a `calendar` module. If any part of BMO does `import calendar` (stdlib use), having `services/calendar.py` creates ambiguity depending on sys.path. Even with subpackage disambiguation, it's fragile.

**What to do instead:** Keep the `_service` suffix. Same applies to `list_service.py` (builtin `list`), and avoid renaming to any stdlib module name.

---

# Info / Observations

### [2026-04-23] 5 game-data JSONs byte-identical between `dnd-app/` and `bmo/pi/data/5e/`

- **Category:** design-gotcha, docs
- **Severity:** info
- **Domain:** both *(mirrored in [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md))*
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
- **Domain:** both *(mirrored in [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md))*
- **Discovered by:** Claude Opus
- **During:** DATA-FLOW.md drafting

**Description:** Each domain owns its own storage. dnd-app writes to `%APPDATA%/dnd-vtt/` (per-user, per-install). bmo writes to `/home/patrick/home-lab/bmo/pi/data/` (shared, on Pi). No cross-domain filesystem access — they communicate via HTTP only.

**Why useful to future agents:** If adding a feature that "needs data from the other side" — DON'T reach across filesystem. Add HTTP endpoint + use `bmo-bridge.ts` or `vtt_sync.py`.

**Related files:** `docs/DATA-FLOW.md`, `dnd-app/src/main/bmo-bridge.ts`, `bmo/pi/agents/vtt_sync.py`

---

> dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO bugs: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved BMO: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md).
