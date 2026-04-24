import { describe, expect, it } from 'vitest'

describe('MulticlassAdvisor', () => {
  it('can be imported', async () => {
    const mod = await import('./MulticlassAdvisor')
    expect(mod).toBeDefined()
  })
})
