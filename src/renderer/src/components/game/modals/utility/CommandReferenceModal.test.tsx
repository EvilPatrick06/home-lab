import { describe, expect, it } from 'vitest'

describe('CommandReferenceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CommandReferenceModal')
    expect(mod).toBeDefined()
  })
})
