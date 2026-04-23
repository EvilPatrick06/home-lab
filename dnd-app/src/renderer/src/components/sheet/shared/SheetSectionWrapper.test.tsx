import { describe, expect, it } from 'vitest'

describe('SheetSectionWrapper', () => {
  it('can be imported', async () => {
    const mod = await import('./SheetSectionWrapper')
    expect(mod).toBeDefined()
  })
})
