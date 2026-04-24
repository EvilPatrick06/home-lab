import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('game-sync', () => {
  it('module file exists', () => {
    expect(existsSync(resolve(__dirname, './game-sync.ts'))).toBe(true)
  })

  it('exports startGameSync function', async () => {
    // Verify exported function names via static analysis
    const fs = await import('fs')
    const src = fs.readFileSync(resolve(__dirname, './game-sync.ts'), 'utf-8')
    expect(src).toContain('export function startGameSync')
  })

  it('exports stopGameSync function', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(resolve(__dirname, './game-sync.ts'), 'utf-8')
    expect(src).toContain('export function stopGameSync')
  })

  it('exports buildFullGameStatePayload function', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(resolve(__dirname, './game-sync.ts'), 'utf-8')
    expect(src).toContain('export async function buildFullGameStatePayload')
  })
})
