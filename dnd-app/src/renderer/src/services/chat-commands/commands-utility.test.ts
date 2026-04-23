import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 14)
}))

// Stub window for undo/redo keyboard events
vi.stubGlobal('window', { dispatchEvent: vi.fn() })

// Stub KeyboardEvent for node environment (used by undo/redo commands)
vi.stubGlobal(
  'KeyboardEvent',
  class KeyboardEvent {
    key: string
    ctrlKey: boolean
    constructor(type: string, init?: { key?: string; ctrlKey?: boolean }) {
      this.key = init?.key ?? ''
      this.ctrlKey = init?.ctrlKey ?? false
    }
  }
)

import { commands } from './commands-utility'
import type { CommandContext } from './types'

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    isDM: false,
    playerName: 'TestPlayer',
    character: null,
    localPeerId: 'local-peer',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    openModal: vi.fn(),
    ...overrides
  }
}

describe('commands-utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('each command has required fields: name, description, execute', () => {
    for (const cmd of commands) {
      expect(cmd).toHaveProperty('name')
      expect(cmd).toHaveProperty('description')
      expect(cmd).toHaveProperty('execute')
      expect(typeof cmd.name).toBe('string')
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.execute).toBe('function')
    }
  })

  it('command names are unique within the module', () => {
    const names = commands.map((c) => c.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('command names follow expected format (lowercase, no leading slash)', () => {
    for (const cmd of commands) {
      expect(cmd.name).not.toMatch(/^\//)
      expect(cmd.name).toBe(cmd.name.toLowerCase())
    }
  })

  it('each command has aliases array and category', () => {
    for (const cmd of commands) {
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(['player', 'dm', 'ai']).toContain(cmd.category)
      expect(typeof cmd.dmOnly).toBe('boolean')
    }
  })

  describe('/undo command', () => {
    const undoCmd = commands.find((c) => c.name === 'undo')!

    it('exists with z alias', () => {
      expect(undoCmd).toBeDefined()
      expect(undoCmd.aliases).toContain('z')
    })

    it('returns system message on execute', () => {
      const result = undoCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Undo triggered')
    })
  })

  describe('/redo command', () => {
    const redoCmd = commands.find((c) => c.name === 'redo')!

    it('exists with y alias', () => {
      expect(redoCmd).toBeDefined()
      expect(redoCmd.aliases).toContain('y')
    })

    it('returns system message on execute', () => {
      const result = redoCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Redo triggered')
    })
  })

  describe('/ping command', () => {
    const pingCmd = commands.find((c) => c.name === 'ping')!

    it('exists', () => {
      expect(pingCmd).toBeDefined()
    })

    it('broadcasts ping message without extra text', () => {
      const result = pingCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('pings the map')
    })

    it('broadcasts ping message with a message', () => {
      const result = pingCmd.execute('look here', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('look here')
    })
  })

  describe('/latency command', () => {
    const latCmd = commands.find((c) => c.name === 'latency')!

    it('exists with lat alias', () => {
      expect(latCmd).toBeDefined()
      expect(latCmd.aliases).toContain('lat')
    })

    it('returns system message about network', () => {
      const result = latCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('WebRTC')
    })
  })

  describe('/clear command', () => {
    const clearCmd = commands.find((c) => c.name === 'clear')!

    it('exists and is DM-only', () => {
      expect(clearCmd).toBeDefined()
      expect(clearCmd.dmOnly).toBe(true)
    })

    it('clears chat', () => {
      const result = clearCmd.execute('chat', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Chat cleared')
    })

    it('clears combat', () => {
      const result = clearCmd.execute('combat', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Combat state cleared')
    })

    it('clears effects', () => {
      const result = clearCmd.execute('effects', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('effects cleared')
    })

    it('returns error for unknown subcommand', () => {
      const result = clearCmd.execute('unknown', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'error')
    })
  })

  describe('/log command', () => {
    const logCmd = commands.find((c) => c.name === 'log')!

    it('exists with combatlog alias', () => {
      expect(logCmd).toBeDefined()
      expect(logCmd.aliases).toContain('combatlog')
    })

    it('shows log with "show" arg', () => {
      const result = logCmd.execute('show', makeCtx())
      expect(result).toHaveProperty('type', 'system')
    })

    it('shows log with empty args (defaults to show)', () => {
      const result = logCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
    })

    it('clears log', () => {
      const result = logCmd.execute('clear', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('cleared')
    })

    it('returns error for unknown subcommand', () => {
      const result = logCmd.execute('invalid', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })
  })

  describe('/export command', () => {
    const exportCmd = commands.find((c) => c.name === 'export')!

    it('exists', () => {
      expect(exportCmd).toBeDefined()
    })

    it('returns system message for character export', () => {
      const result = exportCmd.execute('character', makeCtx())
      expect(result).toHaveProperty('type', 'system')
    })

    it('returns system message for campaign export', () => {
      const result = exportCmd.execute('campaign', makeCtx())
      expect(result).toHaveProperty('type', 'system')
    })

    it('returns error for unknown type', () => {
      const result = exportCmd.execute('unknown', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })
  })

  describe('/import command', () => {
    const importCmd = commands.find((c) => c.name === 'import')!

    it('exists', () => {
      expect(importCmd).toBeDefined()
    })

    it('returns system message for character import', () => {
      const result = importCmd.execute('character', makeCtx())
      expect(result).toHaveProperty('type', 'system')
    })

    it('returns error for unknown type', () => {
      const result = importCmd.execute('spells', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })
  })

  describe('/shortcuts command', () => {
    const shortcutsCmd = commands.find((c) => c.name === 'shortcuts')!

    it('exists with keys and hotkeys aliases', () => {
      expect(shortcutsCmd).toBeDefined()
      expect(shortcutsCmd.aliases).toContain('keys')
      expect(shortcutsCmd.aliases).toContain('hotkeys')
    })

    it('calls openModal on execute', () => {
      const ctx = makeCtx()
      shortcutsCmd.execute('', ctx)
      expect(ctx.openModal).toHaveBeenCalledWith('shortcutRef')
    })
  })

  describe('/version command', () => {
    const verCmd = commands.find((c) => c.name === 'version')!

    it('exists with ver and about aliases', () => {
      expect(verCmd).toBeDefined()
      expect(verCmd.aliases).toContain('ver')
      expect(verCmd.aliases).toContain('about')
    })

    it('returns system message with version info', () => {
      const result = verCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('D&D VTT')
    })
  })

  describe('/rollinitiative command', () => {
    const riCmd = commands.find((c) => c.name === 'rollinitiative')!

    it('exists with ri alias', () => {
      expect(riCmd).toBeDefined()
      expect(riCmd.aliases).toContain('ri')
    })

    it('returns broadcast with initiative roll', () => {
      const result = riCmd.execute('+3', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Initiative')
    })

    it('works with no modifier', () => {
      const result = riCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Initiative')
    })
  })

  describe('/coinflip command', () => {
    const coinCmd = commands.find((c) => c.name === 'coinflip')!

    it('exists with coin and flip aliases', () => {
      expect(coinCmd).toBeDefined()
      expect(coinCmd.aliases).toContain('coin')
      expect(coinCmd.aliases).toContain('flip')
    })

    it('returns broadcast with Heads or Tails', () => {
      const result = coinCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      const content = (result as { content: string }).content
      expect(content.includes('Heads') || content.includes('Tails')).toBe(true)
    })
  })

  describe('/percentile command', () => {
    const pctCmd = commands.find((c) => c.name === 'percentile')!

    it('exists with d100 and percent aliases', () => {
      expect(pctCmd).toBeDefined()
      expect(pctCmd.aliases).toContain('d100')
      expect(pctCmd.aliases).toContain('percent')
    })

    it('returns broadcast with percentile result', () => {
      const result = pctCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('d100')
    })
  })

  describe('/stabilize command', () => {
    const stabCmd = commands.find((c) => c.name === 'stabilize')!

    it('exists with stab alias', () => {
      expect(stabCmd).toBeDefined()
      expect(stabCmd.aliases).toContain('stab')
    })

    it('returns broadcast with Medicine check result', () => {
      const result = stabCmd.execute('Gandalf', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('stabilize')
      expect((result as { content: string }).content).toContain('DC 10')
    })

    it('defaults to "a dying creature" when no target given', () => {
      const result = stabCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('a dying creature')
    })
  })

  describe('/revive command', () => {
    const reviveCmd = commands.find((c) => c.name === 'revive')!

    it('exists and is DM-only', () => {
      expect(reviveCmd).toBeDefined()
      expect(reviveCmd.dmOnly).toBe(true)
    })

    it('returns error when no target', () => {
      const result = reviveCmd.execute('', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast for valid target', () => {
      const result = reviveCmd.execute('Frodo', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Frodo')
      expect((result as { content: string }).content).toContain('revived')
    })
  })

  describe('/massivedamage command', () => {
    const mdCmd = commands.find((c) => c.name === 'massivedamage')!

    it('exists with md alias', () => {
      expect(mdCmd).toBeDefined()
      expect(mdCmd.aliases).toContain('md')
    })

    it('returns error for invalid args', () => {
      const result = mdCmd.execute('abc', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast when damage >= maxHP (instant death)', () => {
      const result = mdCmd.execute('50 45', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Massive Damage')
    })

    it('returns system message when damage < maxHP (no massive damage)', () => {
      const result = mdCmd.execute('10 45', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('No massive damage')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('undo')
    expect(names).toContain('redo')
    expect(names).toContain('ping')
    expect(names).toContain('latency')
    expect(names).toContain('clear')
    expect(names).toContain('log')
    expect(names).toContain('export')
    expect(names).toContain('import')
    expect(names).toContain('shortcuts')
    expect(names).toContain('version')
    expect(names).toContain('rollinitiative')
    expect(names).toContain('coinflip')
    expect(names).toContain('percentile')
    expect(names).toContain('stabilize')
    expect(names).toContain('revive')
    expect(names).toContain('massivedamage')
  })
})
