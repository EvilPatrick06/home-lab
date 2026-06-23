import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 14)
}))

// Store mocks for the real /clear and /log behavior (PHASE-09 09D). getState returns
// a stable module-level object so assertions span calls.
const gameStoreState = {
  endInitiative: vi.fn(),
  clearAllConditions: vi.fn(),
  clearCombatLog: vi.fn(),
  clearAllEffects: vi.fn(),
  combatLog: [] as Array<{ round: number; description: string }>
}
vi.mock('../../stores/use-game-store', () => ({
  useGameStore: { getState: vi.fn(() => gameStoreState) }
}))
const lobbyStoreState = { clearChatHistory: vi.fn() }
vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: { getState: vi.fn(() => lobbyStoreState) }
}))
const networkStoreState = {
  sendMessage: vi.fn(),
  role: 'none' as 'none' | 'host' | 'client',
  connectionMode: 'p2p' as 'p2p' | 'cloud',
  latencyMs: null as number | null,
  peers: [] as Array<{ displayName: string; latencyMs?: number | null }>
}
vi.mock('../../stores/network-store', () => ({
  useNetworkStore: { getState: vi.fn(() => networkStoreState) }
}))

// io + campaign/character stores for /export and /import (PHASE-09 09F).
const ioMocks = vi.hoisted(() => ({
  exportCharacterToFile: vi.fn(async () => true),
  importCharacterFromFile: vi.fn(async () => null as { name: string; id: string } | null),
  exportCampaignToFile: vi.fn(async () => true),
  importCampaignFromFile: vi.fn(
    async () => null as { campaign: { id: string; name: string }; gameState: Record<string, unknown> | null } | null
  ),
  getLatestCharacter: vi.fn(() => ({ id: 'char-1', name: 'Aria' }))
}))
vi.mock('../io/character-io', () => ({
  exportCharacterToFile: ioMocks.exportCharacterToFile,
  importCharacterFromFile: ioMocks.importCharacterFromFile
}))
vi.mock('../io/campaign-io', () => ({
  exportCampaignToFile: ioMocks.exportCampaignToFile,
  importCampaignFromFile: ioMocks.importCampaignFromFile
}))
vi.mock('./helpers', () => ({ getLatestCharacter: ioMocks.getLatestCharacter }))
const campaignStoreState = {
  activeCampaignId: 'camp-1',
  campaigns: [{ id: 'camp-1', name: 'Lost Mine' }],
  saveCampaign: vi.fn(async () => {})
}
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: { getState: vi.fn(() => campaignStoreState) }
}))
const characterStoreState = { saveCharacter: vi.fn(async () => {}) }
vi.mock('../../stores/use-character-store', () => ({
  useCharacterStore: { getState: vi.fn(() => characterStoreState) }
}))

// undo-manager for /undo and /redo (PHASE-09 09H).
const undoMocks = vi.hoisted(() => ({
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: vi.fn(() => true),
  canRedo: vi.fn(() => true)
}))
vi.mock('../undo-manager', () => ({
  undo: undoMocks.undo,
  redo: undoMocks.redo,
  canUndo: undoMocks.canUndo,
  canRedo: undoMocks.canRedo
}))

// Stub window for undo/redo keyboard events + the campaign-import game-state save
vi.stubGlobal('window', { dispatchEvent: vi.fn(), api: { saveGameState: vi.fn(async () => ({ success: true })) } })

// Stub KeyboardEvent for node environment (used by undo/redo commands)
vi.stubGlobal(
  'KeyboardEvent',
  class KeyboardEvent {
    key: string
    ctrlKey: boolean
    constructor(_type: string, init?: { key?: string; ctrlKey?: boolean }) {
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

    it('exists with z alias and is DM-only', () => {
      expect(undoCmd).toBeDefined()
      expect(undoCmd.aliases).toContain('z')
      expect(undoCmd.dmOnly).toBe(true)
    })

    it('calls the undo-manager and confirms when there is history', () => {
      undoMocks.canUndo.mockReturnValueOnce(true)
      const result = undoCmd.execute('', makeCtx({ isDM: true }))
      expect(undoMocks.undo).toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('Undid the last map action')
    })

    it('reports an empty stack honestly without calling undo', () => {
      undoMocks.canUndo.mockReturnValueOnce(false)
      const result = undoCmd.execute('', makeCtx({ isDM: true }))
      expect(undoMocks.undo).not.toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('Nothing to undo')
    })

    it('refuses for a non-DM', () => {
      const result = undoCmd.execute('', makeCtx({ isDM: false }))
      expect(result).toHaveProperty('type', 'error')
      expect(undoMocks.undo).not.toHaveBeenCalled()
    })

    it('never claims "Undo triggered." (the old dead-feature copy)', () => {
      undoMocks.canUndo.mockReturnValueOnce(true)
      const result = undoCmd.execute('', makeCtx({ isDM: true }))
      expect((result as { content: string }).content).not.toContain('Undo triggered')
    })
  })

  describe('/redo command', () => {
    const redoCmd = commands.find((c) => c.name === 'redo')!

    it('exists with y alias and is DM-only', () => {
      expect(redoCmd).toBeDefined()
      expect(redoCmd.aliases).toContain('y')
      expect(redoCmd.dmOnly).toBe(true)
    })

    it('calls the undo-manager and confirms when there is redo history', () => {
      undoMocks.canRedo.mockReturnValueOnce(true)
      const result = redoCmd.execute('', makeCtx({ isDM: true }))
      expect(undoMocks.redo).toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('Redid the last map action')
    })

    it('reports an empty redo stack honestly without calling redo', () => {
      undoMocks.canRedo.mockReturnValueOnce(false)
      const result = redoCmd.execute('', makeCtx({ isDM: true }))
      expect(undoMocks.redo).not.toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('Nothing to redo')
    })

    it('refuses for a non-DM', () => {
      const result = redoCmd.execute('', makeCtx({ isDM: false }))
      expect(result).toHaveProperty('type', 'error')
      expect(undoMocks.redo).not.toHaveBeenCalled()
    })
  })

  describe('/latency command', () => {
    const latCmd = commands.find((c) => c.name === 'latency')!

    it('exists with lat alias', () => {
      expect(latCmd).toBeDefined()
      expect(latCmd.aliases).toContain('lat')
    })

    it('reports an honest solo message when not connected', () => {
      networkStoreState.role = 'none'
      const result = latCmd.execute('', makeCtx())
      expect((result as { content: string }).content).toContain('Solo session')
    })

    it('reports the measured client RTT', () => {
      networkStoreState.role = 'client'
      networkStoreState.latencyMs = 42
      networkStoreState.connectionMode = 'p2p'
      const result = latCmd.execute('', makeCtx())
      expect((result as { content: string }).content).toContain('42 ms')
    })

    it('says "measuring…" for a client before the first pong', () => {
      networkStoreState.role = 'client'
      networkStoreState.latencyMs = null
      const result = latCmd.execute('', makeCtx())
      expect((result as { content: string }).content).toContain('measuring')
    })

    it('reports per-peer RTT for the host', () => {
      networkStoreState.role = 'host'
      networkStoreState.peers = [
        { displayName: 'Alice', latencyMs: 30 },
        { displayName: 'Bob', latencyMs: null }
      ]
      const result = latCmd.execute('', makeCtx())
      const content = (result as { content: string }).content
      expect(content).toContain('Alice: 30 ms')
      expect(content).toContain('Bob: measuring')
    })

    it('does not emit the old canned "depends on peer distance" string', () => {
      networkStoreState.role = 'client'
      networkStoreState.latencyMs = 10
      const result = latCmd.execute('', makeCtx())
      expect((result as { content: string }).content).not.toContain('depends on peer distance')
    })
  })

  describe('/clear command', () => {
    const clearCmd = commands.find((c) => c.name === 'clear')!

    it('exists and is DM-only', () => {
      expect(clearCmd).toBeDefined()
      expect(clearCmd.dmOnly).toBe(true)
    })

    it('clears chat locally and broadcasts a chat:clear message', () => {
      const result = clearCmd.execute('chat', makeCtx({ isDM: true }))
      expect(lobbyStoreState.clearChatHistory).toHaveBeenCalled()
      expect(networkStoreState.sendMessage).toHaveBeenCalledWith('chat:clear', {})
      expect((result as { content: string }).content).toContain('Chat cleared')
    })

    it('clears combat state (initiative + conditions + combat log)', () => {
      const result = clearCmd.execute('combat', makeCtx({ isDM: true }))
      expect(gameStoreState.endInitiative).toHaveBeenCalled()
      expect(gameStoreState.clearAllConditions).toHaveBeenCalled()
      expect(gameStoreState.clearCombatLog).toHaveBeenCalled()
      expect(result).toHaveProperty('type', 'broadcast')
      expect((result as { content: string }).content).toContain('Combat state cleared')
    })

    it('clears active effects', () => {
      const result = clearCmd.execute('effects', makeCtx({ isDM: true }))
      expect(gameStoreState.clearAllEffects).toHaveBeenCalled()
      expect(result).toHaveProperty('type', 'broadcast')
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

    it('reports an empty log honestly', () => {
      gameStoreState.combatLog = []
      const result = logCmd.execute('show', makeCtx())
      expect((result as { content: string }).content).toContain('Combat log is empty')
    })

    it('prints the last entries with round + description', () => {
      gameStoreState.combatLog = [
        { round: 1, description: 'Goblin hits Fighter' },
        { round: 2, description: 'Fighter downs Goblin' }
      ]
      const result = logCmd.execute('', makeCtx())
      const content = (result as { content: string }).content
      expect(content).toContain('[R1] Goblin hits Fighter')
      expect(content).toContain('[R2] Fighter downs Goblin')
    })

    it('clears the log for the DM', () => {
      const result = logCmd.execute('clear', makeCtx({ isDM: true }))
      expect(gameStoreState.clearCombatLog).toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('cleared')
    })

    it('refuses to clear the log for a non-DM', () => {
      const result = logCmd.execute('clear', makeCtx({ isDM: false }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('returns error for unknown subcommand', () => {
      const result = logCmd.execute('invalid', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })
  })

  describe('/export command', () => {
    const exportCmd = commands.find((c) => c.name === 'export')!
    const withChar = makeCtx({ character: { id: 'char-1' } as any })

    it('exists', () => {
      expect(exportCmd).toBeDefined()
    })

    it('exports the active character via the io service', async () => {
      ioMocks.exportCharacterToFile.mockResolvedValueOnce(true)
      const result = await exportCmd.execute('character', withChar)
      expect(ioMocks.getLatestCharacter).toHaveBeenCalledWith('char-1')
      expect(ioMocks.exportCharacterToFile).toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('Exported character "Aria"')
    })

    it('reports cancellation calmly when the save dialog is dismissed', async () => {
      ioMocks.exportCharacterToFile.mockResolvedValueOnce(false)
      const result = await exportCmd.execute('character', withChar)
      expect(result).toHaveProperty('type', 'system')
      expect((result as { content: string }).content).toContain('cancelled')
    })

    it('errors when no character is active', async () => {
      const result = await exportCmd.execute('character', makeCtx({ character: null }))
      expect(result).toHaveProperty('type', 'error')
    })

    it('exports the active campaign via the io service', async () => {
      ioMocks.exportCampaignToFile.mockResolvedValueOnce(true)
      const result = await exportCmd.execute('campaign', makeCtx())
      expect(ioMocks.exportCampaignToFile).toHaveBeenCalled()
      expect((result as { content: string }).content).toContain('Exported campaign "Lost Mine"')
    })

    it('returns error for unknown type', async () => {
      const result = await exportCmd.execute('unknown', makeCtx())
      expect(result).toHaveProperty('type', 'error')
    })

    it('has no "use the main menu" pointer left', () => {
      // guard: the old false-pointer copy is gone
      expect(exportCmd.description.toLowerCase()).not.toContain('main menu')
    })
  })

  describe('/import command', () => {
    const importCmd = commands.find((c) => c.name === 'import')!

    it('exists', () => {
      expect(importCmd).toBeDefined()
    })

    it('imports a character and saves it', async () => {
      ioMocks.importCharacterFromFile.mockResolvedValueOnce({ id: 'c9', name: 'Borin' })
      const result = await importCmd.execute('character', makeCtx())
      expect(characterStoreState.saveCharacter).toHaveBeenCalledWith({ id: 'c9', name: 'Borin' })
      expect((result as { content: string }).content).toContain('Imported character "Borin"')
    })

    it('reports cancellation when the open dialog is dismissed', async () => {
      ioMocks.importCharacterFromFile.mockResolvedValueOnce(null)
      const result = await importCmd.execute('character', makeCtx())
      expect((result as { content: string }).content).toContain('cancelled')
      expect(characterStoreState.saveCharacter).not.toHaveBeenCalled()
    })

    it('imports a campaign, saves it, and persists its game state', async () => {
      ioMocks.importCampaignFromFile.mockResolvedValueOnce({
        campaign: { id: 'camp-9', name: 'Curse of Strahd' },
        gameState: { foo: 'bar' }
      })
      const result = await importCmd.execute('campaign', makeCtx())
      expect(campaignStoreState.saveCampaign).toHaveBeenCalledWith({ id: 'camp-9', name: 'Curse of Strahd' })
      expect(window.api.saveGameState).toHaveBeenCalledWith('camp-9', { foo: 'bar' })
      expect((result as { content: string }).content).toContain('Curse of Strahd')
    })

    it('returns error for unknown type', async () => {
      const result = await importCmd.execute('spells', makeCtx())
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
    expect(names).toContain('massivedamage')
  })
})
