import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('sound-playback', () => {
  const srcPath = resolve(__dirname, './sound-playback.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports playAmbient function', () => {
    expect(src).toContain('export function playAmbient')
  })

  it('exports stopAmbient function', () => {
    expect(src).toContain('export function stopAmbient')
  })

  it('exports getCurrentAmbient function', () => {
    expect(src).toContain('export function getCurrentAmbient')
  })

  it('exports updateAmbientVolume function', () => {
    expect(src).toContain('export function updateAmbientVolume')
  })

  it('exports fadeAmbient function', () => {
    expect(src).toContain('export function fadeAmbient')
  })

  it('exports playCustomAudio function', () => {
    expect(src).toContain('export function playCustomAudio')
  })

  it('exports stopCustomAudio function', () => {
    expect(src).toContain('export function stopCustomAudio')
  })

  it('exports stopAllCustomAudio function', () => {
    expect(src).toContain('export function stopAllCustomAudio')
  })

  it('exports customOverrides map', () => {
    expect(src).toContain('export const customOverrides')
  })
})
