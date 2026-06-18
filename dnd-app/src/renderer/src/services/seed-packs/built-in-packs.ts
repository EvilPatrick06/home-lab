/**
 * PHASE-37 37B — load the bundled starter packs through the data-provider façade (so the library
 * boundary test stays happy — no raw public/data import). Invalid packs are warned + skipped, never thrown.
 */

import { logger } from '../../utils/logger'
import { loadJson } from '../data-provider'
import { parseSeedPack, type SeedPack } from './seed-pack-schema'

interface PackIndex {
  packs: Array<{ id: string; file: string }>
}

let cachedPacks: SeedPack[] | null = null

export async function loadBuiltInSeedPacks(): Promise<SeedPack[]> {
  if (cachedPacks) return cachedPacks
  try {
    const index = await loadJson<PackIndex>('./data/5e/seed-packs/index.json')
    const packs: SeedPack[] = []
    for (const entry of index.packs ?? []) {
      if (!entry.file || entry.file.includes('/')) {
        logger.warn(`[seed-packs] skipping suspicious file entry: ${entry.file}`)
        continue
      }
      try {
        const raw = await loadJson<unknown>(`./data/5e/seed-packs/${entry.file}`)
        const parsed = parseSeedPack(raw)
        if (parsed.ok) packs.push(parsed.pack)
        else logger.warn(`[seed-packs] ${entry.file} failed validation: ${parsed.error}`)
      } catch (err) {
        logger.warn(`[seed-packs] could not load ${entry.file}: ${String(err)}`)
      }
    }
    cachedPacks = packs
    return packs
  } catch {
    return [] // index missing/unreadable → no built-ins (matches loadAdventures' catch)
  }
}
