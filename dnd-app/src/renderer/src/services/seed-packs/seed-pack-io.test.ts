import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const writeFile = vi.fn(async (_path: string, _content: string) => {})
const readFile = vi.fn(async () => '{}')
const showSaveDialog = vi.fn(async () => '/fake/export.dndseed')
const showOpenDialog = vi.fn(async () => '/fake/import.dndseed')
vi.stubGlobal('window', { api: { showSaveDialog, showOpenDialog, writeFile, readFile } })
vi.stubGlobal('crypto', { randomUUID: () => 'seed-uuid' })

import { exportSeedPackToFile, importSeedPackFromFile } from './seed-pack-io'
import type { SeedPack } from './seed-pack-schema'

const PACK: SeedPack = {
  format: 'dnd-vtt-seed-pack',
  formatVersion: 1,
  id: 'p1',
  name: 'Pack',
  description: 'd',
  system: 'dnd5e',
  lore: [{ id: 'l1', title: 'T', content: 'C', category: 'world' }],
  extensions: { custom: 'kept' }
}

beforeEach(() => vi.clearAllMocks())

describe('seed-pack-io (PHASE-37 37B)', () => {
  it('export writes an envelope with type "seedpack" containing the pack', async () => {
    const ok = await exportSeedPackToFile(PACK)
    expect(ok).toBe(true)
    const written = writeFile.mock.calls[0][1] as string
    const env = JSON.parse(written)
    expect(env.type).toBe('seedpack')
    const data = Array.isArray(env.data) ? env.data[0] : env.data
    expect(data.extensions.custom).toBe('kept') // forward fields survive
  })

  it('import of a valid envelope returns the parsed pack', async () => {
    readFile.mockResolvedValue(
      JSON.stringify({ version: 1, schemaVersion: 1, type: 'seedpack', exportedAt: 'x', count: 1, data: [PACK] })
    )
    const pack = await importSeedPackFromFile()
    expect(pack?.id).toBe('p1')
  })

  it('import of a bare (un-enveloped) pack JSON also works', async () => {
    readFile.mockResolvedValue(JSON.stringify(PACK))
    const pack = await importSeedPackFromFile()
    expect(pack?.name).toBe('Pack')
  })

  it('import of a newer formatVersion throws the upgrade message', async () => {
    readFile.mockResolvedValue(JSON.stringify({ ...PACK, formatVersion: 2 }))
    await expect(importSeedPackFromFile()).rejects.toThrow(/newer app version/i)
  })

  it('a cancelled open dialog returns null', async () => {
    showOpenDialog.mockResolvedValue(null as never)
    expect(await importSeedPackFromFile()).toBeNull()
  })
})
