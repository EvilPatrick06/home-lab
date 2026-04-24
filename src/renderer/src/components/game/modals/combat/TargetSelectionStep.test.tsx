import { describe, expect, it } from 'vitest'

describe('TargetSelectionStep', () => {
  it('can be imported', async () => {
    const mod = await import('./TargetSelectionStep')
    expect(mod).toBeDefined()
  })
})
