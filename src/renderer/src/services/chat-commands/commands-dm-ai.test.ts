import { describe, expect, it, vi } from 'vitest'
import {
  assertCommandNameFormat,
  assertCommandShape,
  assertUniqueCommandNames,
  createCommandContext
} from '../../test-helpers'

vi.mock('../../stores/use-ai-dm-store', () => ({
  useAiDmStore: {
    getState: vi.fn(() => ({
      paused: false,
      messages: [],
      sceneStatus: 'exploration',
      setPaused: vi.fn(),
      clearMessages: vi.fn()
    }))
  }
}))

import { commands } from './commands-dm-ai'

describe('commands-dm-ai', () => {
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

  it('contains the dm command', () => {
    const dm = commands.find((c) => c.name === 'dm')
    expect(dm).toBeDefined()
    expect(dm!.dmOnly).toBe(true)
    expect(dm!.category).toBe('dm')
    expect(dm!.aliases).toContain('ai')
    expect(dm!.aliases).toContain('aidm')
  })

  it('dm pause subcommand returns system message', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('pause', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('paused') })
  })

  it('dm resume subcommand returns system message', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('resume', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('resumed') })
  })

  it('dm status subcommand returns status info', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('status', createCommandContext())
    expect(result).toEqual({
      type: 'system',
      content: expect.stringContaining('ACTIVE')
    })
  })

  it('dm context show subcommand returns message count', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('context show', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('0 messages') })
  })

  it('dm context with invalid subcommand returns error', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('context badarg', createCommandContext())
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('dm puzzle subcommand returns error without description', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('puzzle', createCommandContext())
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('dm puzzle subcommand broadcasts puzzle description', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('puzzle Three levers on the wall', createCommandContext())
    expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Three levers') })
  })

  it('dm trap subcommand returns error without description', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('trap', createCommandContext())
    expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
  })

  it('dm secret subcommand returns system-only message', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('secret Hidden door behind the painting', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Hidden door') })
  })

  it('dm with unknown subcommand returns usage', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const result = dm.execute('badcommand', createCommandContext())
    expect(result).toEqual({ type: 'system', content: expect.stringContaining('Usage') })
  })

  it('dm encounter subcommand opens encounterBuilder modal', () => {
    const dm = commands.find((c) => c.name === 'dm')!
    const ctx = createCommandContext({ openModal: vi.fn() })
    dm.execute('encounter', ctx)
    expect(ctx.openModal).toHaveBeenCalledWith('encounterBuilder')
  })
})
