# `dnd-app/docs/` — reference-doc index

Maps each top-level reference doc to its topic and flags whether it is a **living
spec** (kept current, read before related work) or a **historical / plan** doc (a
point-in-time plan that may be partly or fully delivered — read for background,
not as current truth). The `phases/` subtree has its own index
([`phases/PHASE-INDEX.md`](./phases/PHASE-INDEX.md)) and is not repeated here.

| Doc | Topic | Status |
|---|---|---|
| [`ASSET-OFFLOAD.md`](./ASSET-OFFLOAD.md) | Large-asset (sounds/JSON) offload seam to keep the installer small. | Living spec |
| [`DEPENDENCIES.md`](./DEPENDENCIES.md) | Why non-obvious dependency / `overrides` decisions are the way they are. Re-check when bumping deps. | Living spec |
| [`DESIGN-CONSTRAINTS.md`](./DESIGN-CONSTRAINTS.md) | Canonical design gotchas / "do not fix these" (CSP, fog-of-war, routing). Read before related refactors. | Living spec |
| [`IPC-SURFACE.md`](./IPC-SURFACE.md) | Electron main/preload/renderer IPC surface. Channel list is **generated** from `src/shared/ipc-channels.ts` (`npm run gen:ipc-surface`) — do not hand-edit. | Living spec (generated) |
| [`LLAMA-SERVER.md`](./LLAMA-SERVER.md) | Pointing the local AI provider at a llama.cpp `llama-server` (speculative decoding). Experimental. | Living spec (experimental) |
| [`PLUGIN-SYSTEM.md`](./PLUGIN-SYSTEM.md) | Game-system plugin API + content pipeline (extract → generate → submit → audit). D&D 5e 2024 is the only implemented system. | Living spec |
| [`RELEASE.md`](./RELEASE.md) | Release reference — automated integrator cut, `scripts/release/cut.mjs`, signing notes. | Living spec |
| [`SEED-PACKS.md`](./SEED-PACKS.md) | `.dndseed` seed-pack format reference (campaign seed schema/versioning). | Living spec |
| [`UI-LAYERS.md`](./UI-LAYERS.md) | Named z-index scale convention; source of truth is `constants/z-index.ts`. | Living spec |
| [`WEB-VERSION-PLAN.md`](./WEB-VERSION-PLAN.md) | Feasibility/hosting/plan for the browser build of the renderer. A plan doc — the web build now exists (`npm run build:web`), so treat as partly-delivered background, not current status. | Historical / plan |

## Related indexes

- Scripts: [`../scripts/README.md`](../scripts/README.md)
- Open-work phase plans: [`phases/PHASE-INDEX.md`](./phases/PHASE-INDEX.md)
- Top-level app README (directory layout, build/run): [`../README.md`](../README.md)
