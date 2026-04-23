import { describe, expect, it } from 'vitest'

describe('DefendersTab', () => {
  it('can be imported', async () => {
    const mod = await import('./DefendersTab')
    expect(mod).toBeDefined()
  })
})
