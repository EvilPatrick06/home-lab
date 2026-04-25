# BMO Issues Log

> **Active BMO bugs / tech debt / broken config / perf — domain-scoped to the Pi voice assistant + DM engine + Discord bots (`bmo/`).** Includes Pi-side infra/tooling that BMO depends on (the venv, pip caches, Pi systemd, etc.) since this is the Pi's primary domain.
>
> Sibling logs:
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved BMO entries → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule (BMO-domain entries):** Bug / debt / config / perf issues whose **Domain: bmo** (or Pi-side infra/tooling) → here. dnd-app entries → `ISSUES-LOG-DNDAPP.md`. `Domain: both` → mirror in both issue logs (small duplication is fine; one fix removes both). Security (any domain) → `SECURITY-LOG.md`. Design-gotcha / future-idea / info → `BMO-SUGGESTIONS-LOG.md`.

New entries go at the TOP of their severity section (newest first within each section).

**Process (read this):** This log is the **deferred** backlog, not a duplicate of every commit. Per [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md): if a bug is fixed in the same session / PR, we **do not** add a new entry here (the commit + moved archive entry are the record). That can make it look like the log “stopped” — it did not; it only tracks **outstanding** work. When an item is done, it moves to [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) and is removed from here.

---

# Active BMO Issues

> **2026-04-25** — The prior multi-section backlog was cleared in one Pi-verified pass (env, data paths, JSON vs pickle, journald logging, ruff, docs). Details: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) → search for **"BMO issues log — full sweep"**. Add new items below as they appear.

## Critical

*(none currently logged)*

## High

*(none currently logged)*

## Medium

*(none currently logged)*

## Low

*(none currently logged)*

---

> dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO future ideas / design gotchas / observations: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved BMO issues: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md).
