import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { logSecurityEvent } from '../../security-log'
import { type DirectorState, emptyDirectorState, renderDirectorBlock } from '../director-state'
import {
  emptyOracleState,
  type FateCheckResult,
  type OracleEntry,
  type OracleState,
  renderOracleBlock
} from '../oracle'
import {
  applyQuestOperation,
  emptyQuestLog,
  migrateLegacyQuests,
  type QuestLogFile,
  type QuestOperation,
  renderQuestLogBlock
} from '../quest-log'
import type { FactionReputation, NPCPersonality, WorldStateSummary } from '../types'

// Phase 20e — memory size budget.
const MAX_MEMORY_FILE_SIZE = 1 * 1024 * 1024 // 1 MB per ai-context file
const MAX_TOTAL_MEMORY_SIZE = 10 * 1024 * 1024 // 10 MB across the ai-context dir

/**
 * Local calendar date stamp (YYYY-MM-DD) from LOCAL date parts. NOT
 * toISOString(), which is UTC — an evening session west of UTC would file under
 * tomorrow's date, and a per-message UTC id splits a sitting at 00:00 UTC.
 * (ISSUES-LOG-DNDAPP 2026-07-15)
 */
function localDateStamp(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// PHASE-31 31C — private campaign Q&A history, capped at the most recent N exchanges.
const QA_LOG_CAP = 50
export interface QaLogEntry {
  id: string
  question: string
  answer: string
  timestamp: string
}

// Per-campaign memory files stored in userData/campaigns/{campaignId}/ai-context/

export interface WorldState {
  currentMapId: string | null
  currentMapName: string | null
  timeOfDay: string
  weather: string
  currentScene: string
  activeTokenPositions: Array<{ name: string; gridX: number; gridY: number; hp?: string }>
  updatedAt: string
}

export interface CombatState {
  inCombat: boolean
  round: number
  currentTurnEntity: string | null
  entries: Array<{
    name: string
    initiative: number
    hp: { current: number; max: number }
    conditions: string[]
    isPlayer: boolean
  }>
  updatedAt: string
}

export interface NPCMemory {
  id: string
  name: string
  role: string
  attitude: 'friendly' | 'neutral' | 'hostile' | 'unknown'
  location: string
  notes: string
  firstEncountered: string
  lastSeen: string
}

/**
 * Build an NPCMemory from a parsed `npc_attitude` stat-change so the AI's
 * characterization of an NPC is persisted (it was parsed but never saved = silent
 * world-state loss). The StatChange's 'indifferent' maps to 'neutral'; timestamps
 * are filled in by upsertNPC.
 */
/** Parse an ISO timestamp to epoch ms, treating empty/invalid dates as 0 (oldest)
 *  so a missing lastSeen/firstVisited can't poison a recency sort with NaN. */
function recencyMs(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

export function npcMemoryFromAttitude(name: string, attitude: string, reason: string): NPCMemory {
  const mapped: NPCMemory['attitude'] =
    attitude === 'friendly' ? 'friendly' : attitude === 'hostile' ? 'hostile' : 'neutral'
  return {
    id: name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
    name: name.trim(),
    role: '',
    attitude: mapped,
    location: '',
    notes: reason,
    firstEncountered: '',
    lastSeen: ''
  }
}

interface PlaceMemory {
  id: string
  name: string
  type: string
  description: string
  discovered: boolean
  linkedMapId: string | null
  firstVisited: string
}

interface RulingsEntry {
  id: string
  timestamp: string
  question: string
  ruling: string
  citation: string
  overriddenByDM: boolean
}

export class MemoryManager {
  private basePath: string
  // Session-history log id for the current sitting — derived ONCE (local date)
  // and cached so a session never splits across files. (ISSUES-LOG 2026-07-15)
  private sessionLogId?: string

  constructor(campaignId: string) {
    this.basePath = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true })
  }

  private async readJson<T>(filename: string): Promise<T | null> {
    try {
      const data = await fs.readFile(path.join(this.basePath, filename), 'utf-8')
      return JSON.parse(data) as T
    } catch {
      return null
    }
  }

  private async writeJson(filename: string, data: unknown): Promise<void> {
    await this.ensureDir()
    // Phase 20e — per-file cap. If an array file outgrows MAX_MEMORY_FILE_SIZE,
    // prune oldest entries (front of the array) until it fits, so unbounded NPC/
    // place/ruling growth can't balloon a single file.
    let payload = data
    if (Array.isArray(payload)) {
      let arr = payload as unknown[]
      while (arr.length > 1 && Buffer.byteLength(JSON.stringify(arr), 'utf-8') > MAX_MEMORY_FILE_SIZE) {
        arr = arr.slice(1)
      }
      payload = arr
    }
    const serialized = JSON.stringify(payload, null, 2)
    if (Buffer.byteLength(serialized, 'utf-8') > MAX_MEMORY_FILE_SIZE) {
      logSecurityEvent('ai.memory.file_oversize', { filename, bytes: Buffer.byteLength(serialized, 'utf-8') })
    }
    await fs.writeFile(path.join(this.basePath, filename), serialized, 'utf-8')
    await this.enforceTotalSize()
  }

  // Phase 20e — total ai-context budget. When the directory exceeds the cap,
  // rotate the largest file to `.old` (single generation) to reclaim space
  // without silently dropping the most recent writes.
  private async enforceTotalSize(): Promise<void> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true })
      const files = entries.filter((e) => e.isFile() && !e.name.endsWith('.old'))
      const sized = await Promise.all(
        files.map(async (e) => ({ name: e.name, size: (await fs.stat(path.join(this.basePath, e.name))).size }))
      )
      const total = sized.reduce((sum, f) => sum + f.size, 0)
      if (total <= MAX_TOTAL_MEMORY_SIZE) return
      logSecurityEvent('ai.memory.total_oversize', { bytes: total })
      const largest = sized.sort((a, b) => b.size - a.size)[0]
      if (largest) {
        await fs.rename(path.join(this.basePath, largest.name), path.join(this.basePath, `${largest.name}.old`))
      }
    } catch {
      // best-effort; never block a write on budget enforcement
    }
  }

  // Phase 17d (NET-11) — per-file write queue. Concurrent AI DM actions used to read-modify-write
  // the same JSON file and clobber each other (last write wins). `mutate` chains each
  // read→modify→write on a per-filename promise so they apply sequentially.
  private fileLocks = new Map<string, Promise<unknown>>()

  private async mutate<T>(filename: string, mutator: (current: T) => T, fallback: T): Promise<void> {
    const prev = this.fileLocks.get(filename) ?? Promise.resolve()
    const task = prev.then(async () => {
      const current = (await this.readJson<T>(filename)) ?? fallback
      await this.writeJson(filename, mutator(current))
    })
    // Keep the chain alive even if one task throws, so later queued mutations still run.
    this.fileLocks.set(
      filename,
      task.catch(() => {})
    )
    return task
  }

  // --- World State ---
  async getWorldState(): Promise<WorldState | null> {
    return this.readJson<WorldState>('world-state.json')
  }

  async updateWorldState(updates: Partial<WorldState>): Promise<void> {
    // PHASE-27 27B: serialize the read-modify-write through mutate() (was an unlocked
    // getWorldState→spread→writeJson, racing the two renderer sync writers + quest writes).
    await this.mutate<WorldState>(
      'world-state.json',
      (current) => ({ ...current, ...updates, updatedAt: new Date().toISOString() }),
      {
        currentMapId: null,
        currentMapName: null,
        timeOfDay: 'morning',
        weather: 'clear',
        currentScene: '',
        activeTokenPositions: [],
        updatedAt: new Date().toISOString()
      }
    )
  }

  // --- Combat State ---
  async getCombatState(): Promise<CombatState | null> {
    return this.readJson<CombatState>('combat-state.json')
  }

  async updateCombatState(state: CombatState): Promise<void> {
    await this.writeJson('combat-state.json', { ...state, updatedAt: new Date().toISOString() })
  }

  // --- NPCs ---
  async getNPCs(): Promise<NPCMemory[]> {
    return (await this.readJson<NPCMemory[]>('npcs.json')) ?? []
  }

  async upsertNPC(npc: NPCMemory): Promise<void> {
    // Phase 17d (NET-11) — serialize read-modify-write so concurrent upserts don't clobber.
    await this.mutate<NPCMemory[]>(
      'npcs.json',
      (npcs) => {
        const idx = npcs.findIndex((n) => n.id === npc.id)
        if (idx >= 0) {
          npcs[idx] = { ...npcs[idx], ...npc, lastSeen: new Date().toISOString() }
        } else {
          npcs.push({ ...npc, firstEncountered: new Date().toISOString(), lastSeen: new Date().toISOString() })
        }
        return npcs
      },
      []
    )
  }

  // --- Places ---
  async getPlaces(): Promise<PlaceMemory[]> {
    return (await this.readJson<PlaceMemory[]>('places.json')) ?? []
  }

  async upsertPlace(place: PlaceMemory): Promise<void> {
    // Phase 17d (NET-11) — serialize read-modify-write.
    await this.mutate<PlaceMemory[]>(
      'places.json',
      (places) => {
        const idx = places.findIndex((p) => p.id === place.id)
        if (idx >= 0) {
          places[idx] = { ...places[idx], ...place }
        } else {
          places.push({ ...place, firstVisited: new Date().toISOString() })
        }
        return places
      },
      []
    )
  }

  // --- Session History ---
  /**
   * The session-history log id for the CURRENT sitting. Derived ONCE from the
   * LOCAL calendar date and cached, so every message AND the end-of-session
   * summary land in ONE file even if the sitting crosses local/UTC midnight.
   * Replaces the per-call `new Date().toISOString().slice(0, 10)` (UTC) ids
   * that mis-attributed evening sessions to tomorrow and split a sitting at
   * 00:00 UTC. (ISSUES-LOG-DNDAPP 2026-07-15)
   */
  getSessionLogId(): string {
    if (!this.sessionLogId) this.sessionLogId = localDateStamp()
    return this.sessionLogId
  }

  async appendSessionLog(sessionId: string, text: string): Promise<void> {
    await this.ensureDir()
    const histDir = path.join(this.basePath, 'session-history')
    await fs.mkdir(histDir, { recursive: true })
    const filePath = path.join(histDir, `${sessionId}.md`)
    await fs.appendFile(filePath, `${text}\n`, 'utf-8')
  }

  async getSessionLog(sessionId: string): Promise<string> {
    try {
      return await fs.readFile(path.join(this.basePath, 'session-history', `${sessionId}.md`), 'utf-8')
    } catch {
      return ''
    }
  }

  /** Sorted session-history dates (ascending; the last is the most recent). [] when none. (PHASE-31 31B) */
  async listSessionLogDates(): Promise<string[]> {
    try {
      const files = await fs.readdir(path.join(this.basePath, 'session-history'))
      return files
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.slice(0, -3))
        .sort()
    } catch {
      return []
    }
  }

  // --- Session-start recap cache (PHASE-31 31B) ---
  async getSessionStartRecap(): Promise<{ text: string; generatedAt: string } | null> {
    return this.readJson<{ text: string; generatedAt: string }>('session-start-recap.json')
  }

  async saveSessionStartRecap(recap: { text: string; generatedAt: string }): Promise<void> {
    await this.writeJson('session-start-recap.json', recap)
  }

  // --- Campaign Q&A log (PHASE-31 31C; private, capped, mutate-serialized) ---
  async getQaLog(): Promise<QaLogEntry[]> {
    return (await this.readJson<QaLogEntry[]>('qa-log.json')) ?? []
  }

  async appendQaEntry(entry: QaLogEntry): Promise<void> {
    await this.mutate<QaLogEntry[]>('qa-log.json', (cur) => [...cur, entry].slice(-QA_LOG_CAP), [])
  }

  async clearQaLog(): Promise<void> {
    await this.writeJson('qa-log.json', [])
  }

  // --- Campaign Notes ---
  async getCampaignNotes(): Promise<string> {
    try {
      return await fs.readFile(path.join(this.basePath, 'campaign-notes.md'), 'utf-8')
    } catch {
      return ''
    }
  }

  async updateCampaignNotes(notes: string): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(path.join(this.basePath, 'campaign-notes.md'), notes, 'utf-8')
  }

  // --- Rulings Log ---
  async getRulings(): Promise<RulingsEntry[]> {
    return (await this.readJson<RulingsEntry[]>('rulings-log.json')) ?? []
  }

  async addRuling(ruling: Omit<RulingsEntry, 'id' | 'timestamp'>): Promise<void> {
    // Phase 17d (NET-11) — serialize read-modify-write.
    await this.mutate<RulingsEntry[]>(
      'rulings-log.json',
      (rulings) => {
        rulings.push({
          ...ruling,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString()
        })
        return rulings
      },
      []
    )
  }

  // --- Character Context Cache ---
  async saveCharacterContext(characters: Array<{ id: string; formatted: string }>): Promise<void> {
    await this.writeJson('characters.json', {
      characters,
      updatedAt: new Date().toISOString()
    })
  }

  async getCharacterContext(): Promise<Array<{ id: string; formatted: string }> | null> {
    const data = await this.readJson<{ characters: Array<{ id: string; formatted: string }>; updatedAt: string }>(
      'characters.json'
    )
    return data?.characters ?? null
  }

  // --- NPC Personalities ---
  async getNpcPersonalities(): Promise<NPCPersonality[]> {
    return (await this.readJson<NPCPersonality[]>('npc-personalities.json')) ?? []
  }

  async setNpcPersonality(npc: NPCPersonality): Promise<void> {
    // Phase 17d (NET-11) — serialize read-modify-write.
    await this.mutate<NPCPersonality[]>(
      'npc-personalities.json',
      (personalities) => {
        const idx = personalities.findIndex((p) => p.npcId === npc.npcId)
        if (idx >= 0) {
          personalities[idx] = { ...personalities[idx], ...npc }
        } else {
          personalities.push(npc)
        }
        return personalities
      },
      []
    )
  }

  async getNpcPersonality(npcId: string): Promise<NPCPersonality | undefined> {
    const personalities = await this.getNpcPersonalities()
    return personalities.find((p) => p.npcId === npcId)
  }

  /** Find NPC by name (case-insensitive). PURE READ — callers create via mutateNpcPersonality. */
  async getNpcByName(name: string): Promise<NPCPersonality | undefined> {
    const personalities = await this.getNpcPersonalities()
    return personalities.find((p) => p.name.toLowerCase() === name.toLowerCase())
  }

  /**
   * PHASE-27 27B: serialized find-or-create-then-apply over npc-personalities.json. The
   * stub is created INSIDE the mutator (atomic with the write), so two concurrent calls for
   * the same new NPC can no longer each miss an unlocked read and create duplicate stubs.
   */
  private async mutateNpcPersonality(npcName: string, fn: (p: NPCPersonality) => NPCPersonality): Promise<void> {
    await this.mutate<NPCPersonality[]>(
      'npc-personalities.json',
      (personalities) => {
        const lc = npcName.toLowerCase()
        let idx = personalities.findIndex((p) => p.name.toLowerCase() === lc)
        if (idx < 0) {
          personalities.push({ npcId: crypto.randomUUID(), name: npcName, personality: '' })
          idx = personalities.length - 1
        }
        personalities[idx] = fn(personalities[idx])
        return personalities
      },
      []
    )
  }

  /** Log a conversation interaction with an NPC */
  async logNpcInteraction(
    npcName: string,
    summary: string,
    attitudeAfter: 'friendly' | 'neutral' | 'hostile'
  ): Promise<void> {
    await this.mutateNpcPersonality(npcName, (p) => {
      const log = p.conversationLog ?? []
      log.push({ timestamp: new Date().toISOString(), summary, attitudeAfter })
      if (log.length > 10) log.splice(0, log.length - 10) // keep last 10
      return { ...p, conversationLog: log, lastInteractionSummary: summary }
    })
  }

  /**
   * Set persistent NPC world-state fields (faction, current location, and the
   * DM-only secret motivation). Creates a stub personality if the NPC is new.
   * secretMotivation is intentionally never surfaced back to the AI in reads.
   */
  async updateNpcFields(
    npcName: string,
    fields: Partial<Pick<NPCPersonality, 'faction' | 'location' | 'secretMotivation'>>
  ): Promise<void> {
    await this.mutateNpcPersonality(npcName, (p) => ({ ...p, ...fields }))
  }

  /** Add a relationship between two NPCs */
  async addNpcRelationship(
    npcName: string,
    targetNpcName: string,
    relationship: string,
    disposition: 'friendly' | 'neutral' | 'hostile'
  ): Promise<void> {
    // Ensure the target exists (serialized create-if-absent), then read its id, then mutate
    // the source. Both writes go through the same file queue, so no interleave is possible.
    await this.mutateNpcPersonality(targetNpcName, (p) => p)
    const target = await this.getNpcByName(targetNpcName)
    if (!target) return
    await this.mutateNpcPersonality(npcName, (p) => {
      const rels = p.relationships ?? []
      const rel = { targetNpcId: target.npcId, targetName: targetNpcName, relationship, disposition }
      const existing = rels.findIndex((r) => r.targetNpcId === target.npcId)
      if (existing >= 0) rels[existing] = rel
      else rels.push(rel)
      return { ...p, relationships: rels }
    })
  }

  /** Get relationship web for context assembly */
  async getRelationshipWeb(): Promise<string> {
    const personalities = await this.getNpcPersonalities()
    const withRels = personalities.filter((p) => p.relationships?.length)
    if (withRels.length === 0) return ''
    const lines = withRels.flatMap((p) =>
      (p.relationships ?? []).map((r) => `${p.name} \u2192 ${r.targetName}: ${r.relationship} (${r.disposition})`)
    )
    return `[NPC RELATIONSHIPS]\n${lines.join('\n')}\n[/NPC RELATIONSHIPS]`
  }

  // --- World State Summary ---
  async getWorldStateSummary(): Promise<WorldStateSummary | null> {
    return this.readJson<WorldStateSummary>('world-state-summary.json')
  }

  async setWorldStateSummary(summary: WorldStateSummary): Promise<void> {
    // PHASE-27 27B: route the full-replace write through the file queue too, so it can't
    // interleave with updateQuestLog's serialized read-modify-write.
    await this.mutate<WorldStateSummary>(
      'world-state-summary.json',
      () => ({ ...summary, lastUpdated: new Date().toISOString() }),
      summary
    )
  }

  // --- Structured Quest Log (PHASE-28 28A) ---
  // quests.json is the engine-owned quest truth (structured quests/objectives/chapter).
  // The legacy `activeQuests: string[]` on world-state-summary is kept mirrored (names only)
  // so the raw-file viewer and any legacy reader stay coherent.

  /** Read the quest log; migrate the legacy `activeQuests` line in-memory when absent (the
   *  structured file is written on the first `mutateQuestLog`). */
  async getQuestLog(): Promise<QuestLogFile> {
    const existing = await this.readJson<QuestLogFile>('quests.json')
    if (existing) return existing
    const summary = await this.getWorldStateSummary()
    const file = emptyQuestLog()
    file.quests = migrateLegacyQuests(summary?.activeQuests ?? [])
    return file
  }

  /** Apply one quest operation under the per-file lock, then mirror active quest names (and the
   *  complete/advance_chapter recent-event lines) into world-state-summary. Returns the new file. */
  async mutateQuestLog(op: QuestOperation): Promise<QuestLogFile> {
    // Compute a migrated fallback up-front so the legacy activeQuests survive the first
    // structured write (mutate() re-reads inside the lock, so a concurrent create is seen).
    const existing = await this.readJson<QuestLogFile>('quests.json')
    let fallback = existing
    if (!fallback) {
      const summary = await this.getWorldStateSummary()
      fallback = emptyQuestLog()
      fallback.quests = migrateLegacyQuests(summary?.activeQuests ?? [])
    }
    let result: QuestLogFile = fallback
    await this.mutate<QuestLogFile>(
      'quests.json',
      (current) => {
        result = applyQuestOperation(current, op)
        return result
      },
      fallback
    )
    // Mirror into the legacy summary (names of active quests; recent-event lines for milestones).
    const activeNames = result.quests.filter((q) => q.status === 'active').map((q) => q.name)
    await this.mutate<WorldStateSummary>(
      'world-state-summary.json',
      (summary) => {
        let events = summary.recentEvents
        if (op.kind === 'complete') events = [...events, `Completed quest: ${op.name}`].slice(-20)
        if (op.kind === 'advance_chapter') {
          const label = result.chapter.title ? `: ${result.chapter.title}` : ''
          events = [...events, `Advanced to Chapter ${result.chapter.number}${label}`].slice(-20)
        }
        return { ...summary, activeQuests: activeNames, recentEvents: events, lastUpdated: new Date().toISOString() }
      },
      {
        currentLocation: 'Unknown',
        timeOfDay: 'unknown',
        activeQuests: activeNames,
        recentEvents: [],
        lastUpdated: new Date().toISOString()
      }
    )
    return result
  }

  /**
   * Legacy quest-log entry point (G32) — now a thin delegate to the structured store. Signature
   * unchanged so the existing action/IPC/executor chain is untouched. add/update accept a
   * description; complete/remove match by exact-then-prefix name (case-insensitive).
   */
  async updateQuestLog(
    operation: 'add' | 'update' | 'complete' | 'remove',
    name: string,
    description?: string,
    chapterQuest?: boolean
  ): Promise<void> {
    const op: QuestOperation =
      operation === 'add'
        ? { kind: 'add', name, description, chapterQuest }
        : operation === 'update'
          ? { kind: 'update', name, description, chapterQuest }
          : { kind: operation, name }
    await this.mutateQuestLog(op)
  }

  // --- Faction Reputation (G33) ---

  async getFactionReputations(): Promise<FactionReputation[]> {
    return (await this.readJson<FactionReputation[]>('faction-reputation.json')) ?? []
  }

  /** Adjust the party's standing with a faction by a delta (creates the entry if new). */
  async adjustFactionReputation(factionName: string, delta: number): Promise<void> {
    await this.mutate<FactionReputation[]>(
      'faction-reputation.json',
      (reps) => {
        const idx = reps.findIndex((r) => r.factionName.toLowerCase() === factionName.toLowerCase())
        const now = new Date().toISOString()
        if (idx >= 0) {
          reps[idx] = { ...reps[idx], partyStanding: reps[idx].partyStanding + delta, lastModified: now }
        } else {
          reps.push({ factionName, partyStanding: delta, lastModified: now })
        }
        return reps
      },
      []
    )
  }

  // --- Dice Oracle (PHASE-28 28D) ---
  async getOracleState(): Promise<OracleState> {
    return (await this.readJson<OracleState>('oracle-state.json')) ?? emptyOracleState()
  }

  /** Append a fate-check result to `pending` (shown to the model next turn) + the capped history. */
  async recordOracleFateCheck(result: FateCheckResult): Promise<OracleEntry> {
    const entry: OracleEntry = { ...result, at: new Date().toISOString() }
    await this.mutate<OracleState>(
      'oracle-state.json',
      (s) => ({ ...s, pending: [...s.pending, entry].slice(-10), history: [...s.history, entry].slice(-50) }),
      emptyOracleState()
    )
    return entry
  }

  /** Set or nudge the chaos factor, clamped to 1..9. Returns the new value. */
  async setOracleChaos(opts: { value?: number; delta?: number }): Promise<number> {
    let next = 5
    await this.mutate<OracleState>(
      'oracle-state.json',
      (s) => {
        const base = opts.value ?? s.chaos + (opts.delta ?? 0)
        next = Math.max(1, Math.min(9, Math.round(base)))
        return { ...s, chaos: next }
      },
      emptyOracleState()
    )
    return next
  }

  /** Move `pending` → consumed (clear it) once the model has seen the results in a response.
   *  No-op (no write) when nothing is pending, so oracle-unused campaigns stay byte-clean. */
  async consumeOraclePending(): Promise<void> {
    if ((await this.getOracleState()).pending.length === 0) return
    await this.mutate<OracleState>('oracle-state.json', (s) => ({ ...s, pending: [] }), emptyOracleState())
  }

  // --- Director planning notes (PHASE-28 28E) ---
  async getDirectorState(): Promise<DirectorState> {
    return (await this.readJson<DirectorState>('director-notes.json')) ?? emptyDirectorState()
  }

  /** Mutate director state under the file lock; returns the new state. */
  async mutateDirectorState(fn: (s: DirectorState) => DirectorState): Promise<DirectorState> {
    let result = emptyDirectorState()
    await this.mutate<DirectorState>(
      'director-notes.json',
      (s) => {
        result = fn(s)
        return result
      },
      emptyDirectorState()
    )
    return result
  }

  // --- Context Assembly for AI ---
  async assembleContext(currentScene?: string): Promise<string> {
    const [worldState, combatState, npcs, places, campaignNotes, npcPersonalities, worldStateSummary, rulings] =
      await Promise.all([
        this.getWorldState(),
        this.getCombatState(),
        this.getNPCs(),
        this.getPlaces(),
        this.getCampaignNotes(),
        this.getNpcPersonalities(),
        this.getWorldStateSummary(),
        this.getRulings()
      ])

    const sections: string[] = []

    if (worldState) {
      sections.push(
        `[WORLD STATE] Map: ${worldState.currentMapName ?? 'Unknown'}, Time: ${worldState.timeOfDay}, Weather: ${worldState.weather}, Scene: ${worldState.currentScene}`
      )
    }

    // World state summary (events + location context). Quests moved to the structured
    // [QUEST LOG] block (PHASE-28 28A) — kept out of [WORLD SUMMARY] to avoid duplication.
    if (worldStateSummary) {
      const wsParts = [`Location: ${worldStateSummary.currentLocation}`, `Time: ${worldStateSummary.timeOfDay}`]
      if (worldStateSummary.weather) wsParts.push(`Weather: ${worldStateSummary.weather}`)
      if (worldStateSummary.recentEvents.length > 0) {
        wsParts.push(`Recent Events: ${worldStateSummary.recentEvents.join('; ')}`)
      }
      sections.push(`[WORLD SUMMARY] ${wsParts.join('. ')}`)
    }

    // Structured quest log (PHASE-28 28A) — engine-owned quests/objectives/chapter.
    const questBlock = renderQuestLogBlock(await this.getQuestLog())
    if (questBlock) sections.push(questBlock)

    // Dice-oracle results pending presentation (PHASE-28 28D) — authoritative facts, newest last,
    // consumed after the next finalize. Empty (default / oracle off) ⇒ no block.
    const oracleBlock = renderOracleBlock((await this.getOracleState()).pending.slice(-5))
    if (oracleBlock) sections.push(oracleBlock)

    // Director planning notes (PHASE-28 28E) — DM-private; rendered only when generated while
    // the director was enabled (flag snapshot). Never-enabled campaigns ⇒ no file ⇒ no block.
    const directorState = await this.getDirectorState()
    if (directorState.notes && directorState.enabledAtGeneration) {
      sections.push(renderDirectorBlock(directorState.notes))
    }

    // Faction standings (G33) — the party's reputation with each organization.
    const factionReps = await this.getFactionReputations()
    if (factionReps.length > 0) {
      const standings = factionReps
        .map((r) => `${r.factionName}: ${r.partyStanding >= 0 ? '+' : ''}${r.partyStanding}`)
        .join(', ')
      sections.push(`[FACTION STANDINGS] ${standings}`)
    }

    // DM rulings the table has established — surface them so the AI stays consistent
    // with prior calls (skip any the DM later overrode). Most recent first.
    const activeRulings = rulings.filter((r) => !r.overriddenByDM).slice(-8)
    if (activeRulings.length > 0) {
      const lines = activeRulings
        .reverse()
        .map((r) => `Q: ${r.question} A: ${r.ruling}${r.citation ? ` (${r.citation})` : ''}`)
      sections.push(`[DM RULINGS]\n${lines.join('\n')}\n[/DM RULINGS]`)
    }

    if (combatState?.inCombat) {
      const entries = combatState.entries
        .map(
          (e) =>
            `${e.name} (Init:${e.initiative}, HP:${e.hp.current}/${e.hp.max}${e.conditions.length ? `, ${e.conditions.join(', ')}` : ''})`
        )
        .join('; ')
      sections.push(`[COMBAT] Round ${combatState.round}, Turn: ${combatState.currentTurnEntity ?? 'N/A'}. ${entries}`)
    }

    // Recency-ranked (most recently seen first) so the capped lists keep the NPCs
    // the party most recently dealt with, not whatever happens to be first on disk.
    const npcsByRecency = [...npcs].sort((a, b) => recencyMs(b.lastSeen) - recencyMs(a.lastSeen))
    const relevantNPCs = currentScene
      ? npcsByRecency.filter((n) => n.location === currentScene || n.attitude !== 'unknown')
      : npcsByRecency.slice(0, 20)
    if (relevantNPCs.length > 0) {
      const npcList = relevantNPCs.map((n) => `${n.name} (${n.role}, ${n.attitude}, at ${n.location})`).join('; ')
      sections.push(`[NPCS] ${npcList}`)
    }

    // NPC personality details for richer roleplay
    if (npcPersonalities.length > 0) {
      const personalityList = npcPersonalities
        .slice(0, 15) // Cap to save context tokens
        .map((p) => {
          let entry = `${p.name}: ${p.personality}`
          if (p.faction) entry += ` {Faction: ${p.faction}}`
          if (p.location) entry += ` @${p.location}`
          if (p.voiceNotes) entry += ` (Voice: ${p.voiceNotes})`
          if (p.lastInteractionSummary) entry += ` [Last: ${p.lastInteractionSummary}]`
          // NOTE: secretMotivation is deliberately NOT exposed — it's DM-only.
          return entry
        })
        .join('; ')
      sections.push(`[NPC PERSONALITIES] ${personalityList}`)
    }

    // NPC relationship web
    const relationshipWeb = await this.getRelationshipWeb()
    if (relationshipWeb) {
      sections.push(relationshipWeb)
    }

    // Recent NPC conversation logs (for context-relevant NPCs)
    const npcsWithLogs = npcPersonalities.filter((p) => p.conversationLog?.length)
    if (npcsWithLogs.length > 0) {
      const logLines = npcsWithLogs
        .slice(0, 5) // Cap to save tokens
        .map((p) => {
          const lastFew = (p.conversationLog ?? []).slice(-3)
          return `${p.name}: ${lastFew.map((l) => l.summary).join('; ')}`
        })
        .join('\n')
      sections.push(`[NPC INTERACTION HISTORY]\n${logLines}\n[/NPC INTERACTION HISTORY]`)
    }

    // Discovered places, most recently visited first.
    const discoveredPlaces = places
      .filter((p) => p.discovered)
      .sort((a, b) => recencyMs(b.firstVisited) - recencyMs(a.firstVisited))
    if (discoveredPlaces.length > 0) {
      const placeList = discoveredPlaces.map((p) => `${p.name} (${p.type})`).join('; ')
      sections.push(`[PLACES] ${placeList}`)
    }

    if (campaignNotes) {
      // Trim to last 500 chars to save context
      const trimmed = campaignNotes.length > 500 ? `...${campaignNotes.slice(-500)}` : campaignNotes
      sections.push(`[CAMPAIGN NOTES] ${trimmed}`)
    }

    return sections.join('\n\n')
  }
}

// Factory cache — one manager per campaign
const managers = new Map<string, MemoryManager>()

export function getMemoryManager(campaignId: string): MemoryManager {
  let mgr = managers.get(campaignId)
  if (!mgr) {
    mgr = new MemoryManager(campaignId)
    managers.set(campaignId, mgr)
  }
  return mgr
}
