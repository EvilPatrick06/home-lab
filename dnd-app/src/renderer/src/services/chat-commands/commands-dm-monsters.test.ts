import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertCommandNameFormat,
  assertCommandShape,
  assertUniqueCommandNames,
  createCommandContext
} from '../../test-helpers'

const mockUpdateToken = vi.fn()

const mockGameState = {
  conditions: [],
  maps: [
    {
      id: 'map-1',
      name: 'Test Map',
      tokens: [
        { id: 't1', label: 'Goblin', entityType: 'enemy', currentHP: 10, maxHP: 10 },
        { id: 't2', label: 'Fighter', entityType: 'player', currentHP: 30, maxHP: 50 }
      ]
    }
  ],
  activeMapId: 'map-1',
  round: 1,
  turnStates: {},
  updateToken: mockUpdateToken
}

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => mockGameState)
  }
}))

import { commands } from './commands-dm-monsters'

function makeCtx(overrides: Partial<Parameters<typeof createCommandContext>[0]> = {}) {
  return createCommandContext({
    isDM: true,
    openModalWithArgs: vi.fn(),
    ...overrides
  } as Parameters<typeof createCommandContext>[0])
}

describe('commands-dm-monsters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset tokens to default state
    mockGameState.maps[0].tokens = [
      { id: 't1', label: 'Goblin', entityType: 'enemy', currentHP: 10, maxHP: 10 },
      { id: 't2', label: 'Fighter', entityType: 'player', currentHP: 30, maxHP: 50 }
    ]
  })

  // ── Shape tests ──────────────────────────────────────────────
  it('every command has required fields', () => assertCommandShape(commands))
  it('names are unique', () => assertUniqueCommandNames(commands))
  it('names are lowercase without leading slash', () => assertCommandNameFormat(commands))

  it('all commands are dmOnly and dm category', () => {
    for (const cmd of commands) {
      expect(cmd.dmOnly).toBe(true)
      expect(cmd.category).toBe('dm')
    }
  })

  it('contains all 10 expected commands', () => {
    const names = commands.map((c) => c.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'statblock',
        'cr',
        'spawn',
        'kill',
        'legendary',
        'lair',
        'healall',
        'npcmood',
        'npcsay',
        'revive'
      ])
    )
    expect(commands).toHaveLength(10)
  })

  // ── /statblock ───────────────────────────────────────────────
  describe('statblock', () => {
    const cmd = () => commands.find((c) => c.name === 'statblock')!

    it('has aliases sb and stats', () => {
      expect(cmd().aliases).toContain('sb')
      expect(cmd().aliases).toContain('stats')
    })

    it('returns error when no name given', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('opens creatures modal with search arg', () => {
      const ctx = makeCtx()
      cmd().execute('Goblin', ctx)
      expect(ctx.openModalWithArgs).toHaveBeenCalledWith('creatures', { search: 'Goblin' })
    })

    it('passes multi-word name as search', () => {
      const ctx = makeCtx()
      cmd().execute('Ancient Red Dragon', ctx)
      expect(ctx.openModalWithArgs).toHaveBeenCalledWith('creatures', { search: 'Ancient Red Dragon' })
    })
  })

  // ── /cr ──────────────────────────────────────────────────────
  describe('cr', () => {
    const cmd = () => commands.find((c) => c.name === 'cr')!

    it('has alias challengerating', () => {
      expect(cmd().aliases).toContain('challengerating')
    })

    it('returns error when no rating given', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('opens creatures modal with cr arg', () => {
      const ctx = makeCtx()
      cmd().execute('5', ctx)
      expect(ctx.openModalWithArgs).toHaveBeenCalledWith('creatures', { cr: '5' })
    })

    it('passes fractional CR like 1/2', () => {
      const ctx = makeCtx()
      cmd().execute('1/2', ctx)
      expect(ctx.openModalWithArgs).toHaveBeenCalledWith('creatures', { cr: '1/2' })
    })
  })

  // ── /spawn ───────────────────────────────────────────────────
  describe('spawn', () => {
    const cmd = () => commands.find((c) => c.name === 'spawn')!

    it('returns error when no name given', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('returns error when count exceeds 20', () => {
      const result = cmd().execute('Goblin x25', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('between 1 and 20') })
    })

    it('returns error when count is 0', () => {
      const result = cmd().execute('Goblin x0', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('between 1 and 20') })
    })

    it('broadcasts single creature spawn', () => {
      const result = cmd().execute('Goblin', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Goblin') })
      expect((result as { content: string }).content).not.toContain('x ')
    })

    it('broadcasts multi-creature spawn with count prefix', () => {
      const result = cmd().execute('Goblin x3', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('3x') })
      expect((result as { content: string }).content).toContain('Goblin')
    })

    it('broadcasts max valid count (x20)', () => {
      const result = cmd().execute('Kobold x20', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('20x') })
    })
  })

  // ── /kill ────────────────────────────────────────────────────
  describe('kill', () => {
    const cmd = () => commands.find((c) => c.name === 'kill')!

    it('has alias slay', () => {
      expect(cmd().aliases).toContain('slay')
    })

    it('returns error when no target given', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('returns error when no active map token matches', () => {
      const result = cmd().execute('nobody', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('No token found') })
    })

    it('kills named token by partial match', () => {
      const result = cmd().execute('goblin', makeCtx())
      expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 't1', { currentHP: 0 })
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Goblin') })
    })

    it('kills all enemies when target is "all"', () => {
      const result = cmd().execute('all', makeCtx())
      expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 't1', { currentHP: 0 })
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('1 creatures') })
    })

    it('reports 0 killed when no enemies alive', () => {
      mockGameState.maps[0].tokens[0].currentHP = 0
      const result = cmd().execute('all', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('0 creatures') })
    })
  })

  // ── /legendary ───────────────────────────────────────────────
  describe('legendary', () => {
    const cmd = () => commands.find((c) => c.name === 'legendary')!

    it('has aliases legend and la', () => {
      expect(cmd().aliases).toContain('legend')
      expect(cmd().aliases).toContain('la')
    })

    it('returns error with only creature name (no action)', () => {
      const result = cmd().execute('Dragon', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('returns error when empty', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('broadcasts creature and action', () => {
      const result = cmd().execute('Dragon Tail Attack', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Dragon') })
      expect((result as { content: string }).content).toContain('Tail Attack')
    })

    it('handles multi-word action', () => {
      const result = cmd().execute('Lich Disrupt Life (costs 3 actions)', makeCtx())
      expect((result as { content: string }).content).toContain('Lich')
      expect((result as { content: string }).content).toContain('Disrupt Life')
    })
  })

  // ── /lair ────────────────────────────────────────────────────
  describe('lair', () => {
    const cmd = () => commands.find((c) => c.name === 'lair')!

    it('returns error when no description given', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('broadcasts lair action description', () => {
      const result = cmd().execute('The walls rumble and stones fall', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Lair Action') })
      expect((result as { content: string }).content).toContain('The walls rumble')
    })
  })

  // ── /healall ─────────────────────────────────────────────────
  describe('healall', () => {
    const cmd = () => commands.find((c) => c.name === 'healall')!

    it('heals all player tokens to full HP', () => {
      const result = cmd().execute('', makeCtx())
      expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 't2', { currentHP: 50 })
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('1 characters') })
    })

    it('does not heal enemy tokens', () => {
      cmd().execute('', makeCtx())
      // t1 is an enemy — updateToken should not be called for it from healall
      const calls = mockUpdateToken.mock.calls
      const goblinCall = calls.find((c) => c[1] === 't1')
      expect(goblinCall).toBeUndefined()
    })
  })

  // ── /npcmood ─────────────────────────────────────────────────
  describe('npcmood', () => {
    const cmd = () => commands.find((c) => c.name === 'npcmood')!

    it('has aliases mood and attitude', () => {
      expect(cmd().aliases).toContain('mood')
      expect(cmd().aliases).toContain('attitude')
    })

    it('rejects invalid mood', () => {
      const result = cmd().execute('Guard angry', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Mood must be') })
    })

    it('returns error with only one arg', () => {
      const result = cmd().execute('Guard', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('accepts friendly mood', () => {
      const result = cmd().execute('Guard friendly', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Friendly') })
      expect((result as { content: string }).content).toContain('Guard')
    })

    it('accepts hostile mood', () => {
      const result = cmd().execute('Bartender hostile', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Hostile') })
    })

    it('accepts indifferent mood', () => {
      const result = cmd().execute('Merchant indifferent', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Indifferent') })
    })

    it('handles multi-word NPC name', () => {
      const result = cmd().execute('City Guard Captain friendly', makeCtx())
      expect((result as { content: string }).content).toContain('City Guard Captain')
    })
  })

  // ── /npcsay ──────────────────────────────────────────────────
  describe('npcsay', () => {
    const cmd = () => commands.find((c) => c.name === 'npcsay')!

    it('returns error with no args', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('returns error with only NPC name and no dialogue', () => {
      const result = cmd().execute('Innkeeper', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('broadcasts NPC dialogue', () => {
      const result = cmd().execute('Innkeeper Welcome traveler!', makeCtx())
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Innkeeper') })
      expect((result as { content: string }).content).toContain('Welcome traveler!')
    })

    it('wraps dialogue in quotes', () => {
      const result = cmd().execute('Guard Halt who goes there', makeCtx())
      const content = (result as { content: string }).content
      expect(content).toMatch(/".*"/)
    })
  })

  // ── /revive ──────────────────────────────────────────────────
  describe('revive', () => {
    const cmd = () => commands.find((c) => c.name === 'revive')!

    it('has alias stabilize', () => {
      expect(cmd().aliases).toContain('stabilize')
    })

    it('returns error when no name given', () => {
      const result = cmd().execute('', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('Usage') })
    })

    it('returns error when no token matches', () => {
      const result = cmd().execute('nobody', makeCtx())
      expect(result).toEqual({ type: 'error', content: expect.stringContaining('No token found') })
    })

    it('revives matching token to 1 HP', () => {
      mockGameState.maps[0].tokens[0].currentHP = 0
      const result = cmd().execute('goblin', makeCtx())
      expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 't1', { currentHP: 1 })
      expect(result).toEqual({ type: 'broadcast', content: expect.stringContaining('Goblin') })
      expect((result as { content: string }).content).toContain('1 HP')
    })
  })
})
