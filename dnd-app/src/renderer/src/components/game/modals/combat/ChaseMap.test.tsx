import { describe, expect, it } from 'vitest'

describe('ChaseMap', () => {
  it('can be imported', async () => {
    const mod = await import('./ChaseMap')
    expect(mod).toBeDefined()
  })
})
