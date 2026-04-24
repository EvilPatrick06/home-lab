import { describe, expect, it } from 'vitest'

describe('DMNotesModal', () => {
  it('can be imported', async () => {
    const mod = await import('./DMNotesModal')
    expect(mod).toBeDefined()
  })
})
