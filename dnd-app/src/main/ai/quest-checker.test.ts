import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./memory-manager', () => ({ getMemoryManager: vi.fn() }))

import { getMemoryManager } from './memory-manager'
import { runQuestCheck } from './quest-checker'
import { applyQuestOperation, emptyQuestLog, type QuestLogFile, type QuestOperation } from './quest-log'

// A stateful in-memory MemoryManager double: getQuestLog returns the live file, mutateQuestLog
// applies the op via the real (pure) applyQuestOperation.
function makeMemMgr(initial: QuestLogFile) {
  const state = { file: initial }
  return {
    getQuestLog: vi.fn(async () => state.file),
    mutateQuestLog: vi.fn(async (op: QuestOperation) => {
      state.file = applyQuestOperation(state.file, op)
      return state.file
    })
  }
}

function build(ops: QuestOperation[]): QuestLogFile {
  let f = emptyQuestLog()
  for (const op of ops) f = applyQuestOperation(f, op)
  return f
}

const provider = { structuredOnce: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runQuestCheck', () => {
  it('makes no LLM call when there are no pending objectives', async () => {
    const memMgr = makeMemMgr(emptyQuestLog())
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    const res = await runQuestCheck('c1', [], provider, 'model')
    expect(res.applied).toEqual([])
    expect(provider.structuredOnce).not.toHaveBeenCalled()
  })

  it('applies a valid objective completion (filtered against the store)', async () => {
    const file = build([
      { kind: 'add', name: 'Main' },
      { kind: 'add_objective', questName: 'Main', objective: 'Find the relic' }
    ])
    const memMgr = makeMemMgr(file)
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    provider.structuredOnce.mockResolvedValueOnce(
      JSON.stringify({
        updates: [{ questId: 'main', objectiveId: 'o1', result: 'completed', evidence: 'they found it' }]
      })
    )
    const res = await runQuestCheck('c1', [{ role: 'assistant', content: 'You find the relic.' }], provider, 'model')
    expect(res.applied).toHaveLength(1)
    expect(res.applied[0]).toMatchObject({ questId: 'main', objectiveId: 'o1', result: 'completed' })
    expect(memMgr.mutateQuestLog).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'complete_objective', questName: 'Main', objective: 'o1' })
    )
  })

  it('drops hallucinated / non-existent objective ids', async () => {
    const file = build([
      { kind: 'add', name: 'Main' },
      { kind: 'add_objective', questName: 'Main', objective: 'Find the relic' }
    ])
    const memMgr = makeMemMgr(file)
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    provider.structuredOnce.mockResolvedValueOnce(
      JSON.stringify({ updates: [{ questId: 'ghost', objectiveId: 'o9', result: 'completed', evidence: 'nope' }] })
    )
    const res = await runQuestCheck('c1', [], provider, 'model')
    expect(res.applied).toEqual([])
    expect(memMgr.mutateQuestLog).not.toHaveBeenCalled()
  })

  it('retries once on malformed JSON then skips silently', async () => {
    const file = build([
      { kind: 'add', name: 'Main' },
      { kind: 'add_objective', questName: 'Main', objective: 'x' }
    ])
    vi.mocked(getMemoryManager).mockReturnValue(makeMemMgr(file) as never)
    provider.structuredOnce.mockResolvedValue('not json at all')
    const res = await runQuestCheck('c1', [], provider, 'model')
    expect(res.applied).toEqual([])
    expect(provider.structuredOnce).toHaveBeenCalledTimes(2) // one retry
  })

  it('skips when the provider lacks structuredOnce', async () => {
    const file = build([
      { kind: 'add', name: 'Main' },
      { kind: 'add_objective', questName: 'Main', objective: 'x' }
    ])
    vi.mocked(getMemoryManager).mockReturnValue(makeMemMgr(file) as never)
    const res = await runQuestCheck('c1', [], {}, 'model')
    expect(res.applied).toEqual([])
  })

  it('proposes chapter advancement once when chapter quests complete (never auto-advances)', async () => {
    const file = build([
      { kind: 'add', name: 'Main', chapterQuest: true },
      { kind: 'add_objective', questName: 'Main', objective: 'Defeat the boss' }
    ])
    const memMgr = makeMemMgr(file)
    vi.mocked(getMemoryManager).mockReturnValue(memMgr as never)
    provider.structuredOnce.mockResolvedValueOnce(
      JSON.stringify({ updates: [{ questId: 'main', objectiveId: 'o1', result: 'completed', evidence: 'boss down' }] })
    )
    const res = await runQuestCheck('c1', [], provider, 'model')
    expect(res.pendingChapterAdvance?.reason).toContain('Main')
    expect(memMgr.mutateQuestLog).toHaveBeenCalledWith(expect.objectContaining({ kind: 'propose_chapter_advance' }))
    // Never calls advance_chapter itself.
    expect(memMgr.mutateQuestLog).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'advance_chapter' }))
  })
})
