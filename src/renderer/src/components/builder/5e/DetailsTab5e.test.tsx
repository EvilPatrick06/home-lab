import { describe, expect, it } from 'vitest'

describe('DetailsTab5e', () => {
  it('can be imported', async () => {
    const mod = await import('./DetailsTab5e')
    expect(mod).toBeDefined()
  })
})
