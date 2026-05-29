import { migrateCharacter5eToRefs } from '../../../shared/migrations/v4-character-refs'
import type { Character5e, Character5eV3 } from './character-5e'

// Phase 15c.5 — the canonical `Character5e` is v4 (refs + state). This shim is the single
// chokepoint that converts the legacy v3 inline-array shape (`Character5eV3`) into v4: it
// DERIVES the ref + state fields, then deletes the v3 inline arrays so they never reach the
// persisted/canonical shape. Used on load (`use-character-store`) and after builder/level-up/
// rest produce v3-shaped output.
//
// Phase 15h — the conversion logic now lives in the shared, main-process-safe core
// `src/shared/migrations/v4-character-refs.ts` (so `MIGRATIONS[4]` / `BACKUP_MIGRATIONS[4]`
// reuse it). This wrapper just applies the renderer types. The tests in
// `character-5e-migration.test.ts` guard the shared logic via this entry point.

export function migrateCharacter5eFromV3ToV4(character: Character5eV3): Character5e {
  return migrateCharacter5eToRefs(character as unknown as Record<string, unknown>) as unknown as Character5e
}
