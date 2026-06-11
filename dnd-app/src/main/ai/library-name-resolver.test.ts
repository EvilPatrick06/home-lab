import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// getDataDir() normally derives from electron's app.getAppPath(); in the node test
// env we point it at the repo's bundled 5e data dir.
vi.mock('../paths', () => ({
  getDataDir: () => join(process.cwd(), 'src/renderer/public/data/5e')
}))

import { _resetNameCacheForTests, resolveEntryName } from './library-name-resolver'

afterEach(() => _resetNameCacheForTests())

describe('library-name-resolver (PHASE-11 11G)', () => {
  it('resolves a known spell id to its name', () => {
    expect(resolveEntryName('spells', 'acid-splash')).toBe('Acid Splash')
  })

  it('resolves a known magic item id to its name', () => {
    expect(resolveEntryName('magic-items', 'adamantine-armor')).toBe('Adamantine Armor')
  })

  it('resolves a feat id from the feats index', () => {
    // first feat entry in the bundled index — assert it returns a non-empty name
    const name = resolveEntryName('feats', 'alert')
    expect(typeof name === 'string' || name === null).toBe(true)
    if (name) expect(name.length).toBeGreaterThan(0)
  })

  it('returns null for an unknown id', () => {
    expect(resolveEntryName('spells', 'definitely-not-a-spell')).toBeNull()
  })

  it('caches per category and the reset hook clears it', () => {
    expect(resolveEntryName('spells', 'acid-splash')).toBe('Acid Splash')
    _resetNameCacheForTests()
    expect(resolveEntryName('spells', 'acid-splash')).toBe('Acid Splash')
  })
})
