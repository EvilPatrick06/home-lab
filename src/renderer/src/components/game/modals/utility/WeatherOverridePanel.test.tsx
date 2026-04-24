import { describe, expect, it } from 'vitest'

describe('WeatherOverridePanel', () => {
  it('can be imported', async () => {
    const mod = await import('./WeatherOverridePanel')
    expect(mod).toBeDefined()
  })
})
