import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      players: [
        { displayName: 'Alice', peerId: 'peer-1', isHost: true, characterName: 'Gandalf' },
        { displayName: 'Bob', peerId: 'peer-2', isHost: false, characterName: 'Frodo' }
      ],
      addChatMessage: vi.fn()
    }))
  }
}))

import { commands } from './commands-social'
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
    ...overrides
  }
}

describe('commands-social', () => {
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

  describe('/me command', () => {
    const meCmd = commands.find((c) => c.name === 'me')!

    it('exists with emote alias', () => {
      expect(meCmd).toBeDefined()
      expect(meCmd.aliases).toContain('emote')
    })

    it('returns error when no args provided', () => {
      const result = meCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with italicized action', () => {
      const result = meCmd.execute('waves hello', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect(result).toHaveProperty('content')
      expect((result as { content: string }).content).toContain('TestPlayer')
      expect((result as { content: string }).content).toContain('waves hello')
    })
  })

  describe('/ooc command', () => {
    const oocCmd = commands.find((c) => c.name === 'ooc')!

    it('exists with oog alias', () => {
      expect(oocCmd).toBeDefined()
      expect(oocCmd.aliases).toContain('oog')
    })

    it('returns error when no args provided', () => {
      const result = oocCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with OOC prefix', () => {
      const result = oocCmd.execute('brb one sec', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('[OOC]')
    })
  })

  describe('/shout command', () => {
    const shoutCmd = commands.find((c) => c.name === 'shout')!

    it('exists with yell alias', () => {
      expect(shoutCmd).toBeDefined()
      expect(shoutCmd.aliases).toContain('yell')
    })

    it('returns error when no args provided', () => {
      const result = shoutCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with uppercased message', () => {
      const result = shoutCmd.execute('charge!', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('CHARGE!')
    })
  })

  describe('/language command', () => {
    const langCmd = commands.find((c) => c.name === 'language')!

    it('exists with lang and speak aliases', () => {
      expect(langCmd).toBeDefined()
      expect(langCmd.aliases).toContain('lang')
      expect(langCmd.aliases).toContain('speak')
    })

    it('returns error when only language name provided', () => {
      const result = langCmd.execute('Elvish', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with language label', () => {
      const result = langCmd.execute('Elvish greetings friend', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Elvish')
      expect((result as { content: string }).content).toContain('greetings friend')
    })
  })

  describe('/players command', () => {
    const playersCmd = commands.find((c) => c.name === 'players')!

    it('exists with who and online aliases', () => {
      expect(playersCmd).toBeDefined()
      expect(playersCmd.aliases).toContain('who')
      expect(playersCmd.aliases).toContain('online')
    })

    it('returns system message listing connected players', () => {
      const result = playersCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Connected Players')
      expect((result as { content: string }).content).toContain('Alice')
    })

    it('returns no players message when list is empty', async () => {
      const { useLobbyStore } = await import('../../stores/use-lobby-store')
      vi.mocked(useLobbyStore.getState).mockReturnValueOnce({
        players: [],
        addChatMessage: vi.fn()
      } as never)
      const result = playersCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('No players connected')
    })
  })

  describe('/kick command', () => {
    const kickCmd = commands.find((c) => c.name === 'kick')!

    it('exists and is DM-only', () => {
      expect(kickCmd).toBeDefined()
      expect(kickCmd.dmOnly).toBe(true)
    })

    it('returns error when no args provided', () => {
      const result = kickCmd.execute('', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error when player not found', () => {
      const result = kickCmd.execute('Unknown', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error when trying to kick the host', () => {
      const result = kickCmd.execute('Alice', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'error')
      expect((result as { content: string }).content).toContain('Cannot kick the host')
    })

    it('succeeds kicking a non-host player', () => {
      const result = kickCmd.execute('Bob', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Bob')
    })
  })

  describe('/mute command', () => {
    const muteCmd = commands.find((c) => c.name === 'mute')!

    it('exists and is DM-only', () => {
      expect(muteCmd).toBeDefined()
      expect(muteCmd.dmOnly).toBe(true)
    })

    it('returns error when no args provided', () => {
      const result = muteCmd.execute('', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('succeeds with player name', () => {
      const result = muteCmd.execute('Bob', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('muted')
    })
  })

  describe('/say command', () => {
    const sayCmd = commands.find((c) => c.name === 'say')!

    it('exists and is not DM-only', () => {
      expect(sayCmd).toBeDefined()
      expect(sayCmd.dmOnly).toBe(false)
    })

    it('returns error when no args provided', () => {
      const result = sayCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns broadcast with in-character speech', () => {
      const result = sayCmd.execute('Hello there', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('says')
      expect((result as { content: string }).content).toContain('Hello there')
    })
  })

  describe('/ping command', () => {
    const pingCmd = commands.find((c) => c.name === 'ping')!

    it('exists', () => {
      expect(pingCmd).toBeDefined()
    })

    it('pings the map when no target or "map" provided', () => {
      const result = pingCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('pings the map')
    })

    it('pings a specific player by name', () => {
      const result = pingCmd.execute('Alice', makeCtx())
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Alice')
    })
  })

  describe('/whisper command', () => {
    const whisperCmd = commands.find((c) => c.name === 'whisper')!

    it('exists with w, tell, dm aliases', () => {
      expect(whisperCmd).toBeDefined()
      expect(whisperCmd.aliases).toContain('w')
      expect(whisperCmd.aliases).toContain('tell')
      expect(whisperCmd.aliases).toContain('dm')
    })

    it('returns error when no args or incomplete', () => {
      const result = whisperCmd.execute('', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('succeeds with target and message', () => {
      const result = whisperCmd.execute('Alice hello there!', makeCtx())
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('Whisper to Alice')
    })
  })

  describe('/playersping command', () => {
    const ppCmd = commands.find((c) => c.name === 'playersping')!

    it('exists and is DM-only', () => {
      expect(ppCmd).toBeDefined()
      expect(ppCmd.dmOnly).toBe(true)
      expect(ppCmd.aliases).toContain('pingall')
    })

    it('broadcasts attention message with custom text', () => {
      const result = ppCmd.execute('Combat starting!', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Attention all players')
      expect((result as { content: string }).content).toContain('Combat starting!')
    })

    it('broadcasts default message when no args', () => {
      const result = ppCmd.execute('', makeCtx({ isDM: true }))
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('DM requests your attention')
    })
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('me')
    expect(names).toContain('ooc')
    expect(names).toContain('shout')
    expect(names).toContain('language')
    expect(names).toContain('players')
    expect(names).toContain('kick')
    expect(names).toContain('mute')
    expect(names).toContain('say')
    expect(names).toContain('ping')
    expect(names).toContain('whisper')
    expect(names).toContain('playersping')
  })
})
