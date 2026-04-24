import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 15),
  rollMultiple: vi.fn((count: number) => Array.from({ length: count }, () => 12))
}))

import {
  dashCommand,
  delayactionCommand,
  disengageCommand,
  dodgeCommand,
  grappleCommand,
  hideCommand,
  multiattackCommand,
  reactionCommand,
  readyactionCommand,
  searchCommand,
  shoveCommand,
  useobjCommand
} from './action-commands'
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

describe('grappleCommand', () => {
  it('has correct metadata', () => {
    expect(grappleCommand.name).toBe('grapple')
    expect(grappleCommand.aliases).toContain('grab')
    expect(grappleCommand.dmOnly).toBe(false)
    expect(grappleCommand.category).toBe('player')
    expect(typeof grappleCommand.execute).toBe('function')
  })

  it('returns a broadcast message with the target name', () => {
    const result = grappleCommand.execute('Orc', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('TestPlayer')
    expect(result.content).toContain('grapple')
    expect(result.content).toContain('Orc')
  })

  it('defaults target to "a creature" when no args', () => {
    const result = grappleCommand.execute('', makeCtx()) as any
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
    const result = shoveCommand.execute('Goblin', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Prone')
  })

  it('returns away effect when specified', () => {
    const result = shoveCommand.execute('away Goblin', makeCtx()) as any
    expect(result.content).toContain('5 feet away')
  })
})

describe('readyactionCommand', () => {
  it('has correct metadata', () => {
    expect(readyactionCommand.name).toBe('readyaction')
    expect(readyactionCommand.aliases).toContain('ready')
  })

  it('returns error when no trigger provided', () => {
    const result = readyactionCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns broadcast with trigger description', () => {
    const result = readyactionCommand.execute('when the door opens', makeCtx()) as any
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
    const result = delayactionCommand.execute('', makeCtx()) as any
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
    const result = multiattackCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('error')
    expect(result.content).toContain('Usage')
  })

  it('returns error for count exceeding 10', () => {
    const result = multiattackCommand.execute('11', makeCtx()) as any
    expect(result.type).toBe('error')
  })

  it('returns broadcast with attack results for valid count', () => {
    const result = multiattackCommand.execute('3', makeCtx()) as any
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
    const result = reactionCommand.execute('use Opportunity Attack', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Reaction')
    expect(result.content).toContain('Opportunity Attack')
  })

  it('returns system for "reset"', () => {
    const result = reactionCommand.execute('reset', makeCtx()) as any
    expect(result.type).toBe('system')
    expect(result.content).toContain('reset')
  })

  it('returns error for unknown subcommand', () => {
    const result = reactionCommand.execute('invalid', makeCtx()) as any
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
    const result = useobjCommand.execute('opens a chest', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('opens a chest')
  })

  it('defaults to "an object" when no args', () => {
    const result = useobjCommand.execute('', makeCtx()) as any
    expect(result.content).toContain('an object')
  })
})

describe('dashCommand', () => {
  it('has correct metadata', () => {
    expect(dashCommand.name).toBe('dash')
    expect(dashCommand.aliases).toEqual([])
  })

  it('returns broadcast about Dash action', () => {
    const result = dashCommand.execute('', makeCtx()) as any
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
    const result = disengageCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Disengage')
  })
})

describe('dodgeCommand', () => {
  it('has correct metadata', () => {
    expect(dodgeCommand.name).toBe('dodge')
  })

  it('returns broadcast about Dodge action', () => {
    const result = dodgeCommand.execute('', makeCtx()) as any
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
    const result = hideCommand.execute('', makeCtx()) as any
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
    const result = searchCommand.execute('', makeCtx()) as any
    expect(result.type).toBe('broadcast')
    expect(result.content).toContain('Perception')
  })

  it('uses Investigation when specified', () => {
    const result = searchCommand.execute('investigation', makeCtx()) as any
    expect(result.content).toContain('Investigation')
  })
})

describe('all action commands share required shape', () => {
  const commands = [
    grappleCommand,
    shoveCommand,
    readyactionCommand,
    delayactionCommand,
    multiattackCommand,
    reactionCommand,
    useobjCommand,
    dashCommand,
    disengageCommand,
    dodgeCommand,
    hideCommand,
    searchCommand
  ]

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

  it('names are lowercase without leading slash', () => {
    for (const cmd of commands) {
      expect(cmd.name).not.toMatch(/^\//)
      expect(cmd.name).toBe(cmd.name.toLowerCase())
    }
  })
})
