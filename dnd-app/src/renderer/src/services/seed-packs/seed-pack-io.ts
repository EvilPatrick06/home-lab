/**
 * PHASE-37 37B — `.dndseed` file export/import through the standard entity-io envelope.
 * Import also accepts a bare (un-enveloped) pack JSON via entity-io's bare-object fallback, so
 * hand-authored packs work without the wrapper.
 */

import { exportEntities, importEntities } from '../io/entity-io'
import { parseSeedPack, type SeedPack } from './seed-pack-schema'

export async function exportSeedPackToFile(pack: SeedPack): Promise<boolean> {
  return exportEntities('seedpack', [pack])
}

/** Returns null when the user cancels the dialog; throws Error(parse.error) on an invalid pack. */
export async function importSeedPackFromFile(): Promise<SeedPack | null> {
  const result = await importEntities<unknown>('seedpack')
  if (!result) return null
  const parsed = parseSeedPack(result.items[0])
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.pack
}
