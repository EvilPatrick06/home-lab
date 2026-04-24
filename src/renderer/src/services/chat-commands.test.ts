import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock the chat-commands/index module ---
const mockExecuteCommand = vi.fn()
const mockGetCommands = vi.fn()
const mockGetFilteredCommands = vi.fn()

vi.mock('./chat-commands/index', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  getCommands: (...args: unknown[]) => mockGetCommands(...args),
  getFilteredCommands: (...args: unknown[]) => mockGetFilteredCommands(...args)
}))

import { executeCommand, getCommands, getFilteredCommands } from './chat-commands'

describe('chat-commands (root re-export)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('executeCommand', () => {
    it('is re-exported from chat-commands/index', () => {
      const ctx = {
        isDM: true,
        playerName: 'DM',
        character: null,
        localPeerId: 'peer-1',
        addSystemMessage: vi.fn(),
        broadcastSystemMessage: vi.fn(),
        addErrorMessage: vi.fn()
      }

      mockExecuteCommand.mockReturnValue({ handled: true })

      const result = executeCommand('/roll 1d20', ctx)

      expect(mockExecuteCommand).toHaveBeenCalledWith('/roll 1d20', ctx)
      expect(result).toEqual({ handled: true })
    })

    it('passes through null return (no command match)', () => {
      const ctx = {
        isDM: false,
        playerName: 'Player',
        character: null,
        localPeerId: 'peer-2',
        addSystemMessage: vi.fn(),
        broadcastSystemMessage: vi.fn(),
        addErrorMessage: vi.fn()
      }

      mockExecuteCommand.mockReturnValue(null)

      const result = executeCommand('not a command', ctx)

      expect(result).toBeNull()
    })
  })

  describe('getCommands', () => {
    it('is re-exported from chat-commands/index', () => {
      const mockCmds = [
        { name: 'roll', aliases: ['r'], description: 'Roll dice', usage: '/roll', category: 'player', dmOnly: false },
        { name: 'fog', aliases: [], description: 'Toggle fog', usage: '/fog', category: 'dm', dmOnly: true }
      ]
      mockGetCommands.mockReturnValue(mockCmds)

      const result = getCommands(true)

      expect(mockGetCommands).toHaveBeenCalledWith(true)
      expect(result).toHaveLength(2)
    })

    it('filters DM-only commands when isDM is false', () => {
      const playerCmds = [
        { name: 'roll', aliases: ['r'], description: 'Roll dice', usage: '/roll', category: 'player', dmOnly: false }
      ]
      mockGetCommands.mockReturnValue(playerCmds)

      const result = getCommands(false)

      expect(mockGetCommands).toHaveBeenCalledWith(false)
      expect(result).toHaveLength(1)
    })
  })

  describe('getFilteredCommands', () => {
    it('is re-exported from chat-commands/index', () => {
      const filtered = [
        { name: 'roll', aliases: ['r'], description: 'Roll dice', usage: '/roll', category: 'player', dmOnly: false }
      ]
      mockGetFilteredCommands.mockReturnValue(filtered)

      const result = getFilteredCommands('ro', true)

      expect(mockGetFilteredCommands).toHaveBeenCalledWith('ro', true)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('roll')
    })

    it('returns empty when no commands match', () => {
      mockGetFilteredCommands.mockReturnValue([])

      const result = getFilteredCommands('zzz', false)

      expect(result).toEqual([])
    })
  })

  describe('type re-exports', () => {
    it('module exports executeCommand, getCommands, getFilteredCommands as functions', () => {
      expect(typeof executeCommand).toBe('function')
      expect(typeof getCommands).toBe('function')
      expect(typeof getFilteredCommands).toBe('function')
    })
  })
})
