import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('level-up-spells', () => {
  it('can be imported', async () => {
    const mod = await import('./level-up-spells')
    expect(mod).toBeDefined()
  })

  it('exports toSpellEntry function', async () => {
    const mod = await import('./level-up-spells')
    expect(mod.toSpellEntry).toBeDefined()
    expect(typeof mod.toSpellEntry).toBe('function')
  })

  it('exports resolveLevelUpSpells function', async () => {
    const mod = await import('./level-up-spells')
    expect(mod.resolveLevelUpSpells).toBeDefined()
    expect(typeof mod.resolveLevelUpSpells).toBe('function')
  })

  it('toSpellEntry converts raw spell data to SpellEntry', async () => {
    const { toSpellEntry } = await import('./level-up-spells')
    const raw = {
      id: 'fireball',
      name: 'Fireball',
      level: 3,
      description: 'A bright streak flashes...',
      castingTime: '1 action',
      range: '150 feet',
      duration: 'Instantaneous',
      components: 'V, S, M',
      school: 'evocation',
      concentration: false,
      ritual: false,
      classes: ['wizard', 'sorcerer']
    }
    const entry = toSpellEntry(raw)
    expect(entry.id).toBe('fireball')
    expect(entry.name).toBe('Fireball')
    expect(entry.level).toBe(3)
    expect(entry.school).toBe('evocation')
  })

  it('toSpellEntry accepts optional extra source/prepared', async () => {
    const { toSpellEntry } = await import('./level-up-spells')
    const raw = {
      id: 'test',
      name: 'Test',
      level: 0,
      description: 'Test spell'
    }
    const entry = toSpellEntry(raw, { source: 'species', prepared: true })
    expect(entry.source).toBe('species')
    expect(entry.prepared).toBe(true)
  })
})
