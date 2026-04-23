import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { logToFile } from '../log'
import { formatCampaignForContext, loadCampaignById } from './campaign-context'
import { formatCharacterAbbreviated, formatCharacterForContext, loadCharacterById } from './character-context'
import type { FileReadRequest } from './file-reader'
import { getMemoryManager } from './memory-manager'
import { CHARACTER_RULES_PROMPT } from './prompt-sections/character-rules'
import { COMBAT_RULES_PROMPT } from './prompt-sections/combat-rules'
import type { SearchEngine } from './search-engine'
import { detectAndLoadSrdData } from './srd-provider'
import type { ContextTokenBreakdown } from './token-budget'
import { estimateTokens, TOKEN_BUDGETS, trimToTokenBudget } from './token-budget'
import type { ActiveCreatureInfo, ScoredChunk } from './types'
import type { WebSearchRequest, WebSearchResult } from './web-search'

// Ensure imported types are used for type-safety
type _FileReadRequest = FileReadRequest
type _WebSearchRequest = WebSearchRequest
type _WebSearchResult = WebSearchResult

// Electron-safe data directory for SRD/monster JSON files
function getDataDir(): string {
  if (process.env.NODE_ENV !== 'production') {
    return path.join(__dirname, '..', '..', 'renderer', 'public', 'data', '5e')
  }
  // In packaged builds, public assets are copied to out/renderer/
  return path.join(app.getAppPath(), 'out', 'renderer', 'data', '5e')
}

// Cache loaded monster data
let monsterDataCache: Map<string, Record<string, unknown>> | null = null

function loadMonsterData(): Map<string, Record<string, unknown>> {
  if (monsterDataCache) return monsterDataCache
  monsterDataCache = new Map()
  const dataDir = getDataDir()
  for (const file of ['creatures/monsters.json', 'creatures/creatures.json', 'creatures/npcs.json']) {
    try {
      const filePath = path.join(dataDir, file)
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>[]
      for (const entry of data) {
        if (typeof entry.id === 'string') {
          monsterDataCache.set(entry.id, entry)
        }
      }
    } catch (err) {
      logToFile('WARN', `[context-builder] Failed to load monster data (${file}): ${err}`)
    }
  }
  return monsterDataCache
}

function formatCreatureContext(creature: ActiveCreatureInfo): string {
  let line = `- ${creature.label}: HP ${creature.currentHP}/${creature.maxHP}, AC ${creature.ac}`
  if (creature.conditions.length) {
    line += `, Conditions: ${creature.conditions.join(', ')}`
  }

  // Enrich with stat block data if available
  if (creature.monsterStatBlockId) {
    const monsters = loadMonsterData()
    const statBlock = monsters.get(creature.monsterStatBlockId)
    if (statBlock) {
      const parts: string[] = []

      // CR
      if (statBlock.cr) parts.push(`CR ${statBlock.cr}`)

      // Key resistances/immunities
      const res = statBlock.resistances as string[] | undefined
      const imm = statBlock.damageImmunities as string[] | undefined
      const vuln = statBlock.vulnerabilities as string[] | undefined
      if (res?.length) parts.push(`Resist: ${res.join(', ')}`)
      if (imm?.length) parts.push(`Immune: ${imm.join(', ')}`)
      if (vuln?.length) parts.push(`Vulnerable: ${vuln.join(', ')}`)

      // Key actions (name, to-hit or DC, damage)
      const actions = statBlock.actions as Array<Record<string, unknown>> | undefined
      if (actions?.length) {
        const actionSummaries = actions.slice(0, 4).map((a) => {
          let s = a.name as string
          if (a.toHit !== undefined) s += ` (+${a.toHit})`
          else if (a.saveDC) s += ` (DC ${a.saveDC})`
          if (a.damageDice) s += ` ${a.damageDice} ${a.damageType || ''}`
          return s.trim()
        })
        parts.push(`Actions: ${actionSummaries.join('; ')}`)
      }

      // Legendary actions
      const legendary = statBlock.legendaryActions as Record<string, unknown> | undefined
      if (legendary?.uses) {
        parts.push(`${legendary.uses} legendary actions/turn`)
      }

      // Spellcasting
      const spellcasting = statBlock.spellcasting as Record<string, unknown> | undefined
      if (spellcasting) {
        parts.push(`Spellcaster (DC ${spellcasting.saveDC || '?'})`)
      }

      if (parts.length) {
        line += `\n    ${parts.join(' | ')}`
      }
    }
  }

  return line
}

function formatAvailableMonstersContext(query: string, limit = 24): string | null {
  const monsters = Array.from(loadMonsterData().values())
    .filter((entry) => typeof entry.name === 'string' && typeof entry.id === 'string')
    .map((entry) => ({
      id: entry.id as string,
      name: entry.name as string,
      cr: entry.cr
    }))

  if (monsters.length === 0) return null

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 3)
  const scored = monsters.map((monster) => {
    const hay = `${monster.name} ${monster.id}`.toLowerCase()
    const score = terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0)
    return { ...monster, score }
  })
  const sorted = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.name.localeCompare(b.name)
  })
  const selected = sorted.slice(0, limit)

  const lines = selected.map((m) => `- ${m.name} (id: ${m.id}${m.cr !== undefined ? `, CR ${String(m.cr)}` : ''})`)
  return `[AVAILABLE MONSTERS]\n${lines.join('\n')}\n[/AVAILABLE MONSTERS]`
}

let searchEngine: SearchEngine | null = null
let lastTokenBreakdown: ContextTokenBreakdown | null = null

export function setSearchEngine(engine: SearchEngine | null): void {
  searchEngine = engine
}

export function getSearchEngine(): SearchEngine | null {
  return searchEngine
}

export function getLastTokenBreakdown(): ContextTokenBreakdown | null {
  return lastTokenBreakdown
}

/**
 * Build the full context block for an API call.
 * actingCharacterId: the character performing the current action (gets full sheet).
 * Other characters in activeCharacterIds get abbreviated sheets.
 */
export async function buildContext(
  query: string,
  activeCharacterIds: string[],
  campaignId?: string,
  activeCreatures?: ActiveCreatureInfo[],
  gameState?: string,
  actingCharacterId?: string
): Promise<string> {
  const parts: string[] = []
  const breakdown: ContextTokenBreakdown = {
    rulebookChunks: 0,
    srdData: 0,
    characterData: 0,
    campaignData: 0,
    creatures: 0,
    gameState: 0,
    memory: 0,
    total: 0
  }

  // 1. Search rulebook chunks
  if (searchEngine) {
    const results = searchEngine.search(query, 5)

    if (results.length > 0) {
      const chunkText = formatChunks(results)
      const trimmed = trimToTokenBudget(`[CONTEXT: Rulebook Excerpts]\n${chunkText}`, TOKEN_BUDGETS.retrievedChunks)
      breakdown.rulebookChunks = estimateTokens(trimmed)
      parts.push(trimmed)
    }
  }

  // 2. SRD JSON lookups
  try {
    const srdData = detectAndLoadSrdData(query)
    if (srdData) {
      const trimmed = trimToTokenBudget(`[CONTEXT: SRD Data]\n${srdData}`, TOKEN_BUDGETS.srdData)
      breakdown.srdData = estimateTokens(trimmed)
      parts.push(trimmed)
    }
  } catch (err) {
    logToFile('WARN', `[context-builder] Failed to load SRD data: ${err}`)
  }

  // 3. Character data — full sheet for acting character, abbreviated for others
  if (activeCharacterIds.length > 0) {
    const charParts: string[] = []
    const cacheEntries: Array<{ id: string; formatted: string }> = []
    for (const id of activeCharacterIds) {
      const char = await loadCharacterById(id)
      if (char) {
        let formatted: string
        if (actingCharacterId && id === actingCharacterId) {
          formatted = formatCharacterForContext(char)
        } else if (actingCharacterId) {
          formatted = formatCharacterAbbreviated(char)
        } else {
          // No acting character specified — send full sheets for all
          formatted = formatCharacterForContext(char)
        }
        charParts.push(formatted)
        cacheEntries.push({ id, formatted })
      }
    }
    if (charParts.length > 0) {
      const charBlock = `[CHARACTER DATA]\n${charParts.join('\n\n')}`
      breakdown.characterData = estimateTokens(charBlock)
      parts.push(charBlock)

      // Include character rules prompt alongside character data for enforcement
      parts.push(`[CHARACTER RULES]\n${CHARACTER_RULES_PROMPT.trim()}`)
      parts.push(`[COMBAT RULES]\n${COMBAT_RULES_PROMPT.trim()}`)

      // Party composition analysis for AI tactical decisions
      const partyComp = analyzePartyComposition(charParts)
      if (partyComp) parts.push(partyComp)

      // Encounter budget for dynamic encounter generation
      const encounterBudget = calculateEncounterBudget(charParts)
      if (encounterBudget) parts.push(encounterBudget)

      const availableMonsters = formatAvailableMonstersContext(query)
      if (availableMonsters) {
        const trimmed = trimToTokenBudget(availableMonsters, Math.floor(TOKEN_BUDGETS.srdData * 0.4))
        breakdown.srdData += estimateTokens(trimmed)
        parts.push(trimmed)
      }

      // Cache character context for persistence
      if (campaignId) {
        const memMgr = getMemoryManager(campaignId)
        memMgr.saveCharacterContext(cacheEntries).catch(() => {})
      }
    }
  }

  // 4. Campaign data
  if (campaignId) {
    try {
      const campaign = await loadCampaignById(campaignId)
      if (campaign) {
        const campaignText = formatCampaignForContext(campaign)
        const trimmed = trimToTokenBudget(campaignText, TOKEN_BUDGETS.campaignData)
        breakdown.campaignData = estimateTokens(trimmed)
        parts.push(trimmed)
      }
    } catch (err) {
      logToFile('WARN', `[context-builder] Failed to load campaign data: ${err}`)
    }
  }

  // 5. Active map creatures (enriched with stat block data)
  if (activeCreatures?.length) {
    const creatureBlock = `[ACTIVE CREATURES ON MAP]\n${activeCreatures.map((c) => formatCreatureContext(c)).join('\n')}`
    const trimmed = trimToTokenBudget(creatureBlock, TOKEN_BUDGETS.creatures)
    breakdown.creatures = estimateTokens(trimmed)
    parts.push(trimmed)
  }

  // 6. Game state snapshot (pre-formatted by renderer)
  if (gameState) {
    const trimmed = trimToTokenBudget(gameState, TOKEN_BUDGETS.gameState)
    breakdown.gameState = estimateTokens(trimmed)
    parts.push(trimmed)
  }

  // 7. Memory manager context (world state, combat, NPCs, places, notes)
  if (campaignId) {
    try {
      const memoryManager = getMemoryManager(campaignId)
      const memoryContext = await memoryManager.assembleContext()
      if (memoryContext) {
        const trimmed = trimToTokenBudget(memoryContext, TOKEN_BUDGETS.memory)
        breakdown.memory = estimateTokens(trimmed)
        parts.push(trimmed)
      }
    } catch (err) {
      logToFile('WARN', `[context-builder] Failed to load memory data: ${err}`)
    }
  }

  const result = parts.join('\n\n')
  breakdown.total = estimateTokens(result)
  lastTokenBreakdown = breakdown

  return result
}

function analyzePartyComposition(characterParts: string[]): string | null {
  const roles: string[] = []
  for (const part of characterParts) {
    const classMatch = part.match(/Class:\s*(.+)/i)
    const nameMatch = part.match(/Name:\s*(.+)/i)
    if (!classMatch || !nameMatch) continue
    const cls = classMatch[1].toLowerCase()
    const name = nameMatch[1].trim()
    if (/cleric|druid|paladin/.test(cls)) roles.push(`${name}: healer/support`)
    else if (/wizard|sorcerer|warlock|bard/.test(cls)) roles.push(`${name}: caster`)
    else if (/fighter|barbarian/.test(cls)) roles.push(`${name}: front-line tank`)
    else if (/rogue|ranger|monk/.test(cls)) roles.push(`${name}: mobile striker`)
    else roles.push(`${name}: ${cls}`)
  }
  if (roles.length === 0) return null
  return `[PARTY COMPOSITION]\n${roles.join('\n')}\nParty size: ${roles.length}\n[/PARTY COMPOSITION]`
}

function calculateEncounterBudget(characterParts: string[]): string | null {
  const levels: number[] = []
  for (const part of characterParts) {
    const levelMatch = part.match(/Level:\s*(\d+)/i)
    if (levelMatch) levels.push(parseInt(levelMatch[1], 10))
  }
  if (levels.length === 0) return null
  const avgLevel = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length)
  // XP thresholds per character level (2024 DMG): [low, moderate, high]
  const xpTable: Record<number, [number, number, number]> = {
    1: [50, 75, 100],
    2: [100, 150, 200],
    3: [150, 225, 400],
    4: [250, 375, 500],
    5: [500, 750, 1100],
    6: [600, 900, 1400],
    7: [750, 1100, 1700],
    8: [1000, 1400, 2100],
    9: [1300, 1800, 2400],
    10: [1600, 2100, 2800],
    11: [1900, 2400, 3600],
    12: [2200, 2800, 4500],
    13: [2600, 3400, 5100],
    14: [2900, 3800, 5700],
    15: [3300, 4300, 6400],
    16: [3800, 4800, 7200],
    17: [4500, 5700, 8800],
    18: [5000, 6300, 9500],
    19: [5500, 6800, 10900],
    20: [6800, 8500, 13500]
  }
  const thresholds = xpTable[Math.min(avgLevel, 20)] ?? xpTable[1]!
  const partySize = levels.length
  return `[ENCOUNTER BUDGET]\nParty: ${partySize} characters, avg level ${avgLevel}\nLow: ${thresholds[0] * partySize} XP | Moderate: ${thresholds[1] * partySize} XP | High: ${thresholds[2] * partySize} XP\n[/ENCOUNTER BUDGET]`
}

function formatChunks(chunks: ScoredChunk[]): string {
  return chunks
    .map((chunk) => {
      const breadcrumb = chunk.headingPath.join(' > ')
      return `--- ${chunk.source}: ${breadcrumb} ---\n${chunk.content}`
    })
    .join('\n\n')
}
