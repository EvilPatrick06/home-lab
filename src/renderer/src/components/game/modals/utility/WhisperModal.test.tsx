import { describe, expect, it } from 'vitest'

describe('WhisperModal', () => {
  it('can be imported', async () => {
    const mod = await import('./WhisperModal')
    expect(mod).toBeDefined()
  })
})
