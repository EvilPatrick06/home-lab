import { describe, expect, it } from 'vitest'

describe('RollerEntityBlock', () => {
  it('can be imported', async () => {
    const mod = await import('./RollerEntityBlock')
    expect(mod).toBeDefined()
  })
})
