import { describe, expect, it } from 'vitest'

describe('TokenEditorModal', () => {
  it('can be imported', async () => {
    const mod = await import('./TokenEditorModal')
    expect(mod).toBeDefined()
  })
})
