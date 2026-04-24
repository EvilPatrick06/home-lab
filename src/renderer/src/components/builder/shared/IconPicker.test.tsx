import { describe, expect, it } from 'vitest'

describe('IconPicker', () => {
  it('can be imported', async () => {
    const mod = await import('./IconPicker')
    expect(mod).toBeDefined()
  })
})
