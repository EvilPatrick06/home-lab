import { describe, expect, it } from 'vitest'

describe('MountModal', () => {
  it('can be imported', async () => {
    const mod = await import('./MountModal')
    expect(mod).toBeDefined()
  })
})
