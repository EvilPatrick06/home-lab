import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('game-action-executor', () => {
  const srcPath = resolve(__dirname, './game-action-executor.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports executeDmActions function', () => {
    expect(src).toContain('export function executeDmActions')
  })

  it('exports registerPluginDmAction function', () => {
    expect(src).toContain('export function registerPluginDmAction')
  })

  it('exports unregisterPluginDmAction function', () => {
    expect(src).toContain('export function unregisterPluginDmAction')
  })

  it('exports DmAction type', () => {
    expect(src).toContain('export type { DmAction')
  })

  it('exports ExecutionResult type', () => {
    expect(src).toContain('ExecutionResult')
  })

  it('defines MAX_ACTIONS_PER_BATCH constant', () => {
    expect(src).toContain('MAX_ACTIONS_PER_BATCH')
  })
})
