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

### [2026-06-23] `bmo/docs/SYSTEMD.md` opening line says "5 systemd services" but there are 10 services + 2 timers

- **Category:** docs
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-resolver
- **During:** resolving the kiosk→systemd rename / docs-index entries (cross-checking doc counts)

**Description:**
`bmo/docs/SYSTEMD.md` line 2 reads "5 systemd services manage BMO's runtime." The `bmo/pi/systemd/` dir actually holds **10 `.service` files + 2 `.timer` files** (`bmo`, `bmo-kiosk`, `bmo-fan`, `bmo-dm-bot`, `bmo-social-bot`, `bmo-ide`, `bmo-backup`(+timer), `bmo-voice-canary`(+timer), and the new `bmo-backup-verify`(+timer)). Same stale-count smell as the AGENTS.md "5 agents" line fixed this run — left unfixed here only because it was outside the approved entry set.

**Proposed fix / improvement:**
- [ ] Update the SYSTEMD.md headline to the real count (or drop the number and let the table be authoritative); confirm the units table lists all 12 unit files.

**Related files:** `bmo/docs/SYSTEMD.md`, `bmo/pi/systemd/`
*(All 11 future-idea entries logged 2026-06-23 were resolved the same day by bmo-resolver and moved to [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md).)*

---

# Design gotchas (warnings for future agents)

*(Design gotchas are now documented in [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
