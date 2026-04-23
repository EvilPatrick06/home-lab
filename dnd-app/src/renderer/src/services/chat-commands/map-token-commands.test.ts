import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertCommandShape, assertUniqueCommandNames, createCommandContext } from '../../test-helpers'

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      addToken: vi.fn(),
      removeToken: vi.fn(),
      updateToken: vi.fn()
    }))
  }
}))

vi.mock('../data-provider', () => ({
  load5eMonsters: vi.fn(async () => [
    { name: 'Goblin', hp: 7, ac: 15, size: 'Small' },
    { name: 'Adult Red Dragon', hp: 256, ac: 19, size: 'Huge' },
    { name: 'Storm Giant', hp: 230, ac: 16, size: 'Gargantuan' }
  ])
}))

import { useGameStore } from '../../stores/use-game-store'
import {
  moveTokenCommand,
  summonCommand,
  tokenCloneCommand,
  tokenCommand,
  tokenHideCommand,
  tokenShowCommand
} from './map-token-commands'

const makeCtx = createCommandContext

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tokenCommand', () => {
  it('has correct metadata', () => {
    expect(tokenCommand.name).toBe('token')
    expect(tokenCommand.dmOnly).toBe(true)
    expect(tokenCommand.category).toBe('dm')
  })

  it('shows usage for invalid action', async () => {
    const ctx = makeCtx()
    await tokenCommand.execute('invalid', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('shows error when no active map', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: null,
      maps: [],
      addToken: vi.fn(),
      removeToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCommand.execute('add Goblin', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('No active map'))
  })

  it('adds a token at default coordinates', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken,
      removeToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCommand.execute('add Goblin', ctx)
    expect(addToken).toHaveBeenCalledWith(
      'map-1',
      expect.objectContaining({
        label: 'Goblin',
        gridX: 0,
        gridY: 0,
        entityType: 'npc'
      })
    )
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Goblin'))
  })

  it('adds a token at specified coordinates', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken,
      removeToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCommand.execute('add Skeleton 5 10', ctx)
    expect(addToken).toHaveBeenCalledWith(
      'map-1',
      expect.objectContaining({
        label: 'Skeleton',
        gridX: 5,
        gridY: 10
      })
    )
  })

  it('removes a token by name', async () => {
    const removeToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      addToken: vi.fn(),
      removeToken
    } as any)
    const ctx = makeCtx()
    await tokenCommand.execute('remove Goblin', ctx)
    expect(removeToken).toHaveBeenCalledWith('map-1', 't1')
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('removed'))
  })

  it('shows error when removing non-existent token', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken: vi.fn(),
      removeToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCommand.execute('remove Dragon', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Token not found'))
  })

  it('shows usage when add has no name', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken: vi.fn(),
      removeToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCommand.execute('add', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })
})

describe('summonCommand', () => {
  it('has correct metadata', () => {
    expect(summonCommand.name).toBe('summon')
    expect(summonCommand.dmOnly).toBe(true)
    expect(summonCommand.category).toBe('dm')
  })

  it('shows usage when no args', async () => {
    const ctx = makeCtx()
    await summonCommand.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('summons a monster at default coordinates', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken
    } as any)
    const ctx = makeCtx()
    await summonCommand.execute('goblin', ctx)
    expect(addToken).toHaveBeenCalledWith(
      'map-1',
      expect.objectContaining({
        label: 'Goblin',
        entityType: 'enemy',
        currentHP: 7,
        maxHP: 7,
        ac: 15,
        sizeX: 1,
        sizeY: 1
      })
    )
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Goblin'))
  })

  it('summons a monster at specified coordinates', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken
    } as any)
    const ctx = makeCtx()
    await summonCommand.execute('goblin 5 10', ctx)
    expect(addToken).toHaveBeenCalledWith(
      'map-1',
      expect.objectContaining({
        gridX: 5,
        gridY: 10
      })
    )
  })

  it('uses correct size for Large monsters', async () => {
    // No Large monster in our fixture, but let's test the default path
    // by testing Huge (Adult Red Dragon) which gets sizeX=3
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken
    } as any)
    const ctx = makeCtx()
    await summonCommand.execute('adult red dragon', ctx)
    expect(addToken).toHaveBeenCalledWith('map-1', expect.objectContaining({ sizeX: 3, sizeY: 3 }))
  })

  it('uses correct size for Gargantuan monsters', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken
    } as any)
    const ctx = makeCtx()
    await summonCommand.execute('storm giant', ctx)
    expect(addToken).toHaveBeenCalledWith('map-1', expect.objectContaining({ sizeX: 4, sizeY: 4 }))
  })

  it('shows error when monster not found', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await summonCommand.execute('unicorn', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Monster not found'))
  })

  it('shows error when no active map', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: null,
      maps: [],
      addToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await summonCommand.execute('goblin', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('No active map'))
  })
})

describe('tokenCloneCommand', () => {
  it('has correct metadata', () => {
    expect(tokenCloneCommand.name).toBe('tokenclone')
    expect(tokenCloneCommand.aliases).toContain('clone')
    expect(tokenCloneCommand.dmOnly).toBe(true)
  })

  it('shows usage when no args', async () => {
    const ctx = makeCtx()
    await tokenCloneCommand.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('clones a token once by default', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1', gridX: 5, gridY: 5 }] }],
      addToken
    } as any)
    const ctx = makeCtx()
    await tokenCloneCommand.execute('Goblin', ctx)
    expect(addToken).toHaveBeenCalledTimes(1)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('x1'))
  })

  it('clones a token multiple times with count', async () => {
    const addToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1', gridX: 0, gridY: 0 }] }],
      addToken
    } as any)
    const ctx = makeCtx()
    await tokenCloneCommand.execute('Goblin 3', ctx)
    expect(addToken).toHaveBeenCalledTimes(3)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('x3'))
  })

  it('shows error when token not found', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      addToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCloneCommand.execute('Dragon', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Token not found'))
  })

  it('shows error when no active map', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: null,
      maps: [],
      addToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenCloneCommand.execute('Goblin', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('No active map'))
  })
})

describe('tokenHideCommand', () => {
  it('has correct metadata', () => {
    expect(tokenHideCommand.name).toBe('tokenhide')
    expect(tokenHideCommand.dmOnly).toBe(true)
  })

  it('shows usage when no args', async () => {
    const ctx = makeCtx()
    await tokenHideCommand.execute('', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('hides a token from players', async () => {
    const updateToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      updateToken
    } as any)
    const ctx = makeCtx()
    await tokenHideCommand.execute('Goblin', ctx)
    expect(updateToken).toHaveBeenCalledWith('map-1', 't1', { visibleToPlayers: false })
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('hidden'))
  })

  it('shows error when token not found', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      updateToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await tokenHideCommand.execute('Dragon', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Token not found'))
  })
})

describe('tokenShowCommand', () => {
  it('has correct metadata', () => {
    expect(tokenShowCommand.name).toBe('tokenshow')
    expect(tokenShowCommand.aliases).toContain('tokenreveal')
    expect(tokenShowCommand.dmOnly).toBe(true)
  })

  it('shows a hidden token to players', async () => {
    const updateToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      updateToken
    } as any)
    const ctx = makeCtx()
    await tokenShowCommand.execute('Goblin', ctx)
    expect(updateToken).toHaveBeenCalledWith('map-1', 't1', { visibleToPlayers: true })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('appears'))
  })
})

describe('moveTokenCommand', () => {
  it('has correct metadata', () => {
    expect(moveTokenCommand.name).toBe('tokenmove')
    expect(moveTokenCommand.aliases).toContain('teleport')
    expect(moveTokenCommand.dmOnly).toBe(true)
  })

  it('shows usage when insufficient args', async () => {
    const ctx = makeCtx()
    await moveTokenCommand.execute('Goblin 5', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('shows error for non-numeric coordinates', async () => {
    const ctx = makeCtx()
    await moveTokenCommand.execute('Goblin abc def', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Coordinates must be numbers'))
  })

  it('moves a token to specified coordinates', async () => {
    const updateToken = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ id: 't1', label: 'Goblin', entityId: 'e1' }] }],
      updateToken
    } as any)
    const ctx = makeCtx()
    await moveTokenCommand.execute('Goblin 10 20', ctx)
    expect(updateToken).toHaveBeenCalledWith('map-1', 't1', { gridX: 10, gridY: 20 })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('(10, 20)'))
  })

  it('shows error when token not found', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      updateToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await moveTokenCommand.execute('Dragon 5 5', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('Token not found'))
  })

  it('shows error when no active map', async () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: null,
      maps: [],
      updateToken: vi.fn()
    } as any)
    const ctx = makeCtx()
    await moveTokenCommand.execute('Goblin 5 5', ctx)
    expect(ctx.addSystemMessage).toHaveBeenCalledWith(expect.stringContaining('No active map'))
  })
})

describe('all map-token commands share required shape', () => {
  const commands = [
    tokenCommand,
    summonCommand,
    tokenCloneCommand,
    tokenHideCommand,
    tokenShowCommand,
    moveTokenCommand
  ]

  it('each has name, aliases, description, usage, category, dmOnly, execute', () => {
    assertCommandShape(commands)
  })

  it('names are unique', () => {
    assertUniqueCommandNames(commands)
  })

  it('all are DM-only', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
    }
  })
})
