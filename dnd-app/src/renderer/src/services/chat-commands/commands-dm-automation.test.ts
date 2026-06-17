import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandMessage } from './types'

vi.mock('../combat/monster-turn-executor', () => ({ buildMonsterTurnContext: vi.fn(), runMonsterTurn: vi.fn() }))
vi.mock('../combat/monster-turn-planner', () => ({ planMonsterTurn: vi.fn() }))
const { getGameStore } = vi.hoisted(() => ({ getGameStore: vi.fn() }))
vi.mock('../../stores/store-accessors', () => ({ getGameStore, getLobbyStore: vi.fn(), getNetworkStore: vi.fn() }))

import { buildMonsterTurnContext, runMonsterTurn } from '../combat/monster-turn-executor'
import { planMonsterTurn } from '../combat/monster-turn-planner'
import { commands } from './commands-dm-automation'

const [suggestTurn, monsterTurn] = commands

function withCurrentEntry(name: string | null): void {
  getGameStore.mockReturnValue({
    getState: () => ({ initiative: name ? { currentIndex: 0, entries: [{ entityName: name }] } : null })
  })
}

const ctxStub = { actor: {}, statBlock: {} } // not 'error' shaped
const planStub = { actorLabel: 'Goblin 1', intTier: 'low', rationale: ['Target: Aria (lowest HP%)'], steps: [] }

beforeEach(() => {
  vi.clearAllMocks()
  withCurrentEntry('Goblin 1')
})

describe('/suggestturn + /monsterturn (PHASE-30 30D)', () => {
  it('are DM-only', () => {
    expect(suggestTurn.dmOnly).toBe(true)
    expect(monsterTurn.dmOnly).toBe(true)
    expect(monsterTurn.aliases).toContain('runturn')
  })

  it('/suggestturn returns a private (system) plan with the rationale', () => {
    vi.mocked(buildMonsterTurnContext).mockReturnValue(ctxStub as never)
    vi.mocked(planMonsterTurn).mockReturnValue(planStub as never)
    const res = suggestTurn.execute('Goblin 1', {} as never) as CommandMessage
    expect(buildMonsterTurnContext).toHaveBeenCalledWith('Goblin 1', expect.anything())
    expect(res.type).toBe('system') // local-only — not 'broadcast'
    expect(res.content).toContain('Goblin 1')
    expect(res.content).toContain('Target: Aria')
  })

  it('/suggestturn defaults to the current initiative entry when no name is given', () => {
    vi.mocked(buildMonsterTurnContext).mockReturnValue(ctxStub as never)
    vi.mocked(planMonsterTurn).mockReturnValue(planStub as never)
    suggestTurn.execute('', {} as never)
    expect(buildMonsterTurnContext).toHaveBeenCalledWith('Goblin 1', expect.anything())
  })

  it('/suggestturn surfaces a context error', () => {
    vi.mocked(buildMonsterTurnContext).mockReturnValue({ error: 'No stat block linked to Goblin 1' })
    const res = suggestTurn.execute('Goblin 1', {} as never) as CommandMessage
    expect(res.type).toBe('error')
  })

  it('/monsterturn runs the engine (summary posted by the executor)', () => {
    vi.mocked(runMonsterTurn).mockReturnValue({
      summaryLines: [],
      attacksResolved: 1,
      damageDealt: 4,
      turnAdvanced: false
    })
    const res = monsterTurn.execute('Goblin 1', {} as never)
    expect(runMonsterTurn).toHaveBeenCalledWith('Goblin 1', expect.anything())
    expect(res).toBeUndefined()
  })

  it('/monsterturn surfaces an engine error', () => {
    vi.mocked(runMonsterTurn).mockReturnValue({ error: 'No initiative running' })
    const res = monsterTurn.execute('Goblin 1', {} as never) as CommandMessage
    expect(res.type).toBe('error')
  })

  it('both error when nothing is in initiative and no name is given', () => {
    withCurrentEntry(null)
    expect((suggestTurn.execute('', {} as never) as CommandMessage).type).toBe('error')
    expect((monsterTurn.execute('', {} as never) as CommandMessage).type).toBe('error')
  })
})
