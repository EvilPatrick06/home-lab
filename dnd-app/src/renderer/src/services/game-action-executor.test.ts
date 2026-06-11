import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 08A — stateful store so a same-batch place→initiative→move sequence sees fresh tokens.
const fixture = {
  tokens: [] as Array<Record<string, unknown>>,
  initEntries: null as Array<Record<string, unknown>> | null
}
const gameStoreState = (): Record<string, unknown> => ({
  activeMapId: 'map-1',
  maps: [{ id: 'map-1', tokens: fixture.tokens, walls: [], regions: [], drawings: [] }],
  initiative: fixture.initEntries ? { entries: fixture.initEntries } : null,
  addToken: (_mapId: string, token: Record<string, unknown>) => fixture.tokens.push(token),
  moveToken: vi.fn(),
  removeToken: vi.fn(),
  updateToken: vi.fn(),
  initTurnState: vi.fn(),
  startInitiative: (entries: Array<Record<string, unknown>>) => {
    fixture.initEntries = entries
  }
})
vi.mock('../stores/store-accessors', () => ({
  getGameStore: () => ({ getState: gameStoreState }),
  getLobbyStore: () => ({ getState: () => ({ addChatMessage: vi.fn() }) }),
  getNetworkStore: () => ({ getState: () => ({ sendMessage: vi.fn() }) }),
  getAiDmStore: () => ({ getState: () => ({ dmApprovalRequired: false }) })
}))
vi.mock('./game-actions/broadcast-helpers', () => ({
  broadcastTokenSync: vi.fn(),
  broadcastInitiativeSync: vi.fn(),
  postDmMessage: vi.fn()
}))

let uuidCounter = 0
vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++uuidCounter}` })

describe('game-action-executor', () => {
  const srcPath = resolve(__dirname, './game-action-executor.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports executeDmActions function', () => {
    expect(src).toContain('export function executeDmActions')
  })

  it('exports registerPluginDmAction function', () => {
    expect(src).toContain('export function registerPluginDmAction')
  })

  it('exports unregisterPluginDmAction function', () => {
    expect(src).toContain('export function unregisterPluginDmAction')
  })

  it('exports DmAction type', () => {
    expect(src).toContain('export type { DmAction')
  })

  it('exports ExecutionResult type', () => {
    expect(src).toContain('ExecutionResult')
  })

  it('defines MAX_ACTIONS_PER_BATCH constant', () => {
    expect(src).toContain('MAX_ACTIONS_PER_BATCH')
  })

  // 04B — DM-approval queueing enqueues onto the FIFO pendingActionSets, not the old single slot.
  it('enqueues pending actions via enqueuePendingActions (not the removed setPendingActions)', () => {
    expect(src).toContain('enqueuePendingActions')
    expect(src).not.toContain('setPendingActions(')
  })
})

// 08A — fresh-state batch execution: each action validates/executes against current store state.
describe('executeDmActions fresh-state batch (08A)', () => {
  beforeEach(() => {
    fixture.tokens = []
    fixture.initEntries = null
    uuidCounter = 0
  })

  it('links a same-batch place_token → start_initiative entry to the placed token', async () => {
    const { executeDmActions } = await import('./game-action-executor')
    const result = executeDmActions(
      [
        { action: 'place_token', label: 'Goblin', gridX: 3, gridY: 3, entityType: 'enemy' },
        {
          action: 'start_initiative',
          entries: [{ label: 'Goblin', roll: 12, modifier: 2, entityType: 'enemy' }]
        }
      ] as never,
      true
    )
    expect(result.failed).toHaveLength(0)
    const placed = fixture.tokens[0]
    expect(fixture.initEntries?.[0].entityId).toBe(placed.entityId) // real token, not a fresh UUID
  })

  it('does not reject a same-batch move_token targeting the just-placed token', async () => {
    const { executeDmActions } = await import('./game-action-executor')
    const result = executeDmActions(
      [
        { action: 'place_token', label: 'Orc', gridX: 1, gridY: 1, entityType: 'enemy' },
        { action: 'move_token', label: 'Orc', gridX: 2, gridY: 2 }
      ] as never,
      true
    )
    expect(result.failed).toHaveLength(0)
    expect(result.executed).toHaveLength(2)
  })

  it('still rejects an action targeting a genuinely absent token', async () => {
    const { executeDmActions } = await import('./game-action-executor')
    const result = executeDmActions([{ action: 'move_token', label: 'Ghost', gridX: 5, gridY: 5 }] as never, true)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].reason).toMatch(/not found/i)
  })
})
