import { describe, expect, it } from 'vitest'

describe('SectionBanner', () => {
  it('can be imported', async () => {
    const mod = await import('./SectionBanner')
    expect(mod).toBeDefined()
  })
})
