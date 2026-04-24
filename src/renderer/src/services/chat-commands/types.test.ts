import { describe, expect, it } from 'vitest'

describe('chat-commands types', () => {
  it('exports CommandResult interface shape', async () => {
    const mod = await import('./types')

    // Verify the module exports exist (type-level interfaces are erased at runtime,
    // but we can verify the module loads and check runtime-usable type instances)
    expect(mod).toBeDefined()
  })

  it('CommandResult conforms to expected shape', () => {
    // Validate at runtime that objects matching the interface are valid
    const result: import('./types').CommandResult = { handled: true }
    expect(result.handled).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.preventBroadcast).toBeUndefined()
  })

  it('CommandResult can include error and preventBroadcast', () => {
    const result: import('./types').CommandResult = {
      handled: false,
      error: 'Something went wrong',
      preventBroadcast: true
    }
    expect(result.handled).toBe(false)
    expect(result.error).toBe('Something went wrong')
    expect(result.preventBroadcast).toBe(true)
  })

  it('CommandMessage conforms to expected shape', () => {
    const msg: import('./types').CommandMessage = {
      type: 'broadcast',
      content: 'Hello world'
    }
    expect(msg.type).toBe('broadcast')
    expect(msg.content).toBe('Hello world')
  })

  it('CommandContext conforms to expected shape', () => {
    const ctx: import('./types').CommandContext = {
      isDM: true,
      playerName: 'DM',
      character: null,
      localPeerId: 'peer-1',
      addSystemMessage: () => {},
      broadcastSystemMessage: () => {},
      addErrorMessage: () => {}
    }
    expect(ctx.isDM).toBe(true)
    expect(ctx.playerName).toBe('DM')
    expect(ctx.character).toBeNull()
    expect(typeof ctx.addSystemMessage).toBe('function')
    expect(typeof ctx.broadcastSystemMessage).toBe('function')
    expect(typeof ctx.addErrorMessage).toBe('function')
  })

  it('CommandContext can include optional modal openers', () => {
    const ctx: import('./types').CommandContext = {
      isDM: false,
      playerName: 'Player',
      character: null,
      localPeerId: 'peer-2',
      addSystemMessage: () => {},
      broadcastSystemMessage: () => {},
      addErrorMessage: () => {},
      openModal: () => {},
      openModalWithArgs: () => {}
    }
    expect(typeof ctx.openModal).toBe('function')
    expect(typeof ctx.openModalWithArgs).toBe('function')
  })

  it('ChatCommand conforms to expected shape', () => {
    const cmd: import('./types').ChatCommand = {
      name: 'test',
      aliases: ['t'],
      description: 'A test command',
      usage: '/test',
      category: 'player',
      dmOnly: false,
      execute: () => ({ handled: true })
    }
    expect(cmd.name).toBe('test')
    expect(cmd.aliases).toEqual(['t'])
    expect(cmd.dmOnly).toBe(false)
    expect(typeof cmd.execute).toBe('function')
  })

  it('ChatCommand category is restricted to valid values', () => {
    const categories: Array<import('./types').ChatCommand['category']> = ['player', 'dm', 'ai']
    expect(categories).toHaveLength(3)
    expect(categories).toContain('player')
    expect(categories).toContain('dm')
    expect(categories).toContain('ai')
  })

  it('ChatCommand can include examples', () => {
    const cmd: import('./types').ChatCommand = {
      name: 'roll',
      aliases: ['r'],
      description: 'Roll dice',
      usage: '/roll <formula>',
      examples: ['/roll 2d6', '/roll 1d20+5'],
      category: 'player',
      dmOnly: false,
      execute: () => {}
    }
    expect(cmd.examples).toEqual(['/roll 2d6', '/roll 1d20+5'])
  })

  it('CommandReturn can be CommandResult, CommandMessage, or undefined', () => {
    const asResult: import('./types').CommandReturn = { handled: true }
    const asMessage: import('./types').CommandReturn = { type: 'system', content: 'hello' }
    const asUndefined: import('./types').CommandReturn = undefined
    expect(asResult).toBeDefined()
    expect(asMessage).toBeDefined()
    expect(asUndefined).toBeUndefined()
  })
})
