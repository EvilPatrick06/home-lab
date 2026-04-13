import { describe, expect, it } from 'vitest'

describe('RollTableModal', () => {
  it('can be imported', async () => {
    const mod = await import('./RollTableModal')
    expect(mod).toBeDefined()
  })

  it('exports a default function component', async () => {
    const mod = await import('./RollTableModal')
    expect(typeof mod.default).toBe('function')
  })
})
