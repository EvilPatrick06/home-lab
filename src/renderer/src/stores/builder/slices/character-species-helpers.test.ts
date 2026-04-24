import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('character-species-helpers', () => {
  it('can be imported', async () => {
    const mod = await import('./character-species-helpers')
    expect(mod).toBeDefined()
  })

  it('exports getSpeciesResistances as a function', async () => {
    const mod = await import('./character-species-helpers')
    expect(typeof mod.getSpeciesResistances).toBe('function')
  })

  it('exports getSpeciesSenses as a function', async () => {
    const mod = await import('./character-species-helpers')
    expect(typeof mod.getSpeciesSenses).toBe('function')
  })

  it('getSpeciesResistances returns array', async () => {
    const mod = await import('./character-species-helpers')
    const result = mod.getSpeciesResistances('aasimar')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('necrotic')
    expect(result).toContain('radiant')
  })

  it('getSpeciesResistances returns empty array for unknown species', async () => {
    const mod = await import('./character-species-helpers')
    const result = mod.getSpeciesResistances('unknown-species')
    expect(result).toEqual([])
  })

  it('getSpeciesSenses returns array', async () => {
    const mod = await import('./character-species-helpers')
    const result = mod.getSpeciesSenses('dwarf')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toContain('Darkvision 120 ft')
  })

  it('getSpeciesSenses returns empty array for human', async () => {
    const mod = await import('./character-species-helpers')
    const result = mod.getSpeciesSenses('human')
    expect(result).toEqual([])
  })
})
