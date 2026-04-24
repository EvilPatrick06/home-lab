import { describe, expect, it } from 'vitest'

describe('HandoutViewerModal', () => {
  it('can be imported', async () => {
    const mod = await import('./HandoutViewerModal')
    expect(mod).toBeDefined()
  })
})
