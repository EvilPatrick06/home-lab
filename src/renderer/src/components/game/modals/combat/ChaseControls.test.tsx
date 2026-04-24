import { describe, expect, it } from 'vitest'

describe('ChaseControls', () => {
  it('can be imported', async () => {
    const mod = await import('./ChaseControls')
    expect(mod).toBeDefined()
  })
})
