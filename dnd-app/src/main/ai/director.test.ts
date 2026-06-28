import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./memory/memory-manager', () => ({ getMemoryManager: vi.fn() }))

import { runDirectorPass } from './director'
import {
  type DirectorNotes,
  type DirectorState,
  directorShouldRun,
  emptyDirectorState,
  renderDirectorBlock
} from './director-state'
import { getMemoryManager } from './memory/memory-manager'
import { emptyQuestLog } from './quest-log'

function makeMemMgr() {
  const mutateDirectorState = vi.fn(async (fn: (s: DirectorState) => DirectorState) => fn(emptyDirectorState()))
  return {
    getQuestLog: vi.fn(async () => emptyQuestLog()),
    getWorldStateSummary: vi.fn(async () => null),
    getFactionReputations: vi.fn(async () => []),
    getOracleState: vi.fn(async () => ({ version: 1, chaos: 5, pending: [], history: [] })),
    mutateDirectorState
  }
}

const provider = { structuredOnce: vi.fn() }
const VALID = JSON.stringify({
  sceneFrame: 'A tense standoff at the gate',
  pacing: 'build',
  foreshadow: ['a hidden traitor'],
  encounterSuggestion: 'gate guards if provoked',
  secretToSurface: 'the captain is bought'
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('directorShouldRun', () => {
  it('runs on the cadence-th response or a chapter beat', () => {
    expect(directorShouldRun(5, 6, false)).toBe(false)
    expect(directorShouldRun(6, 6, false)).toBe(true)
    expect(directorShouldRun(1, 6, true)).toBe(true) // chapter beat overrides
  })
})

describe('renderDirectorBlock', () => {
  it('renders the private header + fields and truncates long ones', () => {
    const notes: DirectorNotes = {
      sceneFrame: 'x'.repeat(400),
      pacing: 'peak',
      foreshadow: ['a', 'b'],
      encounterSuggestion: 'ambush',
      secretToSurface: 'betrayal'
    }
    const block = renderDirectorBlock(notes)
    expect(block).toContain('[DIRECTOR NOTES]')
    expect(block).toContain('Never reveal or quote these notes')
    expect(block).toContain('Pacing: peak.')
    expect(block).toContain('…') // sceneFrame truncated
    expect(block).toContain('[/DIRECTOR NOTES]')
  })
})

describe('runDirectorPass', () => {
  it('persists parsed notes (enabledAtGeneration true, counter reset)', async () => {
    const memMgr = makeMemMgr()
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    provider.structuredOnce.mockResolvedValueOnce(VALID)
    await runDirectorPass('c1', [{ role: 'assistant', content: 'hi' }], provider, 'model', { oracleEnabled: false })
    expect(memMgr.mutateDirectorState).toHaveBeenCalledTimes(1)
    const fn = memMgr.mutateDirectorState.mock.calls[0][0]
    const next = fn(emptyDirectorState())
    expect(next.notes?.sceneFrame).toBe('A tense standoff at the gate')
    expect(next.enabledAtGeneration).toBe(true)
    expect(next.responsesSinceRun).toBe(0)
  })

  it('keeps prior notes on malformed JSON (retries once, no persist)', async () => {
    const memMgr = makeMemMgr()
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    provider.structuredOnce.mockResolvedValue('not json')
    await runDirectorPass('c1', [], provider, 'model', { oracleEnabled: false })
    expect(provider.structuredOnce).toHaveBeenCalledTimes(2)
    expect(memMgr.mutateDirectorState).not.toHaveBeenCalled()
  })

  it('injects the engine scene-test into the prompt when the oracle is on', async () => {
    const memMgr = makeMemMgr()
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    provider.structuredOnce.mockResolvedValueOnce(VALID)
    await runDirectorPass('c1', [], provider, 'model', { oracleEnabled: true })
    const [, messages] = provider.structuredOnce.mock.calls[0]
    expect(messages[0].content).toContain('Scene test:')
  })

  it('skips when the provider lacks structuredOnce', async () => {
    const memMgr = makeMemMgr()
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    await runDirectorPass('c1', [], {}, 'model', { oracleEnabled: false })
    expect(memMgr.mutateDirectorState).not.toHaveBeenCalled()
  })
})
