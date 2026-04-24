import { describe, expect, it } from 'vitest'

describe('GridControlPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./GridControlPanel')
    expect(mod).toBeDefined()
  })
})
