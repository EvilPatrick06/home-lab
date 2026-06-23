import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInside } from './path-guard'

describe('isPathInside (path-component boundary containment)', () => {
  const base = '/plugins/myplugin'

  it('accepts the base dir itself', () => {
    expect(isPathInside(base, base)).toBe(true)
  })

  it('accepts a file inside the base dir', () => {
    expect(isPathInside(base, join(base, 'data', 'x.json'))).toBe(true)
  })

  it('rejects a sibling dir sharing the base name as a prefix', () => {
    // The bare-startsWith bug: "/plugins/myplugin-evil" begins with the base.
    expect(isPathInside(base, '/plugins/myplugin-evil/secret.json')).toBe(false)
  })

  it('rejects traversal out of the base via ..', () => {
    expect(isPathInside(base, join(base, '..', 'myplugin-x', 'f.json'))).toBe(false)
    expect(isPathInside(base, '/plugins/other/f.json')).toBe(false)
  })
})
