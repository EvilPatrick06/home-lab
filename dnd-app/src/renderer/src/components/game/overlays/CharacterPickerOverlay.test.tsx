import { describe, expect, it } from 'vitest'

describe('CharacterPickerOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterPickerOverlay')
    expect(mod).toBeDefined()
  })
})
