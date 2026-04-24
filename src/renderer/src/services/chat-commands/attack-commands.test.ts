import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../../data/light-sources', () => ({
  LIGHT_SOURCES: {
    torch: { brightRadius: 20, dimRadius: 40, durationSeconds: 3600 },
    lantern: { brightRadius: 30, dimRadius: 60, durationSeconds: Infinity }
  },
  LIGHT_SOURCE_LABELS: {
    torch: 'Torch',
    lantern: 'Hooded Lantern'
  }
}))

vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 15),
  rollMultiple: vi.fn((count: number) => Array.from({ length: count }, () => 4))
}))

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      conditions: [],
      maps: [],
      activeMapId: 'map-1',
      round: 1,
      turnStates: {},
      activeLightSources: [],
      extinguishSource: vi.fn(),
      lightSource: vi.fn()
    }))
  }
}))

vi.mock('../combat/attack-formatter', () => ({
  formatAttackResult: vi.fn(() => 'Formatted attack result')
}))

vi.mock('../combat/attack-resolver', () => ({
  findWeapon: vi.fn(),
  resolveAttack: vi.fn(() => ({
    attackRoll: 15,
    attackTotal: 20,
    isHit: true,
    damageRolls: [6],
    damageTotal: 8,
    rangeCategory: 'normal'
  }))
}))

vi.mock('./helpers', () => ({
  findTokenByName: vi.fn(),
  rollD20WithTag: vi.fn(() => ({ roll: 15, tag: '' }))
}))

import { useGameStore } from '../../stores/use-game-store'
import { findWeapon } from '../combat/attack-resolver'
import {
  aoeDamageCommand,
  attackCommand,
  offhandAttackCommand,
  torchCommand,
  unarmedAttackCommand
} from './attack-commands'
import { findTokenByName } from './helpers'
import type { CommandContext } from './types'

function makeCtx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    isDM: false,
    playerName: 'TestPlayer',
    character: null,
    localPeerId: 'local',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('offhandAttackCommand', () => {
  it('has correct metadata', () => {
    expect(offhandAttackCommand.name).toBe('offhand')
    expect(offhandAttackCommand.aliases).toContain('attackoffhand')
    expect(offhandAttackCommand.aliases).toContain('bonusattack')
    expect(offhandAttackCommand.dmOnly).toBe(false)
    expect(offhandAttackCommand.category).toBe('player')
  })

  it('returns handled:true and broadcasts an off-hand attack message', () => {
    const ctx = makeCtx()
    const result = offhandAttackCommand.execute('Goblin 1d6', ctx) as any
    expect(result).toEqual({ handled: true })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('off-hand attack'))
  })

  it('defaults target to "a creature" and damage to 1d6', () => {
    const ctx = makeCtx()
    offhandAttackCommand.execute('', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('a creature'))
  })
})

describe('unarmedAttackCommand', () => {
  it('has correct metadata', () => {
    expect(unarmedAttackCommand.name).toBe('unarmed')
    expect(unarmedAttackCommand.aliases).toContain('punch')
    expect(unarmedAttackCommand.dmOnly).toBe(false)
  })

  it('returns handled:true and broadcasts an unarmed strike message', () => {
    const ctx = makeCtx()
    const result = unarmedAttackCommand.execute('Orc', ctx) as any
    expect(result).toEqual({ handled: true })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('unarmed strike'))
  })

  it('uses character STR modifier when character is available', () => {
    const ctx = makeCtx({
      character: { abilityScores: { strength: 18 } } as any
    })
    unarmedAttackCommand.execute('Goblin', ctx)
    // STR 18 -> mod +4, damage = max(1, 1+4) = 5
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('bludgeoning'))
  })

  it('defaults target to "a creature" when no args', () => {
    const ctx = makeCtx()
    unarmedAttackCommand.execute('', ctx)
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('a creature'))
  })
})

describe('aoeDamageCommand', () => {
  it('has correct metadata', () => {
    expect(aoeDamageCommand.name).toBe('aoedamage')
    expect(aoeDamageCommand.aliases).toContain('aoe')
    expect(aoeDamageCommand.dmOnly).toBe(true)
    expect(aoeDamageCommand.category).toBe('dm')
  })

  it('returns error for insufficient args', () => {
    const result = aoeDamageCommand.execute('8d6', makeCtx({ isDM: true })) as any
    expect(result.handled).toBe(false)
    expect(result.error).toContain('Usage')
  })

  it('returns error for invalid dice formula', () => {
    const result = aoeDamageCommand.execute('abc fire Goblin', makeCtx({ isDM: true })) as any
    expect(result.handled).toBe(false)
    expect(result.error).toContain('Invalid dice formula')
  })

  it('returns handled:true and broadcasts AoE damage', () => {
    const ctx = makeCtx({ isDM: true })
    const result = aoeDamageCommand.execute('3d8 fire Goblin1 Goblin2', ctx) as any
    expect(result).toEqual({ handled: true })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('AoE Damage'))
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('fire'))
  })
})

describe('attackCommand', () => {
  it('has correct metadata', () => {
    expect(attackCommand.name).toBe('attack')
    expect(attackCommand.aliases).toContain('atk')
    expect(attackCommand.dmOnly).toBe(false)
    expect(attackCommand.category).toBe('player')
  })

  it('returns error when no character loaded', () => {
    const result = attackCommand.execute('longsword Goblin', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('No character loaded')
  })

  it('returns error when insufficient args', () => {
    const ctx = makeCtx({ character: { id: 'c1', weapons: [] } as any })
    const result = attackCommand.execute('longsword', ctx) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns error when weapon not found', () => {
    vi.mocked(findWeapon).mockReturnValue(undefined)
    const ctx = makeCtx({ character: { id: 'c1', weapons: [] } as any })
    const result = attackCommand.execute('longsword Goblin', ctx) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('not found')
  })

  it('returns error when target not on map', () => {
    vi.mocked(findWeapon).mockReturnValue({ name: 'Longsword', damage: '1d8' } as any)
    vi.mocked(findTokenByName).mockReturnValue(undefined)
    const ctx = makeCtx({ character: { id: 'c1', weapons: [{ name: 'Longsword' }] } as any })
    const result = attackCommand.execute('longsword Goblin', ctx) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('not found on the map')
  })
})

describe('torchCommand', () => {
  it('has correct metadata', () => {
    expect(torchCommand.name).toBe('torch')
    expect(torchCommand.aliases).toContain('light')
    expect(torchCommand.aliases).toContain('lantern')
    expect(torchCommand.dmOnly).toBe(false)
  })

  it('returns error when no character loaded', () => {
    const result = torchCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('No character loaded')
  })

  it('returns error when token not on map', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [] }],
      activeLightSources: [],
      extinguishSource: vi.fn(),
      lightSource: vi.fn()
    } as any)
    const ctx = makeCtx({ character: { id: 'c1' } as any })
    const result = torchCommand.execute('', ctx) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('not on the map')
  })

  it('extinguishes a light source with "off"', () => {
    const extinguishSource = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ entityId: 'c1', id: 'tok-1' }] }],
      activeLightSources: [{ entityId: 'c1', id: 'ls-1', sourceName: 'Torch' }],
      extinguishSource,
      lightSource: vi.fn()
    } as any)
    const ctx = makeCtx({ character: { id: 'c1' } as any })
    const result = torchCommand.execute('off', ctx) as any
    expect(extinguishSource).toHaveBeenCalledWith('ls-1')
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('extinguishes')
  })

  it('lights a default torch when no args', () => {
    const lightSource = vi.fn()
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ entityId: 'c1', id: 'tok-1', label: 'Fighter' }] }],
      activeLightSources: [],
      extinguishSource: vi.fn(),
      lightSource
    } as any)
    const ctx = makeCtx({ character: { id: 'c1' } as any })
    const result = torchCommand.execute('', ctx) as any
    expect(lightSource).toHaveBeenCalled()
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Torch')
  })

  it('returns error for unknown light source', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      activeMapId: 'map-1',
      maps: [{ id: 'map-1', tokens: [{ entityId: 'c1', id: 'tok-1', label: 'Fighter' }] }],
      activeLightSources: [],
      extinguishSource: vi.fn(),
      lightSource: vi.fn()
    } as any)
    const ctx = makeCtx({ character: { id: 'c1' } as any })
    const result = torchCommand.execute('magicflame', ctx) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Unknown light source')
  })
})

describe('all attack commands share required shape', () => {
  const commands = [offhandAttackCommand, unarmedAttackCommand, aoeDamageCommand, attackCommand, torchCommand]

  it('each has name, aliases, description, usage, category, dmOnly, execute', () => {
    for (const cmd of commands) {
      expect(typeof cmd.name).toBe('string')
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.usage).toBe('string')
      expect(typeof cmd.category).toBe('string')
      expect(typeof cmd.dmOnly).toBe('boolean')
      expect(typeof cmd.execute).toBe('function')
    }
  })

  it('names are unique', () => {
    const names = commands.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
