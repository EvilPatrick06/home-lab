# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 25 of the D&D VTT project.

Phase 25 covers the **Homebrew & Custom Content System**. The foundation exists — creation modal with 13 content types, category-organized storage, data merge with official content, and library display. The critical gaps are **no export/import for homebrew**, **only 3/13 content types have Zod schemas**, **custom mechanics don't function in gameplay**, **dual storage confusion** (homebrew vs custom creatures), and **no campaign-scoped content**.

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
| H2 | Only 3/13 content types have Zod validation schemas | Invalid homebrew can break the app |
| H3 | Custom feats/spells have no mechanical effect | Homebrew displays in library but doesn't work in gameplay |
| H4 | Dual storage systems (homebrew vs custom-creatures) | User confusion, maintenance burden |

### MEDIUM PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| M1 | No campaign-scoped homebrew | All homebrew is global; can't have campaign-specific content |
| M2 | Character builder/sheet doesn't reference homebrew | Custom classes/species not selectable in builder |

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

### Sub-Phase B: Complete Validation Schemas (H2)

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

### Sub-Phase D: Unify Storage Systems (H4)

**Step 10 — Merge Custom Creatures into Homebrew**
- Open `src/main/storage/custom-creature-storage.ts`
- Open `src/main/storage/homebrew-storage.ts`
- Route custom creature saves through the homebrew system:
  ```typescript
  // In custom-creature-storage.ts
  export async function saveCustomCreature(creature: Record<string, unknown>) {
    // Normalize to homebrew format
    const asHomebrew = {
      ...creature,
      type: 'monster',
      source: 'homebrew',
    }
    return homebrewStorage.save('monster', asHomebrew)
  }
  ```
- Maintain backward compatibility: if `custom-creatures/` directory exists, migrate on first load
- Update all references to `custom-creature-storage` to use the unified homebrew system
- Eventually deprecate the `custom-creatures/` directory

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

### Sub-Phase F: Builder/Sheet Integration (M2)

**Step 13 — Include Homebrew in Character Builder**
- Open `src/renderer/src/services/data-provider.ts`
- Verify that `load5eSpecies()`, `load5eClasses()`, `load5eFeats()`, `load5eBackgrounds()` call `mergeHomebrew()` from the data store
- If they don't, add the merge step so homebrew species/classes/backgrounds/feats appear as options in the character builder
- Add a "(Homebrew)" badge next to custom content in selection modals

**Step 14 — Validate Homebrew in Character Builder**
- When a homebrew class/species/background is selected, show a warning:
  ```tsx
  {isHomebrew && (
    <div className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded">
      This is homebrew content. Some features may not have mechanical effects.
    </div>
  )}
  ```
- Still allow selection — don't block, just inform

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
- **Migration path**: When the app starts and finds files in `custom-creatures/`, migrate them to `homebrew/monster/` with the homebrew format. Mark as migrated to avoid re-migration.
- **Don't delete `custom-creatures/`** immediately — keep it for one version cycle, then remove the migration code.

### Campaign Scoping
- **Global homebrew must always be available** — campaign-scoped homebrew adds to the global pool, it doesn't replace it.
- **Campaign deletion should NOT delete global homebrew** — only campaign-scoped homebrew gets cleaned up with the campaign.

Begin implementation now. Start with Sub-Phase A (Steps 1-4) for homebrew export/import — this is the most requested feature. Then Sub-Phase B (Steps 5-6) for validation schemas. Sub-Phase C (Steps 7-9) for custom mechanics is the most complex and highest-value improvement.
