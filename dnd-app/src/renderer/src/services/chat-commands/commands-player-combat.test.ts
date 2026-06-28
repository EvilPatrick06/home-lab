import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))
vi.mock('../../data/light-sources', () => ({
  LIGHT_SOURCE_LABELS: { torch: 'Torch' },
  LIGHT_SOURCES: { torch: { brightRadius: 20, dimRadius: 40, durationSeconds: 3600 } }
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
vi.mock('../combat/attack-resolver', () => ({
  findWeapon: vi.fn(),
  formatAttackResult: vi.fn(() => 'attack result'),
  resolveAttack: vi.fn()
}))
vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 10),
  rollMultiple: vi.fn((count: number) => Array(count).fill(5))
}))
vi.mock('./command-dice-utils', () => ({
  findTokenByName: vi.fn(),
  rollD20WithTag: vi.fn(() => ({ roll: 15, tag: '' }))
}))

import { useGameStore } from '../../stores/use-game-store'
import { findWeapon } from '../combat/attack-resolver'
import { commands } from './commands-player-combat'
import { findTokenByName } from './command-dice-utils'
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
  } as unknown as CommandContext
}

type AnyResult = any

describe('commands-player-combat', () => {
  it('exports a commands array', () => {
    expect(Array.isArray(commands)).toBe(true)
    expect(commands.length).toBeGreaterThan(0)
  })

  it('every command has the required fields', () => {
    for (const cmd of commands) {
      expect(typeof cmd.name).toBe('string')
      expect(cmd.name.length).toBeGreaterThan(0)
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(typeof cmd.description).toBe('string')
      expect(cmd.description.length).toBeGreaterThan(0)
      expect(typeof cmd.usage).toBe('string')
      expect(cmd.usage.length).toBeGreaterThan(0)
      expect(['player', 'dm', 'ai']).toContain(cmd.category)
      expect(typeof cmd.dmOnly).toBe('boolean')
      expect(typeof cmd.execute).toBe('function')
    }
  })

  it('command names are unique within the module', () => {
    const names = commands.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('contains expected command names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toContain('grapple')
    expect(names).toContain('shove')
    expect(names).toContain('readyaction')
    expect(names).toContain('delayaction')
    expect(names).toContain('multiattack')
    expect(names).toContain('reaction')
    expect(names).toContain('useobj')
    expect(names).toContain('dash')
    expect(names).toContain('disengage')
    expect(names).toContain('dodge')
    expect(names).toContain('hide')
    expect(names).toContain('search')
    expect(names).toContain('offhand')
    expect(names).toContain('unarmed')
    expect(names).toContain('aoedamage')
    expect(names).toContain('attack')
    expect(names).toContain('torch')
  })

  it('most player-combat commands are not dmOnly', () => {
    const playerCmds = commands.filter((c) => c.category === 'player')
    for (const cmd of playerCmds) {
      expect(cmd.dmOnly).toBe(false)
    }
  })

  it('aoedamage command is dmOnly', () => {
    const aoe = commands.find((c) => c.name === 'aoedamage')
    expect(aoe?.dmOnly).toBe(true)
    expect(aoe?.category).toBe('dm')
  })

  it('aliases are unique across all commands in the module', () => {
    const allAliases: string[] = []
    for (const cmd of commands) {
      allAliases.push(...cmd.aliases)
    }
    expect(new Set(allAliases).size).toBe(allAliases.length)
  })

  it('aliases do not collide with command names', () => {
    const names = new Set(commands.map((c) => c.name))
    for (const cmd of commands) {
      for (const alias of cmd.aliases) {
        expect(names.has(alias)).toBe(false)
      }
    }
  })

  it('commands with examples have them as arrays of strings', () => {
    for (const cmd of commands) {
      if (cmd.examples) {
        expect(Array.isArray(cmd.examples)).toBe(true)
        for (const ex of cmd.examples) {
          expect(typeof ex).toBe('string')
        }
      }
    }
  })
})

// ── Behavioral coverage ported from the deleted action-commands.ts/attack-commands.ts ──
// (live copies are byte-identical; commands looked up via the registry array)
beforeEach(() => {
  vi.clearAllMocks()
})

const grappleCommand = commands.find((c) => c.name === 'grapple')!
const shoveCommand = commands.find((c) => c.name === 'shove')!
const readyactionCommand = commands.find((c) => c.name === 'readyaction')!
const delayactionCommand = commands.find((c) => c.name === 'delayaction')!
const multiattackCommand = commands.find((c) => c.name === 'multiattack')!
const reactionCommand = commands.find((c) => c.name === 'reaction')!
const useobjCommand = commands.find((c) => c.name === 'useobj')!
const dashCommand = commands.find((c) => c.name === 'dash')!
const disengageCommand = commands.find((c) => c.name === 'disengage')!
const dodgeCommand = commands.find((c) => c.name === 'dodge')!
const hideCommand = commands.find((c) => c.name === 'hide')!
const searchCommand = commands.find((c) => c.name === 'search')!
const offhandAttackCommand = commands.find((c) => c.name === 'offhand')!
const unarmedAttackCommand = commands.find((c) => c.name === 'unarmed')!
const aoeDamageCommand = commands.find((c) => c.name === 'aoedamage')!
const attackCommand = commands.find((c) => c.name === 'attack')!
const torchCommand = commands.find((c) => c.name === 'torch')!

describe('grappleCommand', () => {
  it('has correct metadata', () => {
    expect(grappleCommand.name).toBe('grapple')
    expect(grappleCommand.aliases).toContain('grab')
    expect(grappleCommand.dmOnly).toBe(false)
    expect(grappleCommand.category).toBe('player')
    expect(typeof grappleCommand.execute).toBe('function')
  })

  it('returns a broadcast message with the target name', () => {
    const result = grappleCommand.execute('Orc', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('TestPlayer')
    expect(result.content).toContain('grapple')
    expect(result.content).toContain('Orc')
  })

  it('defaults target to "a creature" when no args', () => {
    const result = grappleCommand.execute('', makeCtx()) as AnyResult
    expect(result.content).toContain('a creature')
  })
})

describe('shoveCommand', () => {
  it('has correct metadata', () => {
    expect(shoveCommand.name).toBe('shove')
    expect(shoveCommand.aliases).toContain('push')
    expect(shoveCommand.dmOnly).toBe(false)
  })

  it('returns prone effect by default', () => {
    const result = shoveCommand.execute('Goblin', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Prone')
  })

  it('returns away effect when specified', () => {
    const result = shoveCommand.execute('away Goblin', makeCtx()) as AnyResult
    expect(result.content).toContain('5 feet away')
  })
})

describe('readyactionCommand', () => {
  it('has correct metadata', () => {
    expect(readyactionCommand.name).toBe('readyaction')
    expect(readyactionCommand.aliases).toContain('ready')
  })

  it('returns error when no trigger provided', () => {
    const result = readyactionCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns broadcast with trigger description', () => {
    const result = readyactionCommand.execute('when the door opens', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('when the door opens')
    expect(result.content).toContain('readies an action')
  })
})

describe('delayactionCommand', () => {
  it('has correct metadata', () => {
    expect(delayactionCommand.name).toBe('delayaction')
    expect(delayactionCommand.aliases).toContain('delay')
  })

  it('returns broadcast that player delays turn', () => {
    const result = delayactionCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('delays their turn')
  })
})

describe('multiattackCommand', () => {
  it('has correct metadata', () => {
    expect(multiattackCommand.name).toBe('multiattack')
    expect(multiattackCommand.aliases).toContain('ma')
  })

  it('returns error for invalid count', () => {
    const result = multiattackCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns error for count exceeding 10', () => {
    const result = multiattackCommand.execute('11', makeCtx()) as AnyResult
    expect(result.type).toBe('error')
  })

  it('returns broadcast with attack results for valid count', () => {
    const result = multiattackCommand.execute('3', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Multiattack (3)')
    expect(result.content).toContain('Attack 1:')
    expect(result.content).toContain('Attack 2:')
    expect(result.content).toContain('Attack 3:')
  })
})

describe('reactionCommand', () => {
  it('has correct metadata', () => {
    expect(reactionCommand.name).toBe('reaction')
    expect(reactionCommand.aliases).toContain('rx')
  })

  it('returns broadcast for "use"', () => {
    const result = reactionCommand.execute('use Opportunity Attack', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Reaction')
    expect(result.content).toContain('Opportunity Attack')
  })

  it('returns system for "reset"', () => {
    const result = reactionCommand.execute('reset', makeCtx()) as AnyResult
    expect(result.type).toBe('system')
    expect(result.content).toContain('reset')
  })

  it('returns error for unknown subcommand', () => {
    const result = reactionCommand.execute('invalid', makeCtx()) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })
})

describe('useobjCommand', () => {
  it('has correct metadata', () => {
    expect(useobjCommand.name).toBe('useobj')
    expect(useobjCommand.aliases).toContain('interact')
    expect(useobjCommand.aliases).toContain('object')
  })

  it('returns broadcast with description', () => {
    const result = useobjCommand.execute('opens a chest', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('opens a chest')
  })

  it('defaults to "an object" when no args', () => {
    const result = useobjCommand.execute('', makeCtx()) as AnyResult
    expect(result.content).toContain('an object')
  })
})

describe('dashCommand', () => {
  it('has correct metadata', () => {
    expect(dashCommand.name).toBe('dash')
    expect(dashCommand.aliases).toEqual([])
  })

  it('returns broadcast about Dash action', () => {
    const result = dashCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Dash')
    expect(result.content).toContain('double movement')
  })
})

describe('disengageCommand', () => {
  it('has correct metadata', () => {
    expect(disengageCommand.name).toBe('disengage')
  })

  it('returns broadcast about Disengage action', () => {
    const result = disengageCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Disengage')
  })
})

describe('dodgeCommand', () => {
  it('has correct metadata', () => {
    expect(dodgeCommand.name).toBe('dodge')
  })

  it('returns broadcast about Dodge action', () => {
    const result = dodgeCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Dodge')
    expect(result.content).toContain('disadvantage')
  })
})

describe('hideCommand', () => {
  it('has correct metadata', () => {
    expect(hideCommand.name).toBe('hide')
    expect(hideCommand.aliases).toContain('stealth')
  })

  it('returns broadcast with Stealth check', () => {
    const result = hideCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Hide')
    expect(result.content).toContain('Stealth')
  })
})

describe('searchCommand', () => {
  it('has correct metadata', () => {
    expect(searchCommand.name).toBe('search')
  })

  it('defaults to Perception check', () => {
    const result = searchCommand.execute('', makeCtx()) as AnyResult
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Perception')
  })

  it('uses Investigation when specified', () => {
    const result = searchCommand.execute('investigation', makeCtx()) as AnyResult
    expect(result.content).toContain('Investigation')
  })
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
    const result = offhandAttackCommand.execute('Goblin 1d6', ctx) as AnyResult
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
    const result = unarmedAttackCommand.execute('Orc', ctx) as AnyResult
    expect(result).toEqual({ handled: true })
    expect(ctx.broadcastSystemMessage).toHaveBeenCalledWith(expect.stringContaining('unarmed strike'))
  })

  it('uses character STR modifier when character is available', () => {
    const ctx = makeCtx({
      character: { abilityScores: { strength: 18 } } as AnyResult
    })
    unarmedAttackCommand.execute('Goblin', ctx)
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
    const result = aoeDamageCommand.execute('8d6', makeCtx({ isDM: true })) as AnyResult
    expect(result.handled).toBe(false)
    expect(result.error).toContain('Usage')
  })

  it('returns error for invalid dice formula', () => {
    const result = aoeDamageCommand.execute('abc fire Goblin', makeCtx({ isDM: true })) as AnyResult
    expect(result.handled).toBe(false)
    expect(result.error).toContain('Invalid dice formula')
  })

  it('returns handled:true and broadcasts AoE damage', () => {
    const ctx = makeCtx({ isDM: true })
    const result = aoeDamageCommand.execute('3d8 fire Goblin1 Goblin2', ctx) as AnyResult
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
    const result = attackCommand.execute('longsword Goblin', makeCtx()) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('No character loaded')
  })

  it('returns error when insufficient args', () => {
    const ctx = makeCtx({ character: { id: 'c1', weapons: [] } as AnyResult })
    const result = attackCommand.execute('longsword', ctx) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns error when weapon not found', () => {
    vi.mocked(findWeapon).mockReturnValue(undefined)
    const ctx = makeCtx({ character: { id: 'c1', weapons: [] } as AnyResult })
    const result = attackCommand.execute('longsword Goblin', ctx) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('not found')
  })

  it('returns error when target not on map', () => {
    vi.mocked(findWeapon).mockReturnValue({ name: 'Longsword', damage: '1d8' } as AnyResult)
    vi.mocked(findTokenByName).mockReturnValue(undefined)
    const ctx = makeCtx({ character: { id: 'c1', weapons: [{ name: 'Longsword' }] } as AnyResult })
    const result = attackCommand.execute('longsword Goblin', ctx) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('not found on the map')
  })
})

describe('torchCommand', () => {
  it('has correct metadata', () => {
    expect(torchCommand.name).toBe('torch')
    expect(torchCommand.aliases).toContain('lantern')
    expect(torchCommand.dmOnly).toBe(false)
  })

  it('returns error when no character loaded', () => {
    const result = torchCommand.execute('', makeCtx()) as AnyResult
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
    } as AnyResult)
    const ctx = makeCtx({ character: { id: 'c1' } as AnyResult })
    const result = torchCommand.execute('', ctx) as AnyResult
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
    } as AnyResult)
    const ctx = makeCtx({ character: { id: 'c1' } as AnyResult })
    const result = torchCommand.execute('off', ctx) as AnyResult
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
    } as AnyResult)
    const ctx = makeCtx({ character: { id: 'c1' } as AnyResult })
    const result = torchCommand.execute('', ctx) as AnyResult
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
    } as AnyResult)
    const ctx = makeCtx({ character: { id: 'c1' } as AnyResult })
    const result = torchCommand.execute('magicflame', ctx) as AnyResult
    expect(result.type).toBe('error')
    expect(result.content).toContain('Unknown light source')
  })
})
