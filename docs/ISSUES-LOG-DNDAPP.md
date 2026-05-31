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
> - Knip unused exports/types, accessibility polish, error-handling convention, CI dedupe, the cloud-relay live integration gap — see the report's open sections.
>
> **Verified RESOLVED (do not re-fix):** **20g** (renderer security events now route via the `LOG_SECURITY_EVENT` IPC channel — `ipc-channels.ts:257` + handler `main/ipc/index.ts:208` + call-site `network/security-audit.ts`); **LOG-11** (Tiny-creature cover now uses `MapToken.sizeCategory` — `types/map.ts:113` + `cover-calculator.ts` + tests); Phase 23f attunement (single-source via `state.magicItemAttuned` + `getEffectiveMagicItems`); multi-floor visibility (`currentFloor` wired); positional audio emitters (`updateEmitters` is called).

## Critical / High / Medium / Low

*(none tracked here — see the report)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
