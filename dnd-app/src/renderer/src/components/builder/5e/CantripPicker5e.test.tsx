import { describe, expect, it } from 'vitest'

describe('CantripPicker5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CantripPicker5e')
    expect(mod).toBeDefined()
  })
})
