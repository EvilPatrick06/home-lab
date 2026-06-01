import { describe, expect, it, vi } from 'vitest'

// The module imports useLibraryStore at the top; stub window.api so importing it
// under the node test env doesn't throw (matches the shard/store test pattern).
// getEffectivePreparedSpellIds itself reads only the character, not the library.
vi.stubGlobal('window', { api: { storage: {}, game: {} } })

import { getEffectiveClasses, getEffectivePreparedSpellIds } from './effective-character-5e'

type Char = Parameters<typeof getEffectivePreparedSpellIds>[0]

function char(knownSpellRefs: unknown, preparedSpellIds: unknown): Char {
  return { knownSpellRefs, state: { preparedSpellIds } } as unknown as Char
}

describe('getEffectivePreparedSpellIds', () => {
  it('maps prepared instanceIds to their entryIds via knownSpellRefs', () => {
    const c = char(
      [
        { instanceId: 'i1', ref: { entryId: 'fireball' } },
        { instanceId: 'i2', ref: { entryId: 'shield' } }
      ],
      { i1: true, i2: false }
    )
    expect(getEffectivePreparedSpellIds(c)).toEqual(['fireball'])
  })

  // Regression guard for the SpellPrepModal preparedSet memo: the result depends
  // on knownSpellRefs, so it must change when the known-spell mapping changes even
  // if state.preparedSpellIds is byte-identical (the dep that was missing).
  it('reflects a knownSpellRefs change even when preparedSpellIds is unchanged', () => {
    const prepared = { i1: true }
    const before = char([{ instanceId: 'i1', ref: { entryId: 'fireball' } }], prepared)
    expect(getEffectivePreparedSpellIds(before)).toEqual(['fireball'])

    const after = char([{ instanceId: 'i1', ref: { entryId: 'magic-missile' } }], prepared)
    expect(getEffectivePreparedSpellIds(after)).toEqual(['magic-missile'])
  })

  it('returns [] when state.preparedSpellIds is absent', () => {
    const c = char([{ instanceId: 'i1', ref: { entryId: 'fireball' } }], undefined)
    expect(getEffectivePreparedSpellIds(c)).toEqual([])
  })

  it('returns [] when knownSpellRefs is absent', () => {
    expect(getEffectivePreparedSpellIds(char(undefined, { i1: true }))).toEqual([])
  })

  it('skips prepared instanceIds that no longer resolve to a known spell', () => {
    const c = char([{ instanceId: 'i1', ref: { entryId: 'fireball' } }], { i1: true, ghost: true })
    expect(getEffectivePreparedSpellIds(c)).toEqual(['fireball'])
  })
})

describe('getEffectiveClasses hit die (CHR-1)', () => {
  // The library store has no classes loaded in the node test env, so
  // getEffectiveClasses falls back to ref.overrides — exactly the shape class
  // library entries use (coreTraits.hitPointDie is a STRING like "D12").
  function classChar(overrides: unknown): Parameters<typeof getEffectiveClasses>[0] {
    return { classRefs: [{ level: 1, ref: { entryId: 'barbarian', overrides } }] } as unknown as Parameters<
      typeof getEffectiveClasses
    >[0]
  }

  it('parses a "D12" hitPointDie string to 12 (was printing 1d10)', () => {
    const c = classChar({ name: 'Barbarian', coreTraits: { hitPointDie: 'D12' } })
    expect(getEffectiveClasses(c)[0].hitDie).toBe(12)
  })

  it('accepts a numeric hitDie and defaults to 10 when no die info is present', () => {
    expect(getEffectiveClasses(classChar({ hitDie: 8 }))[0].hitDie).toBe(8)
    expect(getEffectiveClasses(classChar({ name: 'Mystery' }))[0].hitDie).toBe(10)
  })
})
