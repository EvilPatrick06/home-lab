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

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under [`../dnd-app/docs/phases/`](../dnd-app/docs/phases/) (start at [`PHASE-INDEX.md`](../dnd-app/docs/phases/PHASE-INDEX.md)); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dnd-app issues
> below as they appear.

## Critical

*(none currently logged)*

## High

### [2026-06-28] dnd-app CI red on `auto/play-store-prep` — biome `useTemplate` on protocol.ts (stale branch, 24 behind master)

- **Reported by:** ci-failure-triage (automated)
- **Category:** ci / lint
- **Severity:** high (branch CI persistently red; blocks play-store-prep merge)
- **Failing runs:** 28333588596 (latest 2026-06-28T19:34Z) — also prior 28331757659 / 28331635552 / 28331551197 / 28331393711
- **Branch / commit:** `auto/play-store-prep` @ 5380b527 (1 ahead / 24 BEHIND origin/master)

**Root cause:**
Job `check` step `Lint (biome)` (`npm run lint` -> `biome check src/`) fails with two `lint/style/useTemplate` errors in `dnd-app/src/shared/bridge/protocol.ts`:
- `protocol.ts:61` — `out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + ==` (string concatenation; biome wants a template literal)
- `protocol.ts:64` — `out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + =`
Both are FIXABLE. The branch is 24 commits behind origin/master and the equivalent fixes already landed on master (master dnd-app CI is green), so this is a stale-branch lint, not a new regression.

**Fix needed:**
Merge `origin/master` into `auto/play-store-prep` (brings in the existing fix and the other 24 commits), OR apply the two-line biome `useTemplate` fix on `protocol.ts:61,64` (wrap the concatenations in template literals, e.g. `` `${B64_CHARS[(n>>18)&63] + B64_CHARS[(n>>12)&63]}==` ``) and re-run `npm run lint`. Owner: play-store-prep agent / dnd-app domain.

*(none currently logged)*

## Medium

## Low
