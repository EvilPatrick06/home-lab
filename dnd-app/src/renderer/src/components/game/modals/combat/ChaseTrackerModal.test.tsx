import { describe, expect, it } from 'vitest'

describe('ChaseTrackerModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ChaseTrackerModal')
    expect(mod).toBeDefined()
  })
})
