import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('CharacterSheet5ePage', () => {
  it('module file exists', () => {
    expect(existsSync(resolve(__dirname, './CharacterSheet5ePage.tsx'))).toBe(true)
  })
})
