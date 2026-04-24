import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('character-details-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./character-details-slice')
    expect(mod).toBeDefined()
  })

  it('exports createCharacterDetailsSlice', async () => {
    const mod = await import('./character-details-slice')
    expect(mod.createCharacterDetailsSlice).toBeDefined()
    expect(typeof mod.createCharacterDetailsSlice).toBe('function')
  })

  it('exports DEFAULT_CHARACTER_DETAILS', async () => {
    const mod = await import('./character-details-slice')
    expect(mod.DEFAULT_CHARACTER_DETAILS).toBeDefined()
    expect(typeof mod.DEFAULT_CHARACTER_DETAILS).toBe('object')
  })

  it('DEFAULT_CHARACTER_DETAILS has expected default values', async () => {
    const { DEFAULT_CHARACTER_DETAILS } = await import('./character-details-slice')
    expect(DEFAULT_CHARACTER_DETAILS.characterName).toBe('')
    expect(DEFAULT_CHARACTER_DETAILS.iconType).toBe('letter')
    expect(DEFAULT_CHARACTER_DETAILS.speciesSize).toBe('Medium')
    expect(DEFAULT_CHARACTER_DETAILS.speciesSpeed).toBe(30)
    expect(DEFAULT_CHARACTER_DETAILS.maxSkills).toBe(2)
    expect(DEFAULT_CHARACTER_DETAILS.customModal).toBeNull()
    expect(Array.isArray(DEFAULT_CHARACTER_DETAILS.selectedSkills)).toBe(true)
    expect(Array.isArray(DEFAULT_CHARACTER_DETAILS.chosenLanguages)).toBe(true)
    expect(DEFAULT_CHARACTER_DETAILS.currency).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 })
  })
})
