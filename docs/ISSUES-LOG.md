# Issues log (split by domain)

This file is a **compatibility pointer**. Active bugs and tech debt are logged in two places by domain:

- **BMO** (Pi, Discord bots, voice, agents): [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
- **dnd-app** (Electron VTT, 5e data): [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)

`Domain: both` items are **mirrored in both** logs — fix once, remove from both.

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

# Cross-cutting issues (logged here by overall-errors scanner)

> Repo-wide / multi-project findings. Per the domain-split triage in `LOG-INSTRUCTIONS.md` these are `Domain: both`; recorded here in the compatibility-pointer log.

### [2026-06-22] Repo-wide pre-commit hook is a permanent no-op — `core.hooksPath` resolves to a non-existent dispatch target, so lint + typecheck + gitleaks never run on any commit

- **Category:** bug, config
- **Severity:** high
- **Domain:** both
- **Discovered by:** overall-errors
- **During:** cross-cutting/repo-wide error scan of monorepo tooling (git hooks, CI, root configs).

**Description:**
The local pre-commit gate does not execute for ANY committer in the repo, in any of the three projects (dnd-app / dungeon-scholar / bmo). The real gate script lives at the repo root in `.husky/pre-commit` (it does `cd dnd-app`, runs `npm run lint -- --staged`, `tsc --noEmit -p tsconfig.web.json`, and an optional `gitleaks protect --staged`). But git is configured with `core.hooksPath = dnd-app/.husky/_` (set by `dnd-app/package.json`'s `"prepare": "cd .. && husky dnd-app/.husky"`). The husky v9 dispatcher `dnd-app/.husky/_/h` computes the real hook path as `$(dirname $(dirname $0))/<hookname>` = `dnd-app/.husky/pre-commit` and then runs `[ ! -f "$s" ] && exit 0`. That file does NOT exist (only `dnd-app/.husky/_/` exists under `dnd-app/.husky/`), so every invocation hits the `exit 0` early-out and the hook is a silent no-op. Net effect: biome lint, the renderer typecheck, and the gitleaks staged-secret scan are all skipped on every `git commit` — CI is the only thing catching lint/type regressions, and there is NO local secret-scan defense-in-depth at all.

**Reproduction (if bug):**
1. `git config --get core.hooksPath` -> `dnd-app/.husky/_`.
2. `ls dnd-app/.husky/` -> only the `_/` shim dir; there is no `dnd-app/.husky/pre-commit`.
3. Stage a file with a lint/format error (or a fake secret) and `git commit`.
4. Observed: the commit succeeds with no lint/typecheck/gitleaks output. The root `.husky/pre-commit` gate is never run.

**Expected behavior (if bug):** committing staged lint/format errors (or a staged secret) should be blocked locally by the pre-commit gate before reaching CI.

**Hypothesis / root cause:** The `prepare` script points husky at `dnd-app/.husky`, but the actual hook script is authored at the repo-root `.husky/pre-commit`. Husky v9 expects the real hook files to live in the SAME directory passed to the `husky <dir>` install command (here `dnd-app/.husky/`), so the dispatcher looks for `dnd-app/.husky/pre-commit` and finds nothing. The root `.husky/` dir and the `dnd-app/.husky/` install dir are mismatched. (Speculative on intent, but the file-existence checks above are concrete and verified.)

**Proposed fix / improvement:**
- [ ] Either move the real gate to `dnd-app/.husky/pre-commit` (where the dispatcher looks), or
- [ ] change the `prepare` script to install husky against the repo-root `.husky` so `core.hooksPath` points at the dir that actually contains `pre-commit`, then verify `git config core.hooksPath` matches the dir holding the hook.
- [ ] Add a smoke check (CI or a `prepare` postcheck) that asserts the configured hooks dir actually contains the expected hook files, so a future mis-wire fails loudly.

**Blocked by:** nothing.

**Related files:** `dnd-app/package.json` (`prepare` script, ~line 14), `.husky/pre-commit` (root, the real but unreachable gate), `dnd-app/.husky/_/h` (dispatcher), `.githooks/pre-commit` (older gitleaks-only shim, also unused).

**Related entries:** ISSUES-LOG-DNDAPP.md -> "[2026-06-16] Pre-commit hook lints 0 staged files". That entry diagnoses a biome `--staged` path-matching bug WITHIN the gate script; this entry is a distinct, upstream problem — the gate script is never invoked at all, so that biome symptom cannot even manifest. Re-wiring the hook should address both together.
