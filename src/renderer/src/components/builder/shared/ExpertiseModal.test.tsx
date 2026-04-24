import { describe, expect, it } from 'vitest'

describe('ExpertiseModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ExpertiseModal')
    expect(mod).toBeDefined()
  })
})
