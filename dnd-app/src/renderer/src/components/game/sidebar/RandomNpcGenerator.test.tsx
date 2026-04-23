import { describe, expect, it } from 'vitest'

describe('RandomNpcGenerator', () => {
  it('can be imported', async () => {
    const mod = await import('./RandomNpcGenerator')
    expect(mod).toBeDefined()
  })
})
