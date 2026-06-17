/**
 * PHASE-28 28A — structured quest store (pure logic, no I/O).
 *
 * The engine owns quest truth: discrete quests with objectives, statuses, and a chapter
 * pointer. The LLM only mutates this through validated actions (28B) — it never invents or
 * silently drops quests. `MemoryManager` (memory-manager.ts) persists a `QuestLogFile` per
 * campaign in `quests.json` through its `mutate()` lock and renders it into the AI context.
 *
 * This module is deliberately dependency-free (no electron/fs) so it is fully unit-testable.
 */

export type ObjectiveStatus = 'pending' | 'completed' | 'failed'
export interface QuestObjective {
  id: string // 'o1', 'o2', … unique within the quest
  text: string
  status: ObjectiveStatus
  completedAt?: string // ISO
  evidence?: string // transcript quote from the checker (28C)
}

export type QuestStatus = 'active' | 'completed' | 'failed' | 'abandoned'
export interface QuestRecord {
  id: string // slug of name + '-2' suffix on collision
  name: string
  description: string
  status: QuestStatus
  chapterQuest: boolean // counts toward chapter advancement
  objectives: QuestObjective[]
  createdAt: string
  updatedAt: string
}

export interface ChapterState {
  number: number
  title?: string
  goal?: string
  startedAt: string
}

export interface QuestLogFile {
  version: 1
  chapter: ChapterState
  pendingChapterAdvance?: { proposedAt: string; reason: string }
  quests: QuestRecord[]
}

// The full operation surface — quest-level (legacy `update_quest_log` ops), objective-level
// (28B `update_quest_objective`), and chapter (`advance_chapter`). One discriminated union so
// `applyQuestOperation` is the single mutation entry point.
export type QuestOperation =
  | { kind: 'add'; name: string; description?: string; chapterQuest?: boolean }
  | { kind: 'update'; name: string; description?: string; chapterQuest?: boolean }
  | { kind: 'complete'; name: string }
  | { kind: 'remove'; name: string }
  | { kind: 'add_objective'; questName: string; objective: string }
  | { kind: 'complete_objective'; questName: string; objective: string; evidence?: string }
  | { kind: 'fail_objective'; questName: string; objective: string }
  | { kind: 'reopen_objective'; questName: string; objective: string }
  | { kind: 'propose_chapter_advance'; reason: string } // 28C — checker proposes, DM confirms
  | { kind: 'advance_chapter'; title?: string; goal?: string }

const RENDER_QUEST_CAP = 10
const RENDER_OBJECTIVE_CAP = 8
const RENDER_COMPLETED_CAP = 3

function nowIso(): string {
  return new Date().toISOString()
}

// Slug derivation identical to npcMemoryFromAttitude / world-state-store.slugifyId
// (memory-manager.ts:65-69) so quest ids share the project-wide convention. Inlined to keep
// this module I/O-free (importing slugifyId would pull electron into the import graph).
function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueQuestId(name: string, quests: QuestRecord[]): string {
  const base = slug(name) || 'quest'
  if (!quests.some((q) => q.id === base)) return base
  let n = 2
  while (quests.some((q) => q.id === `${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Exact case-insensitive name match first, then prefix (preserves the legacy F2 behaviour). */
function findQuestIndex(quests: QuestRecord[], name: string): number {
  const q = name.trim().toLowerCase()
  if (!q) return -1
  const exact = quests.findIndex((r) => r.name.toLowerCase() === q)
  if (exact >= 0) return exact
  return quests.findIndex((r) => r.name.toLowerCase().startsWith(q))
}

/** Match an objective within a quest by exact id first, then case-insensitive text. */
function findObjectiveIndex(objectives: QuestObjective[], key: string): number {
  const k = key.trim().toLowerCase()
  if (!k) return -1
  const byId = objectives.findIndex((o) => o.id.toLowerCase() === k)
  if (byId >= 0) return byId
  return objectives.findIndex((o) => o.text.toLowerCase() === k || o.text.toLowerCase().startsWith(k))
}

function nextObjectiveId(objectives: QuestObjective[]): string {
  let n = objectives.length + 1
  while (objectives.some((o) => o.id === `o${n}`)) n++
  return `o${n}`
}

export function emptyQuestLog(): QuestLogFile {
  return { version: 1, chapter: { number: 1, startedAt: nowIso() }, quests: [] }
}

/** Each legacy `"Name: desc"` string → one active quest with a single pending objective. */
export function migrateLegacyQuests(legacy: string[]): QuestRecord[] {
  const out: QuestRecord[] = []
  for (const raw of legacy) {
    const line = (raw ?? '').trim()
    if (!line) continue
    const sep = line.indexOf(': ')
    const name = (sep >= 0 ? line.slice(0, sep) : line).trim()
    const description = sep >= 0 ? line.slice(sep + 2).trim() : ''
    if (!name) continue
    const now = nowIso()
    out.push({
      id: uniqueQuestId(name, out),
      name,
      description,
      status: 'active',
      chapterQuest: false,
      objectives: [{ id: 'o1', text: description || name, status: 'pending' }],
      createdAt: now,
      updatedAt: now
    })
  }
  return out
}

/** The single quest-mutation entry point. Pure: returns a new file, never mutates the input. */
export function applyQuestOperation(file: QuestLogFile, op: QuestOperation): QuestLogFile {
  const now = nowIso()
  const quests = file.quests.map((q) => ({ ...q, objectives: q.objectives.map((o) => ({ ...o })) }))

  const touchQuest = (idx: number): void => {
    quests[idx] = { ...quests[idx], updatedAt: now }
  }

  switch (op.kind) {
    case 'add': {
      const idx = findQuestIndex(quests, op.name)
      if (idx >= 0) {
        // Idempotent: re-adding an existing quest updates its fields rather than duplicating.
        quests[idx] = {
          ...quests[idx],
          description: op.description ?? quests[idx].description,
          chapterQuest: op.chapterQuest ?? quests[idx].chapterQuest,
          status: 'active',
          updatedAt: now
        }
      } else {
        quests.push({
          id: uniqueQuestId(op.name, quests),
          name: op.name.trim(),
          description: op.description ?? '',
          status: 'active',
          chapterQuest: op.chapterQuest ?? false,
          objectives: [],
          createdAt: now,
          updatedAt: now
        })
      }
      break
    }
    case 'update': {
      const idx = findQuestIndex(quests, op.name)
      if (idx >= 0) {
        quests[idx] = {
          ...quests[idx],
          description: op.description ?? quests[idx].description,
          chapterQuest: op.chapterQuest ?? quests[idx].chapterQuest,
          updatedAt: now
        }
      } else {
        quests.push({
          id: uniqueQuestId(op.name, quests),
          name: op.name.trim(),
          description: op.description ?? '',
          status: 'active',
          chapterQuest: op.chapterQuest ?? false,
          objectives: [],
          createdAt: now,
          updatedAt: now
        })
      }
      break
    }
    case 'complete': {
      const idx = findQuestIndex(quests, op.name)
      if (idx >= 0) quests[idx] = { ...quests[idx], status: 'completed', updatedAt: now }
      break
    }
    case 'remove': {
      const idx = findQuestIndex(quests, op.name)
      if (idx >= 0) quests[idx] = { ...quests[idx], status: 'abandoned', updatedAt: now }
      break
    }
    case 'add_objective': {
      const idx = findQuestIndex(quests, op.questName)
      if (idx >= 0) {
        const objectives = quests[idx].objectives
        if (!objectives.some((o) => o.text.toLowerCase() === op.objective.trim().toLowerCase())) {
          objectives.push({ id: nextObjectiveId(objectives), text: op.objective.trim(), status: 'pending' })
          touchQuest(idx)
        }
      }
      break
    }
    case 'complete_objective': {
      const idx = findQuestIndex(quests, op.questName)
      if (idx >= 0) {
        const oi = findObjectiveIndex(quests[idx].objectives, op.objective)
        if (oi >= 0) {
          quests[idx].objectives[oi] = {
            ...quests[idx].objectives[oi],
            status: 'completed',
            completedAt: now,
            evidence: op.evidence
          }
          touchQuest(idx)
        }
      }
      break
    }
    case 'fail_objective': {
      const idx = findQuestIndex(quests, op.questName)
      if (idx >= 0) {
        const oi = findObjectiveIndex(quests[idx].objectives, op.objective)
        if (oi >= 0) {
          quests[idx].objectives[oi] = { ...quests[idx].objectives[oi], status: 'failed', completedAt: now }
          touchQuest(idx)
        }
      }
      break
    }
    case 'reopen_objective': {
      const idx = findQuestIndex(quests, op.questName)
      if (idx >= 0) {
        const oi = findObjectiveIndex(quests[idx].objectives, op.objective)
        if (oi >= 0) {
          quests[idx].objectives[oi] = {
            ...quests[idx].objectives[oi],
            status: 'pending',
            completedAt: undefined,
            evidence: undefined
          }
          touchQuest(idx)
        }
      }
      break
    }
    case 'propose_chapter_advance': {
      return { ...file, quests, pendingChapterAdvance: { proposedAt: now, reason: op.reason } }
    }
    case 'advance_chapter': {
      return {
        ...file,
        quests,
        chapter: {
          number: file.chapter.number + 1,
          title: op.title,
          goal: op.goal,
          startedAt: now
        },
        pendingChapterAdvance: undefined
      }
    }
  }

  return { ...file, quests }
}

/** A chapter is ready when at least one chapter quest exists and every one is done
 *  (status completed, or all of its objectives completed). */
export function chapterReadyToAdvance(file: QuestLogFile): boolean {
  const chapterQuests = file.quests.filter((q) => q.chapterQuest && q.status !== 'abandoned')
  if (chapterQuests.length === 0) return false
  return chapterQuests.every((q) =>
    q.status === 'completed' ? true : q.objectives.length > 0 && q.objectives.every((o) => o.status === 'completed')
  )
}

function objectiveMark(status: ObjectiveStatus): string {
  return status === 'completed' ? '[x]' : status === 'failed' ? '[✗]' : '[ ]'
}

/** Render the bounded `[QUEST LOG]` context block. Returns '' for an empty default log. */
export function renderQuestLogBlock(file: QuestLogFile): string {
  const completed = file.quests.filter((q) => q.status === 'completed')
  // Active + failed render in the main list; abandoned never renders; completed becomes a tail.
  const live = file.quests
    .filter((q) => q.status === 'active' || q.status === 'failed')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, RENDER_QUEST_CAP)

  const isDefault =
    file.quests.length === 0 &&
    file.chapter.number === 1 &&
    !file.chapter.title &&
    !file.chapter.goal &&
    !file.pendingChapterAdvance
  if (isDefault) return ''

  const lines: string[] = ['[QUEST LOG]']
  lines.push(
    '(Engine-tracked truth. Reference objectives exactly; mark progress ONLY via update_quest_log / update_quest_objective actions — never invent or silently drop quests.)'
  )
  const chapterTitle = file.chapter.title
    ? `Chapter ${file.chapter.number}: ${file.chapter.title}`
    : `Chapter ${file.chapter.number}`
  lines.push(file.chapter.goal ? `${chapterTitle} — Goal: ${file.chapter.goal}` : chapterTitle)
  if (file.pendingChapterAdvance) lines.push('(Chapter objectives complete — awaiting DM confirmation to advance.)')

  for (const q of live) {
    const tag = q.chapterQuest ? ` [${q.status}] (chapter quest)` : ` [${q.status}]`
    lines.push(`- ${q.name}${tag}`)
    for (const o of q.objectives.slice(0, RENDER_OBJECTIVE_CAP)) {
      lines.push(`  ${objectiveMark(o.status)} ${o.id} ${o.text}`)
    }
  }

  if (completed.length > 0) {
    const names = completed
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, RENDER_COMPLETED_CAP)
      .map((q) => q.name)
      .join(', ')
    lines.push(`Recently completed: ${names}`)
  }

  lines.push('[/QUEST LOG]')
  return lines.join('\n')
}
