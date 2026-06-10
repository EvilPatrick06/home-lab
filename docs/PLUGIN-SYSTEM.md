# Plugin System — dnd-app

Game-system plugin API. D&D 5e (2024) is the only implemented system, but the
architecture is designed so additional systems (Pathfinder 2e, CoC, …) can be
added by implementing one interface and registering it.

> **Scope check (read this first).** A plugin does **not** swap the whole UI. The
> character sheet, builder, and combat UI are shared React components. A plugin
> supplies the system-specific **data + rules functions** those components call —
> spell-slot progression, spell/equipment lists, starting gold, class features,
> skill definitions, and a `SheetConfig` of display toggles. Built-in systems are
> registered in code at startup (see below); there IS a user-plugin installer in
> `dnd-app/src/main/plugins/` (`plugin-installer.ts` + scanner/config/storage) for
> zip-packaged plugins — content packs work today, full system logic is
> trust-on-install and not sandboxed (see the trust model in
> [`dnd-app/docs/PLUGIN-SYSTEM.md`](../dnd-app/docs/PLUGIN-SYSTEM.md)).

## The interface — `GameSystemPlugin`

Defined in `src/renderer/src/systems/types.ts`. Required members:

```typescript
export interface GameSystemPlugin {
  id: string                 // 'dnd5e', 'pathfinder2e', …
  name: string               // 'D&D 5th Edition'

  getSpellSlotProgression(className: string, level: number): Record<number, number>
  getSpellList(className: string): Promise<SpellEntry[]>
  isSpellcaster(className: string): boolean
  getStartingGold(classId: string, backgroundId: string): Promise<Currency>
  getClassFeatures(classId: string, level: number): Promise<ClassFeatureEntry[]>
  loadEquipment(): Promise<{ weapons: unknown[]; armor: unknown[]; shields: unknown[]; gear: unknown[] }>
  getSkillDefinitions(): Array<{ name: string; ability: AbilityName }>
  getSheetConfig(): SheetConfig   // showInitiative / showPerception / showClassDC / showBulk / proficiencyStyle …

  // Optional extension points
  getConfig?(): GameSystemConfig            // also registers in GAME_SYSTEMS (UI listing) — see below
  getAbilityScores?(): AbilityScoreConfig
  getBuilderSteps?(): BuilderStepDef[]
  getDataPaths?(): Partial<Record<string, string>>
  calculateHP?(classId: string, level: number, conMod: number): number
  calculateAC?(equipment: unknown[], dexMod: number): number
  getProficiencyBonus?(level: number): number
}
```

`SheetConfig`, `AbilityScoreConfig`, and `BuilderStepDef` are also in `types.ts`.

## Registry

`src/renderer/src/systems/registry.ts` holds a `Map<string, GameSystemPlugin>`:

```typescript
registerSystem(plugin: GameSystemPlugin): void   // adds to the map; if plugin.getConfig() exists, also registerGameSystem(plugin.getConfig())
unregisterSystem(id: string): void
getSystem(id: string): GameSystemPlugin           // THROWS `Game system '<id>' not registered` if absent
getAllSystems(): GameSystemPlugin[]
```

Systems are bootstrapped at startup by `src/renderer/src/systems/init.ts`:

```typescript
import { dnd5ePlugin } from './dnd5e'
import { registerSystem } from './registry'

export function initGameSystems(): void {
  registerSystem(dnd5ePlugin)
}
```

> **Reality check (2026-06-10):** campaigns do NOT yet carry a `systemId` —
> the field appears nowhere in `dnd-app/src/`. The registry is consumed only by
> the Settings page's "Registered Game Systems" list and
> `data-provider.resolveDataPath`, so a registered non-5e system can't be played
> end-to-end yet (tracked in `dnd-app/docs/AI-DM-AUDIT.md`). The optional
> `getConfig()` path mirrors the plugin into the separate `GAME_SYSTEMS` config
> registry (`types/game-system.ts`) used for UI listing/metadata — distinct from
> the plugin `Map`.

## Reference implementation — D&D 5e

`src/renderer/src/systems/dnd5e/index.ts` exports `dnd5ePlugin: GameSystemPlugin`
(`id: 'dnd5e'`, `name: 'D&D 5th Edition'`). Its methods delegate to the shared
content loaders in `services/data-provider.ts` (e.g. `getSpellList` filters
`load5eSpells()`), so the plugin layer stays thin and the **library remains the
single source of truth** (see `services/library/README.md`). Tests live beside it
(`dnd5e/index.test.ts`, plus `systems/registry.test.ts` / `init.test.ts` /
`types.test.ts`).

## Data

5e content is static JSON under `src/renderer/public/data/5e/**`, served as
runtime assets (NOT bundled) and loaded lazily through `services/data-provider.ts`
(`loadJson` + a content cache; the Phase 36 Pi remote-library path layers on top).
A plugin's optional `getDataPaths()` can remap where its loaders look.

## Adding a new game system (checklist)

1. Create `src/renderer/src/systems/<id>/index.ts` exporting a
   `GameSystemPlugin` const (implement the required members; add optional ones as
   needed).
2. Add that system's content JSON under `public/data/<id>/**` and the loaders it
   needs (route reads through the data-provider / library, never inline-duplicate
   library data — the `library-boundary.test.ts` gate enforces this).
3. Register it in `systems/init.ts` (`registerSystem(<id>Plugin)`).
4. Add `<id>/index.test.ts` + extend `registry`/`init` tests.
5. If the shared sheet/builder need system-specific layout, drive it from
   `getSheetConfig()` / `getAbilityScores()` / `getBuilderSteps()` rather than
   forking the components.

## Anti-patterns

- Don't inline-duplicate library content inside a plugin — hold `EntryRef`s and
  hydrate (the boundary test fails CI otherwise).
- Don't fork the shared sheet/builder per system — express differences through
  `SheetConfig` and the optional config hooks.
- Don't call `getSystem()` for an unregistered id without expecting a throw — it
  is intentionally strict (call `getAllSystems()` to enumerate).

## Not yet built (future)

- A dynamic/installable plugin loader (systems are compile-time-registered today).
- A formal trust/sandbox model for third-party systems (would be required before
  loading untrusted plugin code — see `SECURITY-LOG.md` / Phase 28g.2 notes).
- TypeDoc API docs for the interface; Storybook for the shared components.
