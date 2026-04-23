import { describe, expect, it } from 'vitest'

describe('DowntimeModal', () => {
  it('can be imported', async () => {
    const mod = await import('./DowntimeModal')
    expect(mod).toBeDefined()
  })
})
