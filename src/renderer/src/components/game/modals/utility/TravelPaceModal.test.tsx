import { describe, expect, it } from 'vitest'

describe('TravelPaceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./TravelPaceModal')
    expect(mod).toBeDefined()
  })
})
