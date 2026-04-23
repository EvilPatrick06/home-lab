import { describe, expect, it } from 'vitest'

describe('AoETemplateModal', () => {
  it('can be imported', async () => {
    const mod = await import('./AoETemplateModal')
    expect(mod).toBeDefined()
  })
})
