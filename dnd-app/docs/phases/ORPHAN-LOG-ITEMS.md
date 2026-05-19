# Orphan log items (triage)

> Generated 2026-05-19 as a side-effect of the phase-plan standardization sweep.
> Items here are entries from `docs/ISSUES-LOG-DNDAPP.md`, `docs/SUGGESTIONS-LOG-DNDAPP.md`, or `docs/SECURITY-LOG.md` that did not fit cleanly into any of phases 15-36 during the sweep.
> Each entry needs a triage decision: fold into an existing phase, create a new phase, or close as won't-fix.

## Scan summary

- **`docs/ISSUES-LOG-DNDAPP.md`** (41 lines, post-trim): No active entries. Routing note at the top says "All previously-tracked active issues are now scoped inside the dnd-app phase-plan files at `dnd-app/docs/phases/`. New issues should be triaged into the appropriate phase plan, not added here." All severity sections (Critical / High / Medium / Low) explicitly say `(none active)`.
- **`docs/SUGGESTIONS-LOG-DNDAPP.md`** (75 lines, post-trim): No active future-ideas, design-gotchas, or info entries. The routing block at the top maps every previously-tracked suggestion to its now-current phase home (Phase 33a/b/c/d, Phase 34, Phase 20 S1, Phase 28e/g, Phase 35e, etc.).
- **`docs/SECURITY-LOG.md`** (gitignored, not present in this repo clone): Could not scan. Any unrouted security findings should land in `dnd-app/docs/phases/phase-20-plan.md` (audit hardening) or `dnd-app/docs/phases/phase-35-plan.md` (IPC zod sweep).

## Orphans

None found. The 2026-05-18 routing pass that emptied both logs into phase plans appears complete; nothing slipped through.

## Cross-checks performed

Verified each routing claim in `SUGGESTIONS-LOG-DNDAPP.md` against the rewritten phase plans:

| Log claim | Phase plan target | Present? |
|-----------|-------------------|----------|
| Backup format migration framework → Phase 33a | `phase-33-plan.md` Sub-phase 33a | yes (DONE) |
| i18n full sweep → Phase 34 | `phase-34-plan.md` (entire) | yes |
| safeStorage encryption of persisted secrets → Phase 20 Sub-Phase A (S1) | `phase-20-plan.md` 20a + Completed (S1) | yes (DONE) |
| madge/ts-prune → dpdm/knip migration → Phase 33b | `phase-33-plan.md` Sub-phase 33b | yes (DONE) |
| `<ModalScaffold>` extraction → Phase 33c | `phase-33-plan.md` Sub-phase 33c | yes (live) |
| `npm run check:full` aggregate + `dnd-app-ci.yml` → Phase 28e | `phase-28-plan.md` Sub-phase 28e | yes (live) |
| Bundle-size CI guard → Phase 33d | `phase-33-plan.md` Sub-phase 33d | yes (live) |
| BMO_API_KEY end-to-end docs → Phase 28g.1 | `phase-28-plan.md` Sub-phase 28g | yes (live) |
| Plugin trust model docs → Phase 28g.2 (paired with Phase 20 S4) | `phase-28-plan.md` 28g + `phase-20-plan.md` 20d | yes (live) |
| Math.random gotcha → Phase 28e.3 (Biome rule) | `phase-28-plan.md` 28e | yes (live) |
| BMO `Authorization: Bearer` → Phase 28a.4 | `phase-28-plan.md` 28a | yes (live) |
| IPC-SURFACE.md regeneration → Phase 28e.9 + Phase 28g.6 | `phase-28-plan.md` 28e + 28g | yes (live) |
| `migrateData` return-new-objects contract → Phase 28d.7 + Phase 28g.7 | `phase-28-plan.md` 28d + 28g | yes (live) |
| Three.js `scene.remove(mesh)` without `dispose()` → Phase 17 GUI-4 | `phase-17-plan.md` 17e (GUI-4) | yes (live) |
| `provider-registry.ts` mixed import → Phase 33f + Phase 28g.8 | `phase-33-plan.md` 33f (DONE) + 28g | yes |
| `use-network-store` re-export barrel → Phase 33g + Phase 28e.5 | `phase-33-plan.md` 33g (DONE) + 28e | yes |
| `electron.vite.config.ts` CJS `require()` → Phase 33e + Phase 28e.6 | `phase-33-plan.md` 33e + 28e | yes (live) |
| `scripts/schemas/*` content-shape → Phase 33h | `phase-33-plan.md` 33h | yes (live) |
| `isolated-vm` removed; warning text → Phase 28g.2 + Phase 20 S4 | `phase-28-plan.md` 28g + `phase-20-plan.md` 20d | yes |
| Audit coverage gaps → Phase 28i.1 | `phase-28-plan.md` 28i | yes (live) |
| `discord-service.ts` bot token storage → Phase 35e Step 19 + Phase 20 S1 | `phase-35-plan.md` 35e + `phase-20-plan.md` 20a Step 1 | yes (live) |
| Vitest 0 skipped tests → Phase 28e.7 | `phase-28-plan.md` 28e | yes (live) |
| Secure-randomness dual pattern → Phase 28a.1 + Phase 28e.3 | `phase-28-plan.md` 28a + 28e | yes (live) |
| Electron security base config → Phase 28h.4 | `phase-28-plan.md` 28h | yes (live) |
| `atomic-write.ts` canonical → Phase 28e.4 + Phase 28g.5 | `phase-28-plan.md` 28e + 28g | yes (live) |
| License audit clean → Phase 28e.8 | `phase-28-plan.md` 28e | yes (live) |
| 5 duplicated 5e JSONs cross-domain | already in `docs/DATA-FLOW.md` (no phase needed) | n/a |

All routing claims verified. No orphans to triage.

## Action for the user

No new phase or work item needed. Suggest:
1. Delete this file once you've eyeballed it, OR
2. Keep it as a record of the 2026-05-19 audit/triage pass.
