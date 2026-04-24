import { describe, expect, it } from 'vitest'

describe('ShortcutReferenceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ShortcutReferenceModal')
    expect(mod).toBeDefined()
  })
})
