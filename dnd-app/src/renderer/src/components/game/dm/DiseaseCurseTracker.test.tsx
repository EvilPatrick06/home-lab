import { describe, expect, it } from 'vitest'

describe('DiseaseCurseTracker', () => {
  it('can be imported', async () => {
    const mod = await import('./DiseaseCurseTracker')
    expect(mod).toBeDefined()
  })
})
