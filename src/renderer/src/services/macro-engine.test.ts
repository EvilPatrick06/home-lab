import { describe, expect, it, vi } from 'vitest'

// Mock executeCommand from chat-commands
vi.mock('./chat-commands/index', () => ({
  executeCommand: vi.fn()
}))

import type { Character5e } from '../types/character-5e'
import { executeCommand } from './chat-commands/index'
import { executeMacro, resolveMacroVariables } from './macro-engine'

function makeCharacter(overrides?: Partial<Character5e>): Character5e {
  return {
    name: 'Gandalf',
    level: 10,
    abilityScores: {
      strength: 10,
      dexterity: 14,
      constitution: 12,
      intelligence: 20,
      wisdom: 18,
      charisma: 16
    },
    ...overrides
  } as Character5e
}

describe('resolveMacroVariables', () => {
  it('returns command unchanged if no $ variables', () => {
    expect(resolveMacroVariables('hello world', null)).toBe('hello world')
  })

  it('resolves $self to character name', () => {
    const char = makeCharacter({ name: 'Aragorn' })
    expect(resolveMacroVariables('I am $self', char)).toBe('I am Aragorn')
  })

  it('resolves $name to character name', () => {
    const char = makeCharacter({ name: 'Legolas' })
    expect(resolveMacroVariables('$name attacks', char)).toBe('Legolas attacks')
  })

  it('resolves $target to target label', () => {
    expect(resolveMacroVariables('attack $target', null, 'Goblin')).toBe('attack Goblin')
  })

  it('resolves $level to character level', () => {
    const char = makeCharacter({ level: 15 })
    expect(resolveMacroVariables('Level $level', char)).toBe('Level 15')
  })

  it('resolves $prof to proficiency bonus', () => {
    const char = makeCharacter({ level: 5 })
    // Level 5: PB = ceil(5/4) + 1 = 3
    expect(resolveMacroVariables('PB: $prof', char)).toBe('PB: +3')
  })

  it('resolves $mod.str to strength modifier', () => {
    const char = makeCharacter({
      abilityScores: {
        strength: 16, // +3
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      }
    })
    expect(resolveMacroVariables('STR: $mod.str', char)).toBe('STR: +3')
  })

  it('resolves $mod.dex to dexterity modifier', () => {
    const char = makeCharacter({
      abilityScores: {
        strength: 10,
        dexterity: 8, // -1
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      }
    })
    expect(resolveMacroVariables('DEX: $mod.dex', char)).toBe('DEX: -1')
  })

  it('resolves $mod.int to intelligence modifier', () => {
    const char = makeCharacter({
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 20, // +5
        wisdom: 10,
        charisma: 10
      }
    })
    expect(resolveMacroVariables('INT: $mod.int', char)).toBe('INT: +5')
  })

  it('keeps unrecognized variables as-is', () => {
    expect(resolveMacroVariables('$unknown_var', null)).toBe('$unknown_var')
  })

  it('keeps $self as-is when no character provided', () => {
    expect(resolveMacroVariables('I am $self', null)).toBe('I am $self')
  })

  it('keeps $target as-is when no target provided', () => {
    expect(resolveMacroVariables('attack $target', null)).toBe('attack $target')
  })

  it('keeps $mod.xyz as-is for invalid ability name', () => {
    const char = makeCharacter()
    expect(resolveMacroVariables('$mod.foo', char)).toBe('$mod.foo')
  })

  it('resolves multiple variables in one command', () => {
    const char = makeCharacter({ name: 'Gandalf', level: 10 })
    const result = resolveMacroVariables('$name (lv$level) attacks $target', char, 'Orc')
    expect(result).toBe('Gandalf (lv10) attacks Orc')
  })
})

describe('executeMacro', () => {
  const mockExecuteCommand = vi.mocked(executeCommand)

  it('dispatches slash commands via executeCommand', () => {
    const macro = { id: 'm1', name: 'test', command: '/roll 1d20', icon: '', hotkey: null }
    const ctx = { addSystemMessage: vi.fn() } as never
    executeMacro(macro, ctx, null)
    expect(mockExecuteCommand).toHaveBeenCalledWith('/roll 1d20', ctx)
  })

  it('wraps bare dice formulas as /roll commands', () => {
    const macro = { id: 'm2', name: 'test', command: '2d6+3', icon: '', hotkey: null }
    const ctx = { addSystemMessage: vi.fn() } as never
    executeMacro(macro, ctx, null)
    expect(mockExecuteCommand).toHaveBeenCalledWith('/roll 2d6+3', ctx)
  })

  it('sends plain text as system message', () => {
    const addSystemMessage = vi.fn()
    const macro = { id: 'm3', name: 'RP', command: 'I cast fireball!', icon: '', hotkey: null }
    const ctx = { addSystemMessage } as never
    executeMacro(macro, ctx, null)
    expect(addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('I cast fireball!'))
  })

  it('resolves variables before dispatching', () => {
    const char = makeCharacter({ name: 'Gandalf' })
    // $mod.int for INT 20 → abilityModifier(20) = 5 → formatMod(5) = "+5"
    // So the resolved command is "/roll 1d20++5" (double plus)
    const macro = { id: 'm4', name: 'attack', command: '/roll 1d20+$mod.int', icon: '', hotkey: null }
    const ctx = { addSystemMessage: vi.fn() } as never
    executeMacro(macro, ctx, char)
    expect(mockExecuteCommand).toHaveBeenCalledWith('/roll 1d20++5', ctx)
  })

  it('handles dice formula 1d20', () => {
    const macro = { id: 'm5', name: 'test', command: '1d20', icon: '', hotkey: null }
    const ctx = { addSystemMessage: vi.fn() } as never
    executeMacro(macro, ctx, null)
    expect(mockExecuteCommand).toHaveBeenCalledWith('/roll 1d20', ctx)
  })

  it('handles dice formula d6', () => {
    const macro = { id: 'm6', name: 'test', command: 'd6', icon: '', hotkey: null }
    const ctx = { addSystemMessage: vi.fn() } as never
    executeMacro(macro, ctx, null)
    expect(mockExecuteCommand).toHaveBeenCalledWith('/roll d6', ctx)
  })
})
