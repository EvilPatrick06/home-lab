import { describe, expect, it, vi } from 'vitest'
import {
  assertCommandNameFormat,
  assertCommandShape,
  assertUniqueCommandNames,
  createCommandContext
} from '../../test-helpers'

import { commands } from './commands-player-mount'

function makeCtx(overrides: Partial<Parameters<typeof createCommandContext>[0]> = {}) {
  return createCommandContext({
    isDM: false,
    openModal: vi.fn(),
    ...overrides
  } as Parameters<typeof createCommandContext>[0])
}

describe('commands-player-mount', () => {
  // ── Shape tests ──────────────────────────────────────────────
  it('exports a non-empty commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('every command has required fields', () => assertCommandShape(commands))
  it('names are unique', () => assertUniqueCommandNames(commands))
  it('names are lowercase without leading slash', () => assertCommandNameFormat(commands))

  it('contains exactly mount and dismount', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('mount')
    expect(names).toContain('dismount')
    expect(commands).toHaveLength(2)
  })

  it('all commands are player category and not dmOnly', () => {
    for (const cmd of commands) {
      expect(cmd.category).toBe('player')
      expect(cmd.dmOnly).toBe(false)
    }
  })

  it('aliases do not collide with command names', () => {
    const names = new Set(commands.map((c) => c.name))
    for (const cmd of commands) {
      for (const alias of cmd.aliases) {
        expect(names.has(alias)).toBe(false)
      }
    }
  })

  // ── /mount ───────────────────────────────────────────────────
  describe('mount', () => {
    const cmd = () => commands.find((c) => c.name === 'mount')!

    it('has alias "ride"', () => {
      expect(cmd().aliases).toContain('ride')
    })

    it('calls openModal with "mount"', () => {
      const ctx = makeCtx()
      cmd().execute('', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('mount')
    })

    it('ignores any args passed', () => {
      const ctx = makeCtx()
      cmd().execute('some args', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('mount')
    })

    it('does not call broadcastSystemMessage', () => {
      const ctx = makeCtx()
      cmd().execute('', ctx)
      expect(ctx.broadcastSystemMessage).not.toHaveBeenCalled()
    })
  })

  // ── /dismount ────────────────────────────────────────────────
  describe('dismount', () => {
    const cmd = () => commands.find((c) => c.name === 'dismount')!

    it('has no aliases', () => {
      expect(cmd().aliases).toHaveLength(0)
    })

    it('calls openModal with "mount" (reuses same modal)', () => {
      const ctx = makeCtx()
      cmd().execute('', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('mount')
    })

    it('ignores any args passed', () => {
      const ctx = makeCtx()
      cmd().execute('horse', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('mount')
    })

    it('does not call broadcastSystemMessage', () => {
      const ctx = makeCtx()
      cmd().execute('', ctx)
      expect(ctx.broadcastSystemMessage).not.toHaveBeenCalled()
    })
  })
})
