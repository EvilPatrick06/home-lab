import { describe, expect, it } from 'vitest'

describe('SelectionModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SelectionModal')
    expect(mod).toBeDefined()
  })
})
