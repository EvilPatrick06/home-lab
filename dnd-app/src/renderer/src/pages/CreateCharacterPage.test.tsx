import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('CreateCharacterPage', () => {
  it('module file exists', () => {
    const filePath = resolve(__dirname, 'CreateCharacterPage.tsx')
    expect(existsSync(filePath)).toBe(true)
  })
})
