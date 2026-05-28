# dnd-app Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dnd-app domain only.**
>
> Sibling logs:
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dnd-app` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dnd-app behavior → mirrored here AND in `BMO-SUGGESTIONS-LOG.md`. Cross-tooling rules that touch dnd-app contributors → here (and mirror in BMO file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

> **Backlog absorbed into phase plans (2026-05-18).** All previously-tracked future-ideas are now scoped inside the dnd-app phase-plan files:
> - Backup format migration framework → **Phase 33a**
> - i18n full sweep → **Phase 34** (entire phase)
> - safeStorage encryption of persisted secrets → **Phase 20 Sub-Phase A (S1)**
> - madge/ts-prune → dpdm/knip migration → **Phase 33b**
> - `<ModalScaffold>` extraction → **Phase 33c**
> - `npm run check:full` aggregate + `dnd-app-ci.yml` → **Phase 28e**
> - Bundle-size CI guard → **Phase 33d**
> - BMO_API_KEY end-to-end docs → **Phase 28g.1**
> - Plugin trust model docs → **Phase 28g.2** (paired with Phase 20 S4)
>
> New future-ideas should land directly in a phase plan, not here.

*(none active)*

---

# Design gotchas (warnings for future agents)

> **Absorbed into phase plans (2026-05-18).** Every gotcha that had a mechanical fix now has a phase task that closes the trap (via lint rule, codemod, or refactor). Every gotcha that was pure documentation now has a JSDoc / AGENTS.md / CLAUDE.md home wired into a phase plan:
> - DO NOT use `Math.random` → **Phase 28e.3** (Biome rule) — replaces the gotcha with enforcement.
> - DO NOT add new BMO endpoints without `Authorization: Bearer` → **Phase 28a.4** makes `bmoPiFetch` inject the header — gotcha becomes structurally impossible.
> - `IPC-SURFACE.md` regeneration → **Phase 28e.9** CI gate + **Phase 28g.6** AGENTS.md rule.
> - DO NOT update `migrateData` to return new objects → **Phase 28d.7** rewrites the contract; **Phase 28g.7** documents the new contract in JSDoc.
> - DO NOT use Three.js `scene.remove(mesh)` without `dispose()` → **Phase 17 GUI-4** absorbs the disposal discipline.
> - DO NOT mix dynamic + static imports in `provider-registry.ts` → **Phase 33f** collapses to one pattern; **Phase 28g.8** documents.
> - DO NOT import `useNetworkStore` from `stores/use-network-store.ts` → **Phase 33g** codemod + **Phase 28e.5** lint rule.
> - DO NOT use CJS `require()` in `electron.vite.config.ts` → **Phase 33e** migration + **Phase 28e.6** lint rule.
> - DO NOT trust `scripts/schemas/*` to validate content → **Phase 33h** fixes schema shape + CI validation gate.
> - DO NOT trust `isolated-vm` to mean plugins are sandboxed → dep was removed; warning text absorbed by **Phase 28g.2** + **Phase 20 S4**.
> - DO NOT leave task-list items pending → already in `AGENTS.md` (Task List Discipline).
> - DO NOT restructure `src/{main,preload,renderer,shared}/` → already in `CLAUDE.md`.

*(none active)*

---

# Info / Observations

### 2026-05-28 — Phase 15 invariant: library is the single source of truth (info)
**Domain: dnd-app.** Phase 15 made `useLibraryStore` (`stores/use-library-store.ts`) the canonical store for all D&D content. Consumers hold `EntryRef`s and hydrate via `services/library/use-library-entry.ts` (`useLibraryEntry` / `useLibraryEntries` / `useHydratedRef`); the vitest architecture spec `services/library/library-boundary.test.ts` fails CI on raw `public/data` imports / `/data/5e` fetches outside the allowlist (`services/library/**`, `use-library-store.ts`, `library-service.ts`), with inline `// boundary-allow: <reason>` opt-outs. Domain specifics: `services/library/README.md` (general), `docs/phases/bastion-data-rule.md` (Bastion). Tokens resolve library-derived stats live via `services/game/token-stats.ts` (inline fields = per-instance overrides; non-library-backed player/custom/summon tokens fall back to inline). For grep workflows: a "where does this content live / why isn't my edit propagating" question almost always resolves to "hold an EntryRef + hydrate via a hook," not an inline copy.

> **Absorbed into phase plans (2026-05-18).** Snapshot observations were either turned into enforcement gates or deleted as stale-risk:
> - Audit coverage gaps → **Phase 28i.1** (per-area scoped audits, re-scoped after Phase 30/31).
> - `discord-service.ts` bot token storage unverified → **Phase 35e** Step 19 verifies + folds into **Phase 20 S1**.
> - Vitest 0 skipped tests → **Phase 28e.7** CI gate (turns observation into enforcement).
> - Secure-randomness dual pattern → resolved by **Phase 28a.1** sweep + **Phase 28e.3** lint rule.
> - Electron security base config hardened → **Phase 28h.4** regression test (turns snapshot into enforced invariant).
> - `atomic-write.ts` canonical → **Phase 28e.4** lint rule + **Phase 28g.5** AGENTS.md rule.
> - License audit clean → **Phase 28e.8** CI gate.
> - 5 duplicated 5e JSONs cross-domain → already documented in [`DATA-FLOW.md`](./DATA-FLOW.md).

*(none active)*

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
