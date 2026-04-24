import { describe, expect, it } from 'vitest'

describe('TrapPlacerPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./TrapPlacerPanel')
    expect(mod).toBeDefined()
  })
})
