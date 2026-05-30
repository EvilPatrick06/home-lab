import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 28i — wipeAllData() is the Reset-All-Data primitive. Seed a real tmp
// userData dir with fake content + the protected core_books dir, run the wipe,
// and assert which paths are removed vs preserved.

let mockUserData = ''

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => mockUserData) }
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { wipeAllData } from './wipe-storage'

// Mirror of the module's WIPE_DIRS / WIPE_FILES so the test fails loudly if the
// set the implementation wipes ever drifts from what we seed and assert.
const EXPECTED_REMOVED = [
  'characters',
  'campaigns',
  'bastions',
  'bans',
  'game-states',
  'ai-conversations',
  'homebrew',
  'custom-creatures',
  'image-library',
  'map-library',
  'shop-templates',
  'books',
  'settings.json',
  'book-config.json'
]
const PROTECTED = ['core_books']

function seedFile(...segments: string[]): void {
  const path = join(mockUserData, ...segments)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'seed')
}

describe('wipe-storage', () => {
  beforeEach(() => {
    mockUserData = mkdtempSync(join(tmpdir(), 'wipe-storage-'))
  })

  afterEach(() => {
    rmSync(mockUserData, { recursive: true, force: true })
  })

  it('removes every content dir + standalone file and returns the removed list', async () => {
    // Seed a file inside each wipe target dir + the standalone files.
    seedFile('characters', 'hero.json')
    seedFile('campaigns', 'camp.json')
    seedFile('bastions', 'keep.json')
    seedFile('bans', 'campaign.json')
    seedFile('game-states', 'state.json')
    seedFile('ai-conversations', 'chat.json')
    seedFile('homebrew', 'item.json')
    seedFile('custom-creatures', 'beast.json')
    seedFile('image-library', 'img.png')
    seedFile('map-library', 'map.png')
    seedFile('shop-templates', 'shop.json')
    seedFile('books', 'book.pdf')
    seedFile('settings.json')
    seedFile('book-config.json')

    const result = await wipeAllData()

    expect(result.success).toBe(true)
    expect(result.data?.removed).toEqual(EXPECTED_REMOVED)
    for (const name of EXPECTED_REMOVED) {
      expect(existsSync(join(mockUserData, name))).toBe(false)
    }
  })

  it('preserves the protected core_books directory', async () => {
    seedFile('characters', 'hero.json')
    seedFile('core_books', 'PHB.pdf')

    const result = await wipeAllData()

    expect(result.success).toBe(true)
    expect(result.data?.removed).not.toContain('core_books')
    for (const name of PROTECTED) {
      expect(existsSync(join(mockUserData, name))).toBe(true)
    }
    // The protected file content survives intact.
    expect(existsSync(join(mockUserData, 'core_books', 'PHB.pdf'))).toBe(true)
  })

  it('is idempotent — succeeds and reports all targets even when nothing exists', async () => {
    // Fresh tmp userData with no seeded content: rm with force:true tolerates ENOENT.
    const result = await wipeAllData()

    expect(result.success).toBe(true)
    // force:true means a missing path is treated as removed-already, so the
    // full target list is still reported.
    expect(result.data?.removed).toEqual(EXPECTED_REMOVED)
  })

  it('only touches known targets — an unlisted user dir is left alone', async () => {
    seedFile('campaigns', 'camp.json')
    seedFile('some-unknown-dir', 'keep-me.txt')

    const result = await wipeAllData()

    expect(result.success).toBe(true)
    expect(existsSync(join(mockUserData, 'campaigns'))).toBe(false)
    expect(existsSync(join(mockUserData, 'some-unknown-dir', 'keep-me.txt'))).toBe(true)
  })
})
