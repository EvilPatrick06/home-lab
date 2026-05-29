import { copyFileSync, existsSync } from 'node:fs'

/**
 * Phase 15 — one-time pre-migration snapshot.
 *
 * When a save file is stepped past schema v3 (the v3→v4 Phase 15 boundary), copy it to
 * `<savefile>.pre-phase-15.bak` exactly once so the user can roll back if the ref-shape
 * migration looks wrong. Idempotent: never overwrites an existing `.bak` (the first snapshot
 * is the pristine pre-migration state; subsequent migrations must not clobber it).
 *
 * DORMANT until the v3.0.0 release bumps `CURRENT_SCHEMA_VERSION` to 4 — wire this into the
 * file-load path at the v3→v4 boundary (the loader has the on-disk path; `migrateData` itself
 * is pure and does not). See `migrations.ts`.
 *
 * @returns the `.bak` path if a snapshot was written, or `null` if skipped (already exists,
 *   source missing, or not crossing the v3→v4 boundary).
 */
export function snapshotIfFirstMigration(
  saveFilePath: string,
  fromVersion: number,
  targetVersion: number
): string | null {
  // Only snapshot when actually stepping past v3 (the Phase 15 boundary).
  if (!(fromVersion <= 3 && targetVersion >= 4)) return null
  if (!existsSync(saveFilePath)) return null

  const bakPath = `${saveFilePath}.pre-phase-15.bak`
  if (existsSync(bakPath)) return null // never overwrite the pristine snapshot

  copyFileSync(saveFilePath, bakPath)
  return bakPath
}
