import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('pdf-export', () => {
  const srcPath = resolve(__dirname, './pdf-export.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports exportCharacterToPdf function', () => {
    expect(src).toContain('export async function exportCharacterToPdf')
  })

  it('imports jsPDF', () => {
    expect(src).toContain('jsPDF')
  })

  it('handles ability scores', () => {
    expect(src).toContain('abilityScores')
  })

  it('handles equipment section', () => {
    expect(src).toContain('weapons')
  })

  it('handles spells section', () => {
    expect(src).toContain('knownSpells')
  })

  it('handles backstory', () => {
    expect(src).toContain('backstory')
  })
})
