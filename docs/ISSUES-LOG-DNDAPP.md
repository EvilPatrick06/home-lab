# Issues Log — dnd-app

> **Active dnd-app bugs / tech debt / broken config — Electron VTT issues only.**
> Sibling logs:
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dnd-app/` (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set) → here. `Domain: both` cross-cutting entries → mirror in BOTH `BMO-ISSUES-LOG.md` AND this file (small duplication is intentional; one fix removes both copies).

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **Single source of truth: the consolidated report.** All open dnd-app items
> (problems, debt, suggestions, security, future work, out-of-scope) now live in
> **`dnd-app/docs/phases/REVIEW-REPORT-2026-05-29.md`** — verified against the
> code on 2026-05-29. Do not re-log dnd-app items here; add them to that report.
>
> Quick map of what's open (full detail + file:line in the report):
> - **20g** — renderer-side security events not routed to the main audit log (needs a `LOG_SECURITY_EVENT` IPC channel).
> - **LOG-11** — Tiny-creature cover exclusion needs a `sizeCategory` field on `MapToken`.
> - God-object splits, accessibility polish, error-handling convention, test-coverage gaps — see the report's "From home-lab/docs audit" section.
>
> **Verified RESOLVED (do not re-fix):** Phase 23f attunement (now single-source
> via `state.magicItemAttuned` + `getEffectiveMagicItems`); multi-floor visibility
> (`currentFloor` wired); positional audio emitters (`updateEmitters` is called).

## Critical / High / Medium / Low

*(none tracked here — see the report)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
