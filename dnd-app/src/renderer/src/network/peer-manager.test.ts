import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('peer-manager', () => {
  const srcPath = resolve(__dirname, './peer-manager.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports createPeer function', () => {
    expect(src).toContain('export function createPeer')
  })

  it('exports destroyPeer function', () => {
    expect(src).toContain('export function destroyPeer')
  })

  it('exports getPeer function', () => {
    expect(src).toContain('export function getPeer')
  })

  it('exports getPeerId function', () => {
    expect(src).toContain('export function getPeerId')
  })

  it('exports getIceConfig function', () => {
    expect(src).toContain('export function getIceConfig')
  })

  it('exports setIceConfig function', () => {
    expect(src).toContain('export function setIceConfig')
  })

  it('exports setSignalingServer function', () => {
    expect(src).toContain('export function setSignalingServer')
  })

  it('exports generateInviteCode re-export', () => {
    expect(src).toContain('export { generateInviteCode }')
  })
})
