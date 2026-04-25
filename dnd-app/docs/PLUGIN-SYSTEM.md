# Plugin System — dnd-app

Game system plugin API. Currently D&D 5e 2024 is the only implemented system, but the architecture supports additional systems (Pathfinder, CoC, Shadowrun, etc.).

## Concept

A **game system plugin** provides:

1. **Content types** — what entities exist (spells, monsters, classes, weapons, etc.)
2. **Data files** — JSON files of that content
3. **Rules functions** — how to resolve attacks, spells, saves
4. **UI components** — character sheet, level-up wizard, spell picker, etc.
5. **Schema** — zod validation for the content

## Registry

All game systems register in `src/renderer/src/systems/registry.ts`:

```typescript
import { DnD5eSystem } from './dnd5e'
import type { GameSystem } from './types'

export const SYSTEMS: Record<string, GameSystem> = {
  dnd5e: DnD5eSystem,
  // future: 'pathfinder2e': Pathfinder2eSystem,
}

export function getSystem(id: string): GameSystem | undefined {
  return SYSTEMS[id]
}

export function getAllSystems(): GameSystem[] {
  return Object.values(SYSTEMS)
}
```

A campaign has a `systemId` field → renderer looks up the system and hands off to its components.

## GameSystem interface

`src/renderer/src/systems/types.ts`:

```typescript
export interface GameSystem {
  id: string                                // 'dnd5e', 'pathfinder2e', ...
  name: string                              // 'D&D 5e (2024)'
  version: string                           // '2024-10'
  description: string

  // Character creation
  characterSheetComponent: ComponentType<CharacterSheetProps>
  characterBuilderComponent: ComponentType<CharacterBuilderProps>
  levelUpComponent: ComponentType<LevelUpProps>

  // Game loop
  combatResolver: CombatResolver            // attack rolls, damage, saves
  initiativeRoller: InitiativeRoller
  conditionManager: ConditionManager

  // Content
  contentLoaders: {
    spells(): Promise<Spell[]>
    monsters(): Promise<Monster[]>
    equipment(): Promise<Equipment[]>
    classes(): Promise<Class[]>
    origins(): Promise<Origin[]>
    // ...
  }

  // Validation
  schemas: {
    character: ZodSchema
    spell: ZodSchema
    monster: ZodSchema
    // ...
  }
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

- **Character sheet:** `src/renderer/src/components/sheet/` (96 files)
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
- `plugin-runner.ts` — (planned) previously mentioned `isolated-vm`; **plugins are not sandboxed**. Renderer plugins run as normal JS in the renderer with full app access (trust-on-install).
- `plugin-protocol.ts` — protocol for plugins to communicate with main
- `plugin-config.ts` — per-plugin settings

Currently partially implemented. User-installed plugins work for content packs (spells/monsters/equipment JSON) but not for full system logic (which needs trusted code).

## Future improvements

- Fully encapsulate D&D 5e into `systems/dnd5e/` (currently sprawled across `components/`, `services/`, etc.)
- Extract more of the renderer into system-specific modules
- Plugin marketplace / downloader UI
- Schema versioning (breaking changes in content format)
- Community plugin submissions (would need vetting)
