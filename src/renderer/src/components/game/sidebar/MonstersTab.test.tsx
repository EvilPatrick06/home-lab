import { describe, expect, it } from 'vitest'

describe('MonstersTab', () => {
  it('can be imported', async () => {
    const mod = await import('./MonstersTab')
    expect(mod).toBeDefined()
  })
})
