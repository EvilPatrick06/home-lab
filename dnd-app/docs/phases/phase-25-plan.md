# SYSTEM OVERRIDE: IMPLEMENTATION MODE

Phase 25 covers the **Homebrew & Custom Content System**. The foundation exists — creation modal with 13 content types, category-organized storage, data merge with official content, and library display. The critical gaps are **no export/import for homebrew**, **only 3/13 content types have Zod schemas**, **custom mechanics don't function in gameplay**, **dual storage confusion** (homebrew vs custom creatures), and **no campaign-scoped content**.

> **See also:** Phase 15 (Library as Single Source of Truth). Two original sub-phases moved entirely to Phase 15:
> - **H4 (Sub-Phase D — Unify Storage Systems)** is absorbed by Phase 15 Sub-Phase G Step 21 (Homebrew Parity). Custom-creatures storage merging into homebrew, and homebrew living in the same library store as built-ins, are structural Phase 15 rules.
> - **M2 (Sub-Phase F — Builder/Sheet Integration)** is resolved structurally by Phase 15 Sub-Phases B/C/D — once every consumer hits the library, homebrew shows up automatically (it's in the library; consumers can't tell built-in from homebrew apart from a `source: 'homebrew'` field).
>
> **H2 (Zod schemas) — fully absorbed by Phase 15 (2026-05-18 update).** Phase 15 Sub-Phase A.2 ships unified per-category schemas; A.2.5 adds source + audit fields to `BaseLibraryEntry`. The 13 homebrew types validate via the same `SCHEMA_REGISTRY` as official entries. No separate homebrew schemas needed. H2 struck from Phase 25 scope.
>
> **See also:** Phase 31 (Live-state sync overhaul) — library / homebrew updates broadcast as a library shard delta (no bespoke message). Campaign-scoped homebrew filtering (Sub-Phase E / M1) lives in that shard's `permissionFilter` once Phase 29 permission keys exist.
>
> **Verification pass (2026-05-18):**
> - H1 export/import — ✗ no `.dndhomebrew` support in `services/io/`. Live work.
> - H2 Zod schemas — ✓ **STRUCK FROM SCOPE (2026-05-18).** Fully absorbed by Phase 15 A.2 + A.2.5. The 9 dev-time schemas in `scripts/schemas/` remain Phase 33h's concern; the runtime homebrew validation H2 wanted is now Phase 15's unified `SCHEMA_REGISTRY`.
> - H3 custom mechanics — ✗ `feat-mechanics-5e.ts` has zero homebrew handling. Live work (mechanical-effects work, not the field-parity work that 17o shipped).
> - M1 campaign-scoped homebrew — ✗ no `campaignId` field on homebrew schemas. Live work.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

**Existing Files:**

| File | Role | Status |
|------|------|--------|
| `src/renderer/src/components/library/HomebrewCreateModal.tsx` | Creation UI — 13 types, dynamic fields, based-on relationships | Functional |
| `src/main/storage/homebrew-storage.ts` | File storage — `userData/homebrew/{category}/{id}.json` | Functional |
| `src/main/storage/custom-creature-storage.ts` | Separate creature storage — `userData/custom-creatures/{id}.json` | Functional but confusing dual system |
| `src/renderer/src/stores/use-data-store.ts` | `mergeHomebrew()` — integrates with official data | Functional |
| `src/renderer/src/services/library-service.ts` | `homebrewToLibraryItems()` — displays in library | Functional |
| `src/renderer/src/services/homebrew-validation.ts` | Basic validation — name, type, id, duplicate check | Minimal |
| `src/renderer/src/services/character/feat-mechanics-5e.ts` | Feat mechanics — **official feats only** | Custom feats not supported |
| `src/renderer/src/services/io/entity-io.ts` | Entity export — **doesn't include homebrew types** | Missing |
| `src/renderer/src/services/io/import-export.ts` | Full backup — includes homebrew in `exportAllData()` | Partial |
| `scripts/schemas/` | Zod schemas — **only classes, feats, backgrounds** | 3/13 types |
| `scripts/validate-homebrew.ts` | Dev-time validation — only 3 types | Minimal |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### HIGH PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| H1 | No homebrew export/import — can't share custom content | Users can't transfer homebrew between machines or share with players |
| ~~H2~~ | ~~Only 3/13 content types have Zod validation schemas~~ — **fully absorbed by Phase 15 A.2 + A.2.5** (2026-05-18). Phase 15 ships unified `SCHEMA_REGISTRY` covering every `LibraryCategory` (~52 categories, all 13 homebrew types included). A.2.5 adds `source: 'official' \| 'homebrew' \| 'plugin'` + optional `createdAt`/`updatedAt` to `BaseLibraryEntry`, so homebrew audit metadata validates against the same schemas. **Strike H2 from Phase 25 scope** — no separate `HomebrewSpellSchema` etc. needed. | — |
| H3 | Custom feats/spells have no mechanical effect — partially absorbed by Phase 15 | Homebrew displays in library but doesn't work in gameplay |
| ~~H4~~ | ~~Dual storage systems~~ — **moved to Phase 15 Sub-Phase G Step 21** | — |

### MEDIUM PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| M1 | No campaign-scoped homebrew | All homebrew is global; can't have campaign-specific content |
| ~~M2~~ | ~~Character builder/sheet doesn't reference homebrew~~ — **resolved structurally by Phase 15** | — |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Homebrew Export/Import (H1)

**Step 1 — Add Homebrew to Entity I/O System**
- Open `src/renderer/src/services/io/entity-io.ts`
- Add homebrew as a supported entity type:
  ```typescript
  const ENTITY_CONFIGS = {
    // ... existing types
    homebrew: { extension: '.dndhomebrew', displayName: 'Homebrew Content' },
  }
  ```
- The envelope format already supports arbitrary data: `{ version: 1, type, exportedAt, count, data }`

**Step 2 — Create Homebrew Export Function**
- Add to `entity-io.ts` or create `homebrew-io.ts`:
  ```typescript
  export async function exportHomebrew(items: HomebrewItem[]): Promise<void> {
    await exportEntities('homebrew', items)
  }

  export async function exportAllHomebrew(): Promise<void> {
    const allHomebrew = await window.api.homebrew.loadAll()
    await exportEntities('homebrew', allHomebrew)
  }
  ```

**Step 3 — Create Homebrew Import Function**
- Add import with validation:
  ```typescript
  export async function importHomebrew(): Promise<{ imported: number; errors: string[] }> {
    const entities = await importEntities('homebrew')
    const results = { imported: 0, errors: [] as string[] }
    for (const item of entities) {
      const validation = validateHomebrew(item)
      if (validation.valid) {
        await window.api.homebrew.save(item)
        results.imported++
      } else {
        results.errors.push(`${item.name}: ${validation.errors.join(', ')}`)
      }
    }
    return results
  }
  ```

**Step 4 — Add Export/Import UI Buttons**
- Open `src/renderer/src/components/library/HomebrewCreateModal.tsx` or the library homebrew section
- Add "Export All Homebrew" and "Import Homebrew" buttons
- Show import results (count imported, any errors)

### Sub-Phase B: ~~Complete Validation Schemas (H2)~~

> **STRUCK 2026-05-18.** Fully absorbed by Phase 15 A.2 (unified `SCHEMA_REGISTRY` for every `LibraryCategory`) + Phase 15 A.2.5 (homebrew audit fields on `BaseLibraryEntry`). No homebrew-specific schemas needed. The steps below are kept for historical reference only — do not implement.

**Step 5 — Create Zod Schemas for All Content Types**
- Create `src/renderer/src/schemas/homebrew-schemas.ts`:
  ```typescript
  import { z } from 'zod'

  const BaseHomebrewSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    type: z.string(),
    source: z.literal('homebrew'),
    createdAt: z.string(),
    updatedAt: z.string(),
  })

  export const HomebrewSpellSchema = BaseHomebrewSchema.extend({
    type: z.literal('spell'),
    level: z.number().int().min(0).max(9),
    school: z.string(),
    castingTime: z.string(),
    range: z.string(),
    components: z.object({
      verbal: z.boolean().optional(),
      somatic: z.boolean().optional(),
      material: z.string().optional(),
    }).optional(),
    duration: z.string(),
    description: z.string(),
    higherLevels: z.string().optional(),
    classes: z.array(z.string()).optional(),
    concentration: z.boolean().optional(),
    ritual: z.boolean().optional(),
  }).passthrough()

  export const HomebrewMonsterSchema = BaseHomebrewSchema.extend({
    type: z.literal('monster'),
    cr: z.union([z.number(), z.string()]),
    ac: z.number().int().min(0),
    hp: z.number().int().min(1),
    speed: z.union([z.number(), z.object({}).passthrough()]),
    size: z.string(),
    creatureType: z.string(),
    abilityScores: z.object({
      strength: z.number(), dexterity: z.number(), constitution: z.number(),
      intelligence: z.number(), wisdom: z.number(), charisma: z.number(),
    }).optional(),
  }).passthrough()

  export const HomebrewItemSchema = BaseHomebrewSchema.extend({
    type: z.enum(['item', 'magic-item', 'weapon', 'armor', 'tool']),
    weight: z.number().optional(),
    cost: z.string().optional(),
    description: z.string(),
    rarity: z.string().optional(),
  }).passthrough()

  // Add schemas for remaining types: species, class, subclass, background, feat, other
  ```
- Use `.passthrough()` to allow extra fields — homebrew content is inherently flexible

**Step 6 — Integrate Validation on Save**
- Open `src/renderer/src/services/homebrew-validation.ts`
- Replace basic validation with Zod schema validation:
  ```typescript
  export function validateHomebrew(item: unknown): { valid: boolean; errors: string[] } {
    const schema = getSchemaForType(item.type)
    if (!schema) return { valid: true, errors: [] } // unknown types pass through
    const result = schema.safeParse(item)
    if (result.success) return { valid: true, errors: [] }
    return { valid: false, errors: result.error.issues.map(i => i.message) }
  }
  ```
- Show validation errors in the HomebrewCreateModal before saving

### Sub-Phase C: Custom Mechanics Integration (H3)

> **Phase 15 note:** Once Phase 15 lands, the "homebrew displays in library but doesn't work in gameplay" symptom disappears at the read layer — every consumer (Sheet, Builder, In-Game) hydrates from the library and renders the homebrew entry the same as a built-in. The mechanical-effects work below (`feat-mechanics-5e.ts` extension, effect editor, dice formula) is still needed regardless, because those concerns are about *applying* effects, not about reading the data. Run this sub-phase as planned.

**Step 7 — Extend Feat Mechanics for Homebrew**
- Open `src/renderer/src/services/character/feat-mechanics-5e.ts`
- Currently only handles official feats by name matching
- Add a generic homebrew feat effect system:
  ```typescript
  interface HomebrewFeatEffect {
    type: 'ability_bonus' | 'skill_proficiency' | 'damage_resistance' | 'speed_bonus' | 'ac_bonus' | 'custom'
    target?: string  // ability name, skill name, damage type
    value?: number
    description?: string
  }
  ```
- When a homebrew feat has an `effects` array, apply them in the character stat calculation:
  ```typescript
  for (const feat of character.feats) {
    if (feat.source === 'homebrew' && feat.effects) {
      for (const effect of feat.effects) {
        applyHomebrewEffect(effect, stats)
      }
    }
  }
  ```

**Step 8 — Add Effect Editor to HomebrewCreateModal**
- When creating a homebrew feat, add an "Effects" section:
  ```tsx
  <EffectBuilder
    effects={item.effects ?? []}
    onChange={(effects) => updateItem({ effects })}
  />
  ```
- The EffectBuilder provides dropdowns for effect type, target, and value
- This allows homebrew feats to grant ability bonuses, proficiencies, resistances, etc.

**Step 9 — Extend Spell Mechanics for Homebrew**
- Custom spells need to work in the spell casting flow:
  - They should appear in the spell list (already works via data merge)
  - They should be castable (consume spell slots)
  - Damage/healing amounts should be rollable
- Add a `diceFormula` field to homebrew spells: e.g., `"8d6"` for a custom fireball variant
- In the spell casting flow, when casting a homebrew spell, roll the formula and broadcast

### Sub-Phase D: ~~Unify Storage Systems (H4)~~

> **Moved to Phase 15** (Sub-Phase G Step 21 — Homebrew Parity). The merging of `custom-creature-storage` into the unified library/homebrew store is a structural Phase 15 rule: homebrew and built-ins live in the same library store, distinguished only by a `source: 'homebrew'` field. No action in Phase 25; this work happens during Phase 15's sweep.

### Sub-Phase E: Campaign-Scoped Homebrew (M1)

**Step 11 — Add Campaign Association**
- Add `campaignId?: string` to the homebrew item schema:
  ```typescript
  interface HomebrewItem {
    id: string
    name: string
    type: string
    campaignId?: string  // null = global, string = campaign-specific
    // ...
  }
  ```
- When creating homebrew from within a campaign context, auto-set the campaignId
- In `mergeHomebrew()`, filter to include global items + items matching the active campaign

**Step 12 — Campaign Homebrew UI**
- In the library, add a filter: "All Homebrew" / "This Campaign" / "Global Only"
- In the campaign detail page, add a "Campaign Homebrew" section showing associated custom content
- Allow moving homebrew between global and campaign-scoped

### Sub-Phase F: ~~Builder/Sheet Integration (M2)~~

> **Moved to Phase 15** (Sub-Phases B, C, D — Builder / Sheet / Level Up sweeps). Once consumers read from the library via `useLibraryEntry`, homebrew entries (which live in the same library store with `source: 'homebrew'`) become available to every consumer automatically. No data-provider merge step is needed because there's only one source.
>
> The "(Homebrew)" badge in selection modals is a UX nice-to-have — add it as a small enhancement during Phase 15's Builder / Sheet sweeps, not as separate Phase 25 work.

---

## ⚠️ Constraints & Edge Cases

### Export/Import
- **`.dndhomebrew` files are JSON** — same envelope format as other entity exports. The importer should handle both single items and bulk arrays.
- **ID collisions**: When importing, if an item with the same ID already exists, ask: "Replace existing?" or "Import as copy (new ID)?"
- **Cross-version compatibility**: Include a `schemaVersion` in the envelope. If a future version adds required fields, older homebrew files should still import with defaults.

### Validation
- **`.passthrough()` is essential** — homebrew content may have fields the schema doesn't know about. Strict schemas would reject valid creative content. Only validate the structural minimum.
- **Don't prevent saving invalid content** — show warnings but allow save. The user may be in the middle of creating content and want to save a draft.

### Custom Mechanics
- **Effect system must be opt-in** — if a homebrew feat has no `effects` array, it's treated as informational only (current behavior). Only feats with explicit effects get mechanical treatment.
- **Don't break official feats** — the homebrew effect system must not interfere with the hardcoded official feat mechanics in `feat-mechanics-5e.ts`. Check homebrew effects AFTER official feat processing.
- **Dice formulas**: Use the existing `dice-service.ts` for homebrew spell damage rolls. Validate the formula format before rolling.

### Storage Unification
- Moved to Phase 15. See Phase 15 Sub-Phase G Step 21 (Homebrew Parity) and Sub-Phase H Step 22 (load-time migration) for constraints.

### Campaign Scoping
- **Global homebrew must always be available** — campaign-scoped homebrew adds to the global pool, it doesn't replace it.
- **Campaign deletion should NOT delete global homebrew** — only campaign-scoped homebrew gets cleaned up with the campaign.

Begin implementation now. Start with Sub-Phase A (Steps 1-4) for homebrew export/import — this is the most requested feature. Then Sub-Phase B (Steps 5-6) for validation schemas. Sub-Phase C (Steps 7-9) for custom mechanics is the most complex and highest-value improvement.
