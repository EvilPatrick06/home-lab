import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('InGamePage', () => {
  it('module file exists', () => {
    const filePath = resolve(__dirname, 'InGamePage.tsx')
    expect(existsSync(filePath)).toBe(true)
  })
})
