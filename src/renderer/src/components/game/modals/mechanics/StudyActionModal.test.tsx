import { describe, expect, it } from 'vitest'

describe('StudyActionModal', () => {
  it('can be imported', async () => {
    const mod = await import('./StudyActionModal')
    expect(mod).toBeDefined()
  })
})
