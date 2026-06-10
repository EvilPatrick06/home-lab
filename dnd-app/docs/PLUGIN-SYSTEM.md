# Plugin System — dnd-app

Game system plugin API. Currently D&D 5e 2024 is the only implemented system, but the architecture supports additional systems (Pathfinder, CoC, Shadowrun, etc.).

## Concept

A **game system plugin** provides:

1. **Content types** — what entities exist (spells, monsters, classes, weapons, etc.)
2. **Data files** — JSON files of that content
3. **Rules functions** — how to resolve attacks, spells, saves
4. **UI components** — character sheet, level-up wizard, spell picker, etc.
5. **Schema** — zod validation for the content

> **Scope check.** A plugin does **not** swap the whole UI. The character sheet,
> builder, and combat UI are shared React components; a plugin supplies the
> system-specific **data + rules functions** those components call. The full
> interface walkthrough lives in the root [`docs/PLUGIN-SYSTEM.md`](../../docs/PLUGIN-SYSTEM.md)
> — that copy is authoritative for the API.

## Registry

All game systems register in `src/renderer/src/systems/registry.ts` — a `Map` keyed by system id:

```typescript
import type { GameSystemPlugin } from './types'

const registry = new Map<string, GameSystemPlugin>()

export function registerSystem(plugin: GameSystemPlugin): void { /* … */ }
export function unregisterSystem(id: string): void { /* … */ }
export function getSystem(id: string): GameSystemPlugin { /* throws if unregistered */ }
```

> **Reality check (2026-06-10):** there is currently NO campaign-level `systemId`
> field anywhere in `src/` — the registry is consumed only by the Settings page's
> "Registered Game Systems" list and `data-provider.resolveDataPath`. Campaign-level
> game-system selection (playing a registered non-5e system end-to-end) is
> unimplemented; tracked in `AI-DM-AUDIT.md` § Future/Stubbed/Unfinished.

## GameSystemPlugin interface

`src/renderer/src/systems/types.ts` (data + rules only — no UI components):

```typescript
export interface GameSystemPlugin {
  id: string
  name: string

  getSpellSlotProgression(className: string, level: number): Record<number, number>
  getSpellList(className: string): Promise<SpellEntry[]>
  isSpellcaster(className: string): boolean
  getStartingGold(classId: string, backgroundId: string): Promise<Currency>
  getClassFeatures(classId: string, level: number): Promise<ClassFeatureEntry[]>
  loadEquipment(): Promise<{ weapons: unknown[]; armor: unknown[]; shields: unknown[]; gear: unknown[] }>
  getSkillDefinitions(): Array<{ name: string; ability: AbilityName }>
  getSheetConfig(): SheetConfig

  // Optional extension points for plugin-provided game systems
  getConfig?(): GameSystemConfig
  getAbilityScores?(): AbilityScoreConfig
  getBuilderSteps?(): BuilderStepDef[]
  getDataPaths?(): Partial<Record<string, string>>
  calculateHP?(classId: string, level: number, conMod: number): number
  calculateAC?(equipment: unknown[], dexMod: number): number
  getProficiencyBonus?(level: number): number
}
```

## File layout for a new system

```
src/renderer/src/systems/<system-id>/
├── index.ts                            GameSystem export
├── character-sheet/
│   ├── CharacterSheet.tsx
│   └── CharacterSheet.test.tsx
├── builder/
│   └── CharacterBuilder.tsx
├── levelup/
│   └── LevelUpWizard.tsx
├── combat/
│   ├── combat-resolver.ts
│   ├── attack-resolver.ts
│   └── damage-resolver.ts
├── types.ts                            System-specific types
└── schemas.ts                          Zod schemas
```

Content JSON goes in:

```
src/renderer/public/data/<system-id>/
├── spells/*.json
├── monsters/*.json
├── classes/*.json
└── ...
```

## Current D&D 5e system (reference implementation)

Lives across multiple dirs (not yet fully encapsulated to `systems/dnd5e/` — refactor target):

- **Character sheet:** `src/renderer/src/components/sheet/` (98 files)
- **Character builder:** `src/renderer/src/components/builder/` (64 files, split into `5e/` subdirs)
- **Level-up wizard:** `src/renderer/src/components/levelup/` (11 files)
- **Combat:** `src/renderer/src/services/combat/` (54 files)
- **Content loaders:** `src/renderer/src/services/library/` (4 files) + `@data/5e/*`
- **Schemas:** `src/renderer/src/types/character-5e.ts`, `dm-toolbox.ts`, etc.

Registry entry: `src/renderer/src/systems/dnd5e/`

## Adding a new game system (checklist)

1. **Scaffold dirs:**
   ```bash
   mkdir -p src/renderer/src/systems/my-system
   mkdir -p src/renderer/public/data/my-system/{spells,monsters,classes}
   ```

2. **Define types:** `src/renderer/src/systems/my-system/types.ts` — TypeScript interfaces for your content
3. **Write zod schemas:** `schemas.ts`
4. **Implement components:** CharacterSheet, CharacterBuilder, LevelUpWizard
5. **Implement rules:** `combat-resolver.ts`, etc.
6. **Content loaders:** thin wrappers over `fetch('/data/my-system/...')` (via @data alias)
7. **Export GameSystem:** `index.ts`
8. **Register:** add to `src/renderer/src/systems/registry.ts`
9. **Content:** populate `public/data/my-system/*.json` (can script via extract/generate pipeline)
10. **Test:** unit tests for rules, integration test for character creation
11. **Update docs:** this file + `dnd-app/docs/DATA-FLOW.md`

## Content extraction pipeline (for new system)

Mirror the D&D 5e pattern:

```
5e References PDFs
  ↓
scripts/extract/<system-id>/extract-*.ts        (PDF → structured JSON via Claude)
  ↓
scripts/generate/<system-id>/generate-*.ts      (schema-validated output)
  ↓
scripts/submit/<system-id>/submit-*.ts          (Anthropic Batch API for cost-efficient bulk)
  ↓
scripts/audit/<system-id>/audit.ts              (validate + fix-up)
  ↓
src/renderer/public/data/<system-id>/*.json     (final)
```

Each phase uses zod schemas to validate. Regeneration is idempotent.

## Anti-patterns

- ❌ Hardcoding D&D-specific logic in `components/ui/` — should be in `systems/dnd5e/`
- ❌ Importing from `systems/dnd5e/` outside of D&D flows — breaks reusability for new systems
- ❌ Putting system JSON in `src/` — use `public/data/` so it's served as static assets
- ❌ Loading all system content eagerly — use dynamic imports + chunk-index.json for lazy loading

## Plugin installer (future — partial impl)

`src/main/plugins/` has scaffolding for INSTALLING user-provided system plugins (not just built-in ones):

- `plugin-installer.ts` — unpack + validate plugin zip
- `plugin-scanner.ts` — discover plugins in user dir
- `plugin-protocol.ts` — protocol for plugins to communicate with main
- `plugin-config.ts` — per-plugin settings
- `plugin-storage.ts` / `content-pack-loader.ts` — plugin persistence + content-pack ingestion

There is no `plugin-runner.ts` / sandbox module — **plugins are not sandboxed**; renderer plugins run as normal JS with full app access (trust-on-install; see the trust model below).

Currently partially implemented. User-installed plugins work for content packs (spells/monsters/equipment JSON) but not for full system logic (which needs trusted code).

## Trust model (Phase 28g.2)

**Plugins are NOT sandboxed.** A renderer plugin runs as ordinary JavaScript inside the renderer process with the same access the app itself has — game data, IPC bridge, localStorage, the network. There is no permission prompt and no capability isolation; installing a plugin is a full trust decision.

Consequences for users:
- Only install plugins from sources you trust. A malicious plugin can read/modify campaigns, characters, and settings, and make network requests.
- The install UI (Settings → Plugins) surfaces this with a warning banner: *"Plugins have full access to your game data — only install plugins from sources you trust."*

Consequences for the install pipeline:
- `plugin-installer.ts` validates the zip structure + manifest shape, and the plugin id is charset/length-constrained (`PluginIdSchema`, Phase 22i) so it can't traverse the filesystem. This is **structural** validation, not a security sandbox — it stops malformed packs, not malicious code.
- Content packs (JSON spells/monsters/equipment) are data-only and lower-risk than code plugins; full code-plugin execution remains gated behind the not-yet-shipped sandbox work below.

## Future improvements

Tracked in the consolidated backlog — `dnd-app/docs/AI-DM-AUDIT.md` § Future/Stubbed/Unfinished → dnd-app ("Plugin-system future work"): 5e encapsulation into `systems/dnd5e/`, system-specific renderer modules, marketplace/downloader UI, content-schema versioning, community submission vetting.
