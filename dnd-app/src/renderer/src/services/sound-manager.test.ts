import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('sound-manager', () => {
  const srcPath = resolve(__dirname, './sound-manager.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports init function', () => {
    expect(src).toContain('export function init')
  })

  it('exports reinit function', () => {
    expect(src).toContain('export function reinit')
  })

  it('exports play function', () => {
    expect(src).toContain('export function play')
  })

  it('exports setEnabled function', () => {
    expect(src).toContain('export function setEnabled')
  })

  it('exports setMuted function', () => {
    expect(src).toContain('export function setMuted')
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

  it('exports playConditionSound function', () => {
    expect(src).toContain('export function playConditionSound')
  })

  it('exports playSpellSound function', () => {
    expect(src).toContain('export function playSpellSound')
  })

  it('exports playDiceSound function', () => {
    expect(src).toContain('export function playDiceSound')
  })

  it('exports fadeAmbient function', () => {
    expect(src).toContain('export function fadeAmbient')
  })

  it('exports preloadEssential function', () => {
    expect(src).toContain('export function preloadEssential')
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

  it('exports SoundEvent type', () => {
    expect(src).toContain('export type SoundEvent')
  })

  it('exports AmbientSound type', () => {
    expect(src).toContain('export type AmbientSound')
  })
})

describe('sound packaging (SND-1 regression)', () => {
  // The `!out/renderer/sounds/**/*` electron-builder exclusion shipped installers
  // WITHOUT the 130 bundled MP3s, so every sound effect 404'd
  // (net::ERR_FILE_NOT_FOUND) whenever the Pi was cold/unreachable —
  // resolveSoundUrl falls back to the bundled `./sounds/...` path, which then
  // pointed at files that weren't in the package. Guard against re-introducing it.
  it('does not exclude bundled sounds from the electron-builder package', () => {
    const pkgPath = resolve(__dirname, '../../../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { build?: { files?: string[] } }
    const files = pkg.build?.files ?? []
    const excludesSounds = files.some((f) => f.startsWith('!') && f.includes('out/renderer/sounds'))
    expect(excludesSounds).toBe(false)
  })

  it('ships the bundled sound files in source', () => {
    const soundsDir = resolve(__dirname, '../../public/sounds')
    expect(existsSync(soundsDir)).toBe(true)
  })
})
