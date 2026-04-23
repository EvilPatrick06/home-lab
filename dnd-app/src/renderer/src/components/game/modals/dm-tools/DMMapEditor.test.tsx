import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('DMMapEditor', () => {
  it('module file exists', () => {
    expect(existsSync(resolve(__dirname, './DMMapEditor.tsx'))).toBe(true)
  })
})
