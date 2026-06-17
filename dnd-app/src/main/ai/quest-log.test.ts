import { describe, expect, it } from 'vitest'
import {
  applyQuestOperation,
  chapterReadyToAdvance,
  emptyQuestLog,
  migrateLegacyQuests,
  type QuestLogFile,
  renderQuestLogBlock
} from './quest-log'

function add(file: QuestLogFile, name: string, description?: string, chapterQuest?: boolean): QuestLogFile {
  return applyQuestOperation(file, { kind: 'add', name, description, chapterQuest })
}

describe('emptyQuestLog', () => {
  it('starts at chapter 1 with no quests', () => {
    const f = emptyQuestLog()
    expect(f.version).toBe(1)
    expect(f.chapter.number).toBe(1)
    expect(f.quests).toEqual([])
  })
})

describe('migrateLegacyQuests', () => {
  it('splits "Name: desc" into a quest with one pending objective', () => {
    const [q] = migrateLegacyQuests(['Find the smith: ask around town'])
    expect(q.name).toBe('Find the smith')
    expect(q.description).toBe('ask around town')
    expect(q.status).toBe('active')
    expect(q.chapterQuest).toBe(false)
    expect(q.objectives).toHaveLength(1)
    expect(q.objectives[0]).toMatchObject({ id: 'o1', text: 'ask around town', status: 'pending' })
  })

  it('handles a name with no description and skips blanks', () => {
    const out = migrateLegacyQuests(['Rescue the prince', '', '   '])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Rescue the prince')
    expect(out[0].objectives[0].text).toBe('Rescue the prince')
  })

  it('de-collides ids for same-slug names', () => {
    const out = migrateLegacyQuests(['The Hunt: a', 'The Hunt: b'])
    expect(out.map((q) => q.id)).toEqual(['the-hunt', 'the-hunt-2'])
  })
})

describe('applyQuestOperation — legacy quest ops (F2 parity)', () => {
  it('add appends a new active quest; re-add is idempotent (updates, no dup)', () => {
    let f = add(emptyQuestLog(), 'Find the smith', 'desc')
    expect(f.quests).toHaveLength(1)
    f = add(f, 'Find the smith', 'updated desc')
    expect(f.quests).toHaveLength(1)
    expect(f.quests[0].description).toBe('updated desc')
  })

  it('update replaces a matched quest, or adds when none matches', () => {
    let f = add(emptyQuestLog(), 'Quest A', 'old')
    f = applyQuestOperation(f, { kind: 'update', name: 'Quest A', description: 'new' })
    expect(f.quests[0].description).toBe('new')
    f = applyQuestOperation(f, { kind: 'update', name: 'Quest B', description: 'b' })
    expect(f.quests).toHaveLength(2)
  })

  it('complete sets status completed (kept for the completed tail)', () => {
    let f = add(emptyQuestLog(), 'Quest A')
    f = applyQuestOperation(f, { kind: 'complete', name: 'Quest A' })
    expect(f.quests[0].status).toBe('completed')
  })

  it('remove sets status abandoned', () => {
    let f = add(emptyQuestLog(), 'Quest A')
    f = applyQuestOperation(f, { kind: 'remove', name: 'Quest A' })
    expect(f.quests[0].status).toBe('abandoned')
  })

  it('prefers an exact name match over a prefix match', () => {
    let f = add(emptyQuestLog(), 'Find the smith')
    f = add(f, "Find the smith's hammer")
    // "Find the smith" exactly matches the first, not the longer prefix-collision.
    f = applyQuestOperation(f, { kind: 'complete', name: 'Find the smith' })
    expect(f.quests.find((q) => q.name === 'Find the smith')?.status).toBe('completed')
    expect(f.quests.find((q) => q.name === "Find the smith's hammer")?.status).toBe('active')
  })
})

describe('applyQuestOperation — objective ops', () => {
  it('add_objective appends pending objectives with sequential ids (no dup text)', () => {
    let f = add(emptyQuestLog(), 'Q')
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Q', objective: 'Search the forge' })
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Q', objective: 'Ask the tavern' })
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Q', objective: 'search the forge' }) // dup
    expect(f.quests[0].objectives.map((o) => o.id)).toEqual(['o1', 'o2'])
  })

  it('complete_objective sets status + evidence; reopen clears them', () => {
    let f = add(emptyQuestLog(), 'Q')
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Q', objective: 'Find it' })
    f = applyQuestOperation(f, {
      kind: 'complete_objective',
      questName: 'Q',
      objective: 'o1',
      evidence: 'they found it'
    })
    expect(f.quests[0].objectives[0]).toMatchObject({ status: 'completed', evidence: 'they found it' })
    expect(f.quests[0].objectives[0].completedAt).toBeTruthy()
    f = applyQuestOperation(f, { kind: 'reopen_objective', questName: 'Q', objective: 'o1' })
    expect(f.quests[0].objectives[0].status).toBe('pending')
    expect(f.quests[0].objectives[0].evidence).toBeUndefined()
    expect(f.quests[0].objectives[0].completedAt).toBeUndefined()
  })

  it('complete_objective matches by objective text too', () => {
    let f = add(emptyQuestLog(), 'Q')
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Q', objective: 'Search the forge' })
    f = applyQuestOperation(f, { kind: 'complete_objective', questName: 'Q', objective: 'Search the forge' })
    expect(f.quests[0].objectives[0].status).toBe('completed')
  })

  it('fail_objective sets failed', () => {
    let f = add(emptyQuestLog(), 'Q')
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Q', objective: 'x' })
    f = applyQuestOperation(f, { kind: 'fail_objective', questName: 'Q', objective: 'o1' })
    expect(f.quests[0].objectives[0].status).toBe('failed')
  })

  it('does not throw on a missing quest/objective (silently no-ops)', () => {
    const f = applyQuestOperation(emptyQuestLog(), { kind: 'complete_objective', questName: 'Nope', objective: 'o1' })
    expect(f.quests).toEqual([])
  })
})

describe('applyQuestOperation — advance_chapter', () => {
  it('increments the chapter, sets title/goal, clears pendingChapterAdvance', () => {
    let f: QuestLogFile = { ...emptyQuestLog(), pendingChapterAdvance: { proposedAt: 't', reason: 'done' } }
    f = applyQuestOperation(f, { kind: 'advance_chapter', title: 'The Mines', goal: 'find the tremor source' })
    expect(f.chapter.number).toBe(2)
    expect(f.chapter.title).toBe('The Mines')
    expect(f.chapter.goal).toBe('find the tremor source')
    expect(f.pendingChapterAdvance).toBeUndefined()
  })
})

describe('chapterReadyToAdvance', () => {
  it('false with no chapter quests', () => {
    const f = add(emptyQuestLog(), 'Side quest')
    expect(chapterReadyToAdvance(f)).toBe(false)
  })

  it('true when every chapter quest has all objectives completed', () => {
    let f = add(emptyQuestLog(), 'Main', 'desc', true)
    f = applyQuestOperation(f, { kind: 'add_objective', questName: 'Main', objective: 'step' })
    expect(chapterReadyToAdvance(f)).toBe(false)
    f = applyQuestOperation(f, { kind: 'complete_objective', questName: 'Main', objective: 'o1' })
    expect(chapterReadyToAdvance(f)).toBe(true)
  })

  it('true when a chapter quest is itself completed', () => {
    let f = add(emptyQuestLog(), 'Main', 'desc', true)
    f = applyQuestOperation(f, { kind: 'complete', name: 'Main' })
    expect(chapterReadyToAdvance(f)).toBe(true)
  })
})

describe('renderQuestLogBlock', () => {
  it('returns empty string for a fresh default log', () => {
    expect(renderQuestLogBlock(emptyQuestLog())).toBe('')
  })

  it('renders chapter header, quest lines, objective checkboxes', () => {
    let f = applyQuestOperation(emptyQuestLog(), {
      kind: 'advance_chapter',
      title: 'The Mines',
      goal: 'find the source'
    })
    f = add(f, 'Find the missing smith', 'desc', true)
    f = applyQuestOperation(f, {
      kind: 'add_objective',
      questName: 'Find the missing smith',
      objective: 'Ask around the tavern'
    })
    f = applyQuestOperation(f, {
      kind: 'add_objective',
      questName: 'Find the missing smith',
      objective: 'Search the abandoned forge'
    })
    f = applyQuestOperation(f, { kind: 'complete_objective', questName: 'Find the missing smith', objective: 'o1' })
    const block = renderQuestLogBlock(f)
    expect(block).toContain('[QUEST LOG]')
    expect(block).toContain('Chapter 2: The Mines — Goal: find the source')
    expect(block).toContain('- Find the missing smith [active] (chapter quest)')
    expect(block).toContain('[x] o1 Ask around the tavern')
    expect(block).toContain('[ ] o2 Search the abandoned forge')
    expect(block).toContain('[/QUEST LOG]')
  })

  it('caps the quest list at 10 and shows a completed tail', () => {
    let f = emptyQuestLog()
    for (let i = 0; i < 12; i++) f = add(f, `Quest ${i}`)
    f = applyQuestOperation(f, { kind: 'complete', name: 'Quest 0' })
    const block = renderQuestLogBlock(f)
    const questLines = block.split('\n').filter((l) => l.startsWith('- '))
    expect(questLines.length).toBe(10)
    expect(block).toContain('Recently completed: Quest 0')
  })
})
