import * as fs from 'fs'
import * as path from 'path'
import { getLevelBudget } from '../../../shared/encounter-budgets'
import { logToFile } from '../../log'
import { getDataDir } from '../../paths'
import { searchCampaignDocs } from '../campaign-docs'
import type { FileReadRequest } from '../file-reader'
import { type LoreEntryLike, selectLore } from '../lore-injection'
import { getEntityStore } from '../memory/entity-store'
import { searchRules } from '../memory/hybrid-search'
import { getMemoryManager } from '../memory/memory-manager'
import type { SearchEngine } from '../memory/search-engine'
import { ENTITY_RECORDS_PROMPT } from '../prompt-sections/entity-records'
import { buildSafetyConstraintsSection, extractSafetyInput } from '../prompt-sections/safety-constraints'
import { WORLD_STATE_VERBS_PROMPT } from '../prompt-sections/world-state-verbs'
import { detectAndLoadSrdData } from '../srd-provider'
import type { ActiveCreatureInfo, ScoredChunk } from '../types'
import type { WebSearchRequest, WebSearchResult } from '../web-search'
import { getWorldStateStore } from '../world-state-store'
import { formatCampaignForContext, loadCampaignById } from './campaign-context'
import { formatCharacterAbbreviated, formatCharacterForContext, loadCharacterById } from './character-context'
import type { ContextTokenBreakdown } from './token-budget'
import { estimateTokens, getEffectiveBudgets, trimToTokenBudget } from './token-budget'

// Ensure imported types are used for type-safety
type _FileReadRequest = FileReadRequest
type _WebSearchRequest = WebSearchRequest
type _WebSearchResult = WebSearchResult

// Phase 19a/19b — SRD/monster JSON dir now comes from the shared resolver
// (was a bespoke NODE_ENV branch with a dev path that resolved incorrectly under
// electron-vite's `out/main` __dirname).

// Cache loaded monster data
let monsterDataCache: Map<string, Record<string, unknown>> | null = null

function loadMonsterData(): Map<string, Record<string, unknown>> {
  if (monsterDataCache) return monsterDataCache
  monsterDataCache = new Map()
  const dataDir = getDataDir()
  for (const file of ['dm/npcs/monsters.json', 'dm/npcs/creatures.json', 'dm/npcs/npcs.json']) {
    try {
      const filePath = path.join(dataDir, file)
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>[]
      for (const entry of data) {
        if (typeof entry.id === 'string') {
          monsterDataCache.set(entry.id, entry)
        }
      }
    } catch (err) {
      logToFile('ERROR', `[context-builder] Failed to load monster data (${file}): ${err}`)
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

      // Spellcasting — include the slot pool per level so the AI can ration the
      // creature's spells (and track usage via creature_expend_spell_slot).
      const spellcasting = statBlock.spellcasting as Record<string, unknown> | undefined
      if (spellcasting) {
        const slots = spellcasting.slots as Record<string, { slots?: number }> | undefined
        const slotStr = slots
          ? Object.entries(slots)
              .map(([lvl, v]) => `${lvl}:${v?.slots ?? '?'}`)
              .join(' ')
          : ''
        parts.push(`Spellcaster (DC ${spellcasting.saveDC || '?'}${slotStr ? `; slots ${slotStr}` : ''})`)
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

export function setSearchEngine(engine: SearchEngine | null): void {
  searchEngine = engine
}

export function getSearchEngine(): SearchEngine | null {
  return searchEngine
}

// PHASE-24: retrieval options provider, injected by ai-service to avoid a cycle
// (ai-service imports buildContext). Called per buildContext so it reflects live config.
export interface RetrievalOptsFull {
  embeddingsEnabled: boolean
  model: string
  baseUrl: string
  campaignDocsEnabled: boolean
}
let retrievalOptsProvider: (() => RetrievalOptsFull) | null = null
export function setRetrievalOptsProvider(fn: (() => RetrievalOptsFull) | null): void {
  retrievalOptsProvider = fn
}
function currentRetrievalOpts(): RetrievalOptsFull {
  return (
    retrievalOptsProvider?.() ?? {
      embeddingsEnabled: false,
      model: '',
      baseUrl: '',
      campaignDocsEnabled: false
    }
  )
}

/** Result of a context build — pure, no module-global side effects. (PHASE-07 07A) */
export interface BuiltContext {
  text: string
  breakdown: ContextTokenBreakdown
  /** Ids of rulebook chunks retrieved for this build (provenance; may be empty). */
  chunkIds: string[]
}

// Per-campaign breakdown recording. A LIVE chat build records here; throwaway PREVIEW builds
// (DMTabPanel token meter) record nothing, so a preview can no longer clobber a live stream's
// truncation state. (PHASE-07 07A / F4)
const lastTokenBreakdownByCampaign = new Map<string, ContextTokenBreakdown>()
let lastLiveBreakdown: ContextTokenBreakdown | null = null

/** Record the breakdown of a LIVE chat build (never previews). */
export function recordTokenBreakdown(campaignId: string | undefined, breakdown: ContextTokenBreakdown): void {
  lastLiveBreakdown = breakdown
  if (campaignId) lastTokenBreakdownByCampaign.set(campaignId, breakdown)
}

export function getLastTokenBreakdown(campaignId?: string): ContextTokenBreakdown | null {
  if (campaignId) return lastTokenBreakdownByCampaign.get(campaignId) ?? null
  return lastLiveBreakdown
}

export function clearTokenBreakdown(campaignId: string): void {
  lastTokenBreakdownByCampaign.delete(campaignId)
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
  actingCharacterId?: string,
  scanText?: string // PHASE-25 25E: text scanned for lore/entity keyword triggers
): Promise<BuiltContext> {
  const parts: string[] = []
  const chunkIds: string[] = []
  // PHASE-25 25E: keyword-trigger scan source (recent transcript + game state). Callers that
  // omit it (e.g. the token-budget preview) fall back to the query + game-state snapshot.
  const effectiveScanText = scanText ?? `${query}\n${gameState ?? ''}`
  // Entity-store config drives lore mode (step 4) + the entity block (step 7); read once
  // (module-cached, F8) so the per-turn hot path never hits disk twice.
  const entityCfg = campaignId ? await getEntityStore(campaignId).getConfig() : null
  // PHASE-01 01D — prefix-cache ordering contract. Ollama reuses prefill (its KV
  // cache) only for a byte-identical prompt prefix and invalidates at the first
  // differing byte, so sections are emitted static-first / volatile-last to
  // maximize the stable prefix across consecutive turns:
  //   campaign (semi-static) → character/party/encounter (semi-static) →
  //   rulebook chunks (query-volatile) → SRD + available monsters (query-volatile) →
  //   active creatures → memory → game-state snapshot (changes every message — LAST).
  // Each section computes where it always has (side-effects, breakdown updates
  // unchanged); only the final emission order moves, via these buckets.
  const sSafety: string[] = [] // PHASE-32 32B — hard safety block, emitted FIRST, never trimmed
  const sCampaign: string[] = []
  const sCharacter: string[] = []
  const sRulebook: string[] = []
  const sSrd: string[] = []
  const sCreatures: string[] = []
  const sMemory: string[] = []
  const sGameState: string[] = []
  const breakdown: ContextTokenBreakdown = {
    safety: 0,
    rulebookChunks: 0,
    srdData: 0,
    characterData: 0,
    campaignData: 0,
    campaignDocs: 0, // PHASE-24 24D
    creatures: 0,
    gameState: 0,
    memory: 0,
    total: 0
  }

  // Trim to a budget AND record whether anything was actually cut, so the
  // breakdown's `truncated` flag reflects real context compression (not just the
  // conversation-history budget).
  const trimTracked = (text: string, budget: number): string => {
    const out = trimToTokenBudget(text, budget)
    if (estimateTokens(text) > estimateTokens(out)) breakdown.truncated = true
    return out
  }

  // Section budgets scaled to the active context window (PHASE-01 01C) so trims
  // happen visibly here instead of silently in Ollama's runner.
  const budgets = getEffectiveBudgets()

  // PHASE-32 32B — load the campaign ONCE here and reuse for both the safety block and the
  // campaign-data part (steps 1b + 4), avoiding a duplicate disk read. A saved lines/veils/ban-list
  // edit is therefore picked up on the very next request with no main-process cache to invalidate.
  let campaignRecord: Record<string, unknown> | null = null
  if (campaignId) {
    try {
      campaignRecord = await loadCampaignById(campaignId)
    } catch (err) {
      logToFile('WARN', `[context-builder] Failed to load campaign: ${err}`)
    }
  }
  // Hard safety constraints — the FIRST context part (adjacent to the static system prompt, so it is
  // prefix-cache friendly per PHASE-01) and NEVER trimmed (bounded in practice: dozens of short topics).
  if (campaignRecord) {
    const safetySection = buildSafetyConstraintsSection(extractSafetyInput(campaignRecord))
    if (safetySection) {
      sSafety.push(safetySection)
      breakdown.safety = estimateTokens(safetySection)
    }
  }

  // 1. Search rulebook chunks (PHASE-24: BM25, fused with vectors via RRF when enabled)
  const retrievalOpts = currentRetrievalOpts()
  if (searchEngine) {
    const results = await searchRules(query, searchEngine, retrievalOpts)

    if (results.length > 0) {
      for (const c of results) chunkIds.push(c.id) // retrieval provenance (07C wires onto the reply)
      const chunkText = formatChunks(results)
      const trimmed = trimTracked(`[CONTEXT: Rulebook Excerpts]\n${chunkText}`, budgets.retrievedChunks)
      breakdown.rulebookChunks = estimateTokens(trimmed)
      sRulebook.push(trimmed)
    }
  }

  // 1b. PHASE-24 24D: campaign-document retrieval (volatile group, adjacent to the
  // rulebook chunks). Opt-in; BM25-only; pushes its own budgeted block + provenance.
  if (campaignId && retrievalOpts.campaignDocsEnabled) {
    try {
      const campaign = campaignRecord // PHASE-32 32B — reuse the single hoisted load
      const docResults = campaign ? searchCampaignDocs(campaignId, campaign, query, 3) : []
      if (docResults.length > 0) {
        const trimmed = trimTracked(`[CONTEXT: Campaign Documents]\n${formatChunks(docResults)}`, budgets.campaignDocs)
        breakdown.campaignDocs = estimateTokens(trimmed)
        sRulebook.push(trimmed)
        for (const c of docResults) chunkIds.push(c.id)
      }
    } catch (err) {
      logToFile('WARN', `[context-builder] campaign-docs retrieval failed: ${err}`)
    }
  }

  // 2. SRD JSON lookups
  try {
    const srdData = detectAndLoadSrdData(query)
    if (srdData) {
      const trimmed = trimTracked(`[CONTEXT: SRD Data]\n${srdData}`, budgets.srdData)
      breakdown.srdData = estimateTokens(trimmed)
      sSrd.push(trimmed)
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
      sCharacter.push(charBlock)
      // (Character + combat rules are NOT re-added here — the modular system prompt
      // assembler already includes them per game mode; duplicating them in the
      // context just burned tokens and showed the AI the same rules twice.)

      // Party composition analysis for AI tactical decisions
      const partyComp = analyzePartyComposition(charParts)
      if (partyComp) sCharacter.push(partyComp)

      // Encounter budget for dynamic encounter generation
      const encounterBudget = calculateEncounterBudget(charParts)
      if (encounterBudget) sCharacter.push(encounterBudget)

      const availableMonsters = formatAvailableMonstersContext(query)
      if (availableMonsters) {
        const trimmed = trimTracked(availableMonsters, Math.floor(budgets.srdData * 0.4))
        breakdown.srdData += estimateTokens(trimmed)
        sSrd.push(trimmed)
      }

      // Cache character context for persistence (fire-and-forget; non-critical)
      if (campaignId) {
        const memMgr = getMemoryManager(campaignId)
        memMgr.saveCharacterContext(cacheEntries).catch((err) => {
          logToFile('WARN', '[context-builder] saveCharacterContext failed:', String(err))
        })
      }
    }
  }

  // 4. Campaign data
  if (campaignId) {
    try {
      const campaign = campaignRecord // PHASE-32 32B — reuse the single hoisted load
      if (campaign) {
        // PHASE-25 25E: select lore per loreMode (default 'all' = today's full dump).
        const selectedLore = selectLore(
          (campaign.lore as LoreEntryLike[] | undefined) ?? [],
          entityCfg?.loreMode ?? 'all',
          effectiveScanText
        )
        const campaignText = formatCampaignForContext(campaign, { lore: selectedLore })
        const trimmed = trimTracked(campaignText, budgets.campaignData)
        breakdown.campaignData = estimateTokens(trimmed)
        sCampaign.push(trimmed)
      }
    } catch (err) {
      logToFile('WARN', `[context-builder] Failed to load campaign data: ${err}`)
    }
  }

  // 5. Active map creatures (enriched with stat block data)
  if (activeCreatures?.length) {
    const creatureBlock = `[ACTIVE CREATURES ON MAP]\n${activeCreatures.map((c) => formatCreatureContext(c)).join('\n')}`
    const trimmed = trimTracked(creatureBlock, budgets.creatures)
    breakdown.creatures = estimateTokens(trimmed)
    sCreatures.push(trimmed)
  }

  // 6. Game state snapshot (pre-formatted by renderer). The [PARTY ROSTER] block is
  //    NEVER trimmed — dropping who's in the party (and their charIds) silently breaks
  //    targeting and multiplayer narration. Extract it, trim the rest, re-append it.
  if (gameState) {
    const rosterRe = /\[PARTY ROSTER\][\s\S]*?\[\/PARTY ROSTER\]/g
    const roster = gameState.match(rosterRe)?.[0]
    const rest = roster ? gameState.replace(rosterRe, '').trim() : gameState
    const trimmedRest = trimTracked(rest, budgets.gameState)
    const finalGameState = roster ? `${trimmedRest}\n\n${roster}`.trim() : trimmedRest
    breakdown.gameState = estimateTokens(finalGameState)
    sGameState.push(finalGameState)
  }

  // 7. Memory manager context (world state, combat, NPCs, places, notes)
  if (campaignId) {
    try {
      const memoryManager = getMemoryManager(campaignId)
      let memoryContext = await memoryManager.assembleContext()
      // PHASE-25 25E: when entity memory is enabled, prepend the verb docs + the bounded
      // [ENTITY RECORDS] block (slice-first so it survives the memory-budget trim). Disabled
      // ⇒ this branch is skipped and step 7 is byte-identical to pre-phase.
      if (entityCfg?.enabled) {
        const entityBlock = await getEntityStore(campaignId).buildEntityContextBlock(effectiveScanText)
        const entitySection = entityBlock ? `${ENTITY_RECORDS_PROMPT}\n\n${entityBlock}` : ENTITY_RECORDS_PROMPT
        memoryContext = memoryContext ? `${entitySection}\n\n${memoryContext}` : entitySection
      }
      // PHASE-27 27F: when the world store is enabled, prepend the verb docs + the bounded
      // [WORLD STATE] slice (slice-first so it survives the memory-budget trim). Disabled
      // (default) ⇒ skipped, leaving step 7 byte-identical to pre-phase.
      const worldStore = getWorldStateStore(campaignId)
      if (await worldStore.isEnabled()) {
        const worldBlock = await worldStore.buildContextBlock()
        const worldSection = worldBlock ? `${WORLD_STATE_VERBS_PROMPT}\n\n${worldBlock}` : WORLD_STATE_VERBS_PROMPT
        memoryContext = memoryContext ? `${worldSection}\n\n${memoryContext}` : worldSection
      }
      if (memoryContext) {
        const trimmed = trimTracked(memoryContext, budgets.memory)
        breakdown.memory = estimateTokens(trimmed)
        sMemory.push(trimmed)
      }
    } catch (err) {
      logToFile('WARN', `[context-builder] Failed to load memory data: ${err}`)
    }
  }

  // Emit static-first → volatile-last (see the ordering contract above). The safety block is FIRST:
  // hard constraints lead, and it is static between settings edits / X-card events (prefix-cache safe).
  parts.push(...sSafety, ...sCampaign, ...sCharacter, ...sRulebook, ...sSrd, ...sCreatures, ...sMemory, ...sGameState)

  const result = parts.join('\n\n')
  breakdown.total = estimateTokens(result)

  // Pure: callers record the breakdown explicitly (live builds only) via recordTokenBreakdown.
  return { text: result, breakdown, chunkIds }
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
  // XP thresholds per character level — shared single source of truth (2024 DMG),
  // identical to the values the encounter-builder UI uses, so the AI balances
  // against the same numbers the engine will report at game time.
  const t = getLevelBudget(avgLevel)
  const partySize = levels.length
  return `[ENCOUNTER BUDGET]\nParty: ${partySize} characters, avg level ${avgLevel}\nLow: ${t.low * partySize} XP | Moderate: ${t.moderate * partySize} XP | High: ${t.high * partySize} XP\n[/ENCOUNTER BUDGET]`
}

function formatChunks(chunks: ScoredChunk[]): string {
  return chunks
    .map((chunk) => {
      const breadcrumb = chunk.headingPath.join(' > ')
      return `--- ${chunk.source}: ${breadcrumb} ---\n${chunk.content}`
    })
    .join('\n\n')
}
