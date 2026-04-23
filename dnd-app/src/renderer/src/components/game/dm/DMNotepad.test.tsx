import { describe, expect, it } from 'vitest'

describe('DMNotepad', () => {
  it('can be imported', async () => {
    const mod = await import('./DMNotepad')
    expect(mod).toBeDefined()
  })
})
