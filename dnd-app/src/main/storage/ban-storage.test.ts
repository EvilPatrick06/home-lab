import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 28i — load/save round-trip against a real tmp userData dir. The module
// resolves its bans dir from electron's app.getPath('userData'); point that at a
// fresh tmp dir per test so we exercise the genuine fs read/write/parse path.

let mockUserData = ''

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => mockUserData) }
}))

import { type BanData, loadBans, saveBans } from './ban-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const OTHER_UUID = 'abcdef01-2345-6789-abcd-ef0123456789'
const INVALID_UUID = 'not-a-uuid'

describe('ban-storage', () => {
  beforeEach(() => {
    mockUserData = mkdtempSync(join(tmpdir(), 'ban-storage-'))
  })

  afterEach(() => {
    rmSync(mockUserData, { recursive: true, force: true })
  })

  describe('saveBans', () => {
    it('rejects an invalid campaign ID', async () => {
      const result = await saveBans(INVALID_UUID, { peerIds: [], names: [] })
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('rejects non-array peerIds / names', async () => {
      const bad = { peerIds: 'nope', names: [] } as unknown as BanData
      const result = await saveBans(VALID_UUID, bad)
      expect(result).toEqual({ success: false, error: 'Invalid peer IDs or names: expected array' })
    })

    it('rejects an over-long peer ID entry', async () => {
      const result = await saveBans(VALID_UUID, { peerIds: ['x'.repeat(65)], names: [] })
      expect(result).toEqual({ success: false, error: 'Invalid peer ID in list' })
    })

    it('rejects too many entries (>1000)', async () => {
      const names = Array.from({ length: 1001 }, (_, i) => `n${i}`)
      const result = await saveBans(VALID_UUID, { peerIds: [], names })
      expect(result).toEqual({ success: false, error: 'Invalid ban data: too many entries' })
    })

    it('rejects a malformed clients entry', async () => {
      const data = {
        peerIds: [],
        names: [],
        // bannedAt must be a number
        clients: [{ clientId: 'c1', lastAlias: 'Bob', bannedAt: 'soon' as unknown as number }]
      }
      const result = await saveBans(VALID_UUID, data)
      expect(result).toEqual({ success: false, error: 'Invalid client entry in list' })
    })

    it('writes the bans file to <userData>/bans/<campaign>.json', async () => {
      const result = await saveBans(VALID_UUID, { peerIds: ['peer-1'], names: ['Gobbo'] })
      expect(result).toEqual({ success: true })
      const path = join(mockUserData, 'bans', `${VALID_UUID}.json`)
      expect(existsSync(path)).toBe(true)
      expect(JSON.parse(await readFile(path, 'utf-8'))).toEqual({ peerIds: ['peer-1'], names: ['Gobbo'] })
    })

    it('omits the clients key from the payload when not provided', async () => {
      await saveBans(VALID_UUID, { peerIds: [], names: [] })
      const parsed = JSON.parse(await readFile(join(mockUserData, 'bans', `${VALID_UUID}.json`), 'utf-8'))
      expect('clients' in parsed).toBe(false)
    })
  })

  describe('loadBans', () => {
    it('rejects an invalid campaign ID with an empty default shape', async () => {
      const result = await loadBans(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID', data: { peerIds: [], names: [] } })
    })

    it('returns the empty default shape when the file is missing', async () => {
      const result = await loadBans(OTHER_UUID)
      expect(result).toEqual({ success: true, data: { peerIds: [], names: [] } })
    })

    it('round-trips peerIds, names and clients through save → load', async () => {
      const data: BanData = {
        peerIds: ['peer-1', 'peer-2'],
        names: ['Gobbo', 'Kobold'],
        clients: [{ clientId: 'c1', lastAlias: 'Bob', bannedAt: 1700000000000 }]
      }
      expect((await saveBans(VALID_UUID, data)).success).toBe(true)

      const loaded = await loadBans(VALID_UUID)
      expect(loaded.success).toBe(true)
      expect(loaded.data).toEqual(data)
    })

    it('handles malformed JSON gracefully (returns empty default)', async () => {
      const dir = join(mockUserData, 'bans')
      await mkdir(dir, { recursive: true })
      writeFileSync(join(dir, `${VALID_UUID}.json`), '{ this is not json')

      const result = await loadBans(VALID_UUID)
      expect(result).toEqual({ success: true, data: { peerIds: [], names: [] } })
    })

    it('coerces non-array peerIds / names in the stored file to empty arrays', async () => {
      const dir = join(mockUserData, 'bans')
      await mkdir(dir, { recursive: true })
      writeFileSync(join(dir, `${VALID_UUID}.json`), JSON.stringify({ peerIds: 'oops', names: 42 }))

      const result = await loadBans(VALID_UUID)
      expect(result).toEqual({ success: true, data: { peerIds: [], names: [] } })
    })

    it('drops invalid client entries while keeping valid ones', async () => {
      const dir = join(mockUserData, 'bans')
      await mkdir(dir, { recursive: true })
      writeFileSync(
        join(dir, `${VALID_UUID}.json`),
        JSON.stringify({
          peerIds: [],
          names: [],
          clients: [
            { clientId: 'good', lastAlias: 'Ok', bannedAt: 1 },
            { clientId: 'bad', lastAlias: 'Missing bannedAt' },
            'totally-wrong'
          ]
        })
      )

      const result = await loadBans(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data?.clients).toEqual([{ clientId: 'good', lastAlias: 'Ok', bannedAt: 1 }])
    })
  })
})
