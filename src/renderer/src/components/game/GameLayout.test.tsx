import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('GameLayout', () => {
  it('module file exists', () => {
    const filePath = resolve(__dirname, 'GameLayout.tsx')
    expect(existsSync(filePath)).toBe(true)
  })
})
