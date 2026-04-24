import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { NPCPersonality, WorldStateSummary } from './types'

// Per-campaign memory files stored in userData/campaigns/{campaignId}/ai-context/

interface WorldState {
  currentMapId: string | null
  currentMapName: string | null
  timeOfDay: string
  weather: string
  currentScene: string
  activeTokenPositions: Array<{ name: string; gridX: number; gridY: number }>
  updatedAt: string
}

interface CombatState {
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

interface NPCMemory {
  id: string
  name: string
  role: string
  attitude: 'friendly' | 'neutral' | 'hostile' | 'unknown'
  location: string
  notes: string
  firstEncountered: string
  lastSeen: string
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
    await fs.writeFile(path.join(this.basePath, filename), JSON.stringify(data, null, 2), 'utf-8')
  }

  // --- World State ---
  async getWorldState(): Promise<WorldState | null> {
    return this.readJson<WorldState>('world-state.json')
  }

  async updateWorldState(updates: Partial<WorldState>): Promise<void> {
    const current = (await this.getWorldState()) ?? {
      currentMapId: null,
      currentMapName: null,
      timeOfDay: 'morning',
      weather: 'clear',
      currentScene: '',
      activeTokenPositions: [],
      updatedAt: new Date().toISOString()
    }
    await this.writeJson('world-state.json', { ...current, ...updates, updatedAt: new Date().toISOString() })
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
    const npcs = await this.getNPCs()
    const idx = npcs.findIndex((n) => n.id === npc.id)
    if (idx >= 0) {
      npcs[idx] = { ...npcs[idx], ...npc, lastSeen: new Date().toISOString() }
    } else {
      npcs.push({ ...npc, firstEncountered: new Date().toISOString(), lastSeen: new Date().toISOString() })
    }
    await this.writeJson('npcs.json', npcs)
  }

  // --- Places ---
  async getPlaces(): Promise<PlaceMemory[]> {
    return (await this.readJson<PlaceMemory[]>('places.json')) ?? []
  }

  async upsertPlace(place: PlaceMemory): Promise<void> {
    const places = await this.getPlaces()
    const idx = places.findIndex((p) => p.id === place.id)
    if (idx >= 0) {
      places[idx] = { ...places[idx], ...place }
    } else {
      places.push({ ...place, firstVisited: new Date().toISOString() })
    }
    await this.writeJson('places.json', places)
  }

  // --- Session History ---
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
    const rulings = await this.getRulings()
    rulings.push({
      ...ruling,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    })
    await this.writeJson('rulings-log.json', rulings)
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
    const personalities = await this.getNpcPersonalities()
    const idx = personalities.findIndex((p) => p.npcId === npc.npcId)
    if (idx >= 0) {
      personalities[idx] = { ...personalities[idx], ...npc }
    } else {
      personalities.push(npc)
    }
    await this.writeJson('npc-personalities.json', personalities)
  }

  async getNpcPersonality(npcId: string): Promise<NPCPersonality | undefined> {
    const personalities = await this.getNpcPersonalities()
    return personalities.find((p) => p.npcId === npcId)
  }

  /** Find NPC by name (case-insensitive), creating a stub if not found */
  async getNpcByName(name: string): Promise<NPCPersonality | undefined> {
    const personalities = await this.getNpcPersonalities()
    return personalities.find((p) => p.name.toLowerCase() === name.toLowerCase())
  }

  /** Log a conversation interaction with an NPC */
  async logNpcInteraction(
    npcName: string,
    summary: string,
    attitudeAfter: 'friendly' | 'neutral' | 'hostile'
  ): Promise<void> {
    let personality = await this.getNpcByName(npcName)
    if (!personality) {
      // Create stub personality for new NPCs
      personality = { npcId: crypto.randomUUID(), name: npcName, personality: '' }
      await this.setNpcPersonality(personality)
    }
    const log = personality.conversationLog ?? []
    log.push({
      timestamp: new Date().toISOString(),
      summary,
      attitudeAfter
    })
    // Keep last 10 interactions per NPC
    if (log.length > 10) log.splice(0, log.length - 10)
    await this.setNpcPersonality({
      ...personality,
      conversationLog: log,
      lastInteractionSummary: summary
    })
  }

  /** Add a relationship between two NPCs */
  async addNpcRelationship(
    npcName: string,
    targetNpcName: string,
    relationship: string,
    disposition: 'friendly' | 'neutral' | 'hostile'
  ): Promise<void> {
    let personality = await this.getNpcByName(npcName)
    if (!personality) {
      personality = { npcId: crypto.randomUUID(), name: npcName, personality: '' }
      await this.setNpcPersonality(personality)
    }
    // Ensure target NPC also exists
    let targetPersonality = await this.getNpcByName(targetNpcName)
    if (!targetPersonality) {
      targetPersonality = { npcId: crypto.randomUUID(), name: targetNpcName, personality: '' }
      await this.setNpcPersonality(targetPersonality)
    }
    const rels = personality.relationships ?? []
    const existing = rels.findIndex((r) => r.targetNpcId === targetPersonality!.npcId)
    if (existing >= 0) {
      rels[existing] = { targetNpcId: targetPersonality.npcId, targetName: targetNpcName, relationship, disposition }
    } else {
      rels.push({ targetNpcId: targetPersonality.npcId, targetName: targetNpcName, relationship, disposition })
    }
    await this.setNpcPersonality({ ...personality, relationships: rels })
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
    await this.writeJson('world-state-summary.json', {
      ...summary,
      lastUpdated: new Date().toISOString()
    })
  }

  // --- Context Assembly for AI ---
  async assembleContext(currentScene?: string): Promise<string> {
    const [worldState, combatState, npcs, places, campaignNotes, npcPersonalities, worldStateSummary] =
      await Promise.all([
        this.getWorldState(),
        this.getCombatState(),
        this.getNPCs(),
        this.getPlaces(),
        this.getCampaignNotes(),
        this.getNpcPersonalities(),
        this.getWorldStateSummary()
      ])

    const sections: string[] = []

    if (worldState) {
      sections.push(
        `[WORLD STATE] Map: ${worldState.currentMapName ?? 'Unknown'}, Time: ${worldState.timeOfDay}, Weather: ${worldState.weather}, Scene: ${worldState.currentScene}`
      )
    }

    // World state summary (high-level quests, events, location context)
    if (worldStateSummary) {
      const wsParts = [`Location: ${worldStateSummary.currentLocation}`, `Time: ${worldStateSummary.timeOfDay}`]
      if (worldStateSummary.weather) wsParts.push(`Weather: ${worldStateSummary.weather}`)
      if (worldStateSummary.activeQuests.length > 0) {
        wsParts.push(`Active Quests: ${worldStateSummary.activeQuests.join('; ')}`)
      }
      if (worldStateSummary.recentEvents.length > 0) {
        wsParts.push(`Recent Events: ${worldStateSummary.recentEvents.join('; ')}`)
      }
      sections.push(`[WORLD SUMMARY] ${wsParts.join('. ')}`)
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

    // Filter NPCs to current scene if provided
    const relevantNPCs = currentScene
      ? npcs.filter((n) => n.location === currentScene || n.attitude !== 'unknown')
      : npcs.slice(0, 20)
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
          if (p.voiceNotes) entry += ` (Voice: ${p.voiceNotes})`
          if (p.lastInteractionSummary) entry += ` [Last: ${p.lastInteractionSummary}]`
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

    // Filter places to discovered only
    const discoveredPlaces = places.filter((p) => p.discovered)
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
