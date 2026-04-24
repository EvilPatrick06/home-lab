import { describe, expect, it, vi } from 'vitest'
import {
  assertCommandNameFormat,
  assertCommandShape,
  assertUniqueCommandNames,
  createCommandContext
} from '../../test-helpers'

vi.mock('../../services/sound-manager', () => ({
  setMuted: vi.fn(),
  setEnabled: vi.fn(),
  setVolume: vi.fn(),
  setAmbientVolume: vi.fn(),
  playAmbient: vi.fn(),
  stopAmbient: vi.fn(),
  getCurrentAmbient: vi.fn(() => null),
  getAllAmbientSounds: vi.fn(() => ['ambient-tavern', 'ambient-forest', 'ambient-rain'])
}))

import { commands } from './commands-dm-sound'

describe('commands-dm-sound', () => {
  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('each command has required fields', () => {
    assertCommandShape(commands)
  })

  it('each command has aliases array, usage string, category, and dmOnly flag', () => {
    assertCommandShape(commands)
  })

  it('command names are unique', () => {
    assertUniqueCommandNames(commands)
  })

  it('command names are lowercase strings without leading slash', () => {
    assertCommandNameFormat(commands)
  })

  it('contains the sound command', () => {
    const sound = commands.find((c) => c.name === 'sound')
    expect(sound).toBeDefined()
    expect(sound!.dmOnly).toBe(true)
    expect(sound!.category).toBe('dm')
    expect(sound!.aliases).toContain('sfx')
  })

  it('sound mute subcommand returns system message', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('mute', createCommandContext())
    expect(result).toEqual({ type: 'system', content: 'Sound muted.' })
  })

  it('sound unmute subcommand returns system message', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('unmute', createCommandContext())
    expect(result).toEqual({ type: 'system', content: 'Sound unmuted.' })
  })

  it('sound on subcommand enables sound', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('on', createCommandContext())
    expect(result).toEqual({ type: 'system', content: 'Sound effects enabled.' })
  })

  it('sound off subcommand disables sound', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('off', createCommandContext())
    expect(result).toEqual({ type: 'system', content: 'Sound effects disabled.' })
  })

  it('sound volume subcommand sets volume', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('volume 0.5', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('50%') })
  })

  it('sound volume subcommand rejects invalid values', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('volume 2.0', createCommandContext())
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('0.0-1.0') })
  })

  it('sound ambientvolume subcommand sets ambient volume', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('ambientvolume 0.8', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('80%') })
  })

  it('sound ambientvolume subcommand rejects invalid values', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('ambientvolume -1', createCommandContext())
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('0.0-1.0') })
  })

  it('sound ambient without name shows current/available', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('ambient', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Available') })
  })

  it('sound ambient with valid name plays ambient', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('ambient tavern', createCommandContext())
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('tavern') })
  })

  it('sound ambient with invalid name returns error', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('ambient volcano', createCommandContext())
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Unknown ambient') })
  })

  it('sound stop subcommand stops ambient', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('stop', createCommandContext())
    expect(result).toEqual({ type: 'system', content: 'Ambient sound stopped.' })
  })

  it('sound with unknown subcommand returns usage', () => {
    const sound = commands.find((c) => c.name === 'sound')!
    const result = sound.execute('badarg', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Usage') })
  })
})
