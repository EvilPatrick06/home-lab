import { trigger3dDice } from '../../components/game/dice3d'
import type { DiceResultPayload } from '../../network'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import { is5eCharacter } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import type { MapToken } from '../../types/map'
import { parseFormula as parseFormulaSvc, rollMultiple, rollSingle as rollSingleSvc } from '../dice/dice-service'
import type { CommandContext } from './types'

// ─── Dice helpers (delegate to dice-service) ──────────────────

export function parseDiceFormula(formula: string): { count: number; sides: number; modifier: number } | null {
  return parseFormulaSvc(formula)
}

export function rollDice(count: number, sides: number): number[] {
  return rollMultiple(count, sides)
}

/** Roll dice from a parsed formula object, returns rolls array and total */
export function rollDiceFormula(formula: { count: number; sides: number; modifier: number }): {
  rolls: number[]
  total: number
} {
  const rolls = rollMultiple(formula.count, formula.sides)
  const total = rolls.reduce((sum, r) => sum + r, 0) + formula.modifier
  return { rolls, total }
}

export function rollSingle(sides: number): number {
  return rollSingleSvc(sides)
}

/**
 * Roll a d20 and return both the roll value and a formatted crit/fumble tag.
 * Returns `{ roll, tag }` where tag is ' **Natural 20!**', ' *Natural 1!*', or ''.
 */
export function rollD20WithTag(): { roll: number; tag: string } {
  const roll = rollSingleSvc(20)
  const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
  return { roll, tag }
}

/** Track the last roll result for /reroll */
let _lastRoll: { formula: string; rolls: number[]; total: number; rollerName: string } | null = null

export function getLastRoll() {
  return _lastRoll
}
export function setLastRoll(roll: typeof _lastRoll) {
  _lastRoll = roll
}

export function broadcastDiceResult(formula: string, rolls: number[], total: number, rollerName: string): void {
  const { sendMessage } = useNetworkStore.getState()
  const { addChatMessage } = useLobbyStore.getState()
  const localPeerId = useNetworkStore.getState().localPeerId

  _lastRoll = { formula, rolls, total, rollerName }

  addChatMessage({
    id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: localPeerId || 'local',
    senderName: rollerName,
    content: `rolled ${formula}`,
    timestamp: Date.now(),
    isSystem: false,
    isDiceRoll: true,
    diceResult: { formula, rolls, total }
  })

  const resultPayload: DiceResultPayload = {
    formula,
    rolls,
    total,
    isCritical: false,
    isFumble: false,
    rollerName
  }
  sendMessage('game:dice-result', resultPayload)

  // Trigger 3D dice animation
  trigger3dDice({ formula, rolls, total, rollerName })
}

// ─── Character helpers ────────────────────────────────────────

export function saveAndBroadcastCharacter(updated: Character5e): void {
  useCharacterStore.getState().saveCharacter(updated)
  const activeMapId = useGameStore.getState().activeMapId
  const maps = useGameStore.getState().maps
  const activeMap = maps.find((m) => m.id === activeMapId)
  if (activeMap) {
    const token = activeMap.tokens.find((t) => t.entityId === updated.id)
    if (token) {
      useGameStore.getState().updateToken(activeMap.id, token.id, {
        currentHP: updated.hitPoints.current
      })
    }
  }
  const { role, sendMessage } = useNetworkStore.getState()
  if (role !== 'host') {
    sendMessage('dm:character-update', {
      characterId: updated.id,
      characterData: updated,
      targetPeerId: 'host'
    })
  }
}

export function getLatestCharacter(id: string): Character5e | undefined {
  const char = useCharacterStore.getState().characters.find((c) => c.id === id)
  return char && is5eCharacter(char) ? (char as Character5e) : undefined
}

/**
 * Guard that requires an active character loaded in context.
 * Returns the latest Character5e if available, or null after emitting an error response.
 * Usage: `const char = requireCharacter(ctx); if (!char) return { type: 'error', content: '' }`
 * but since this emits via return value, use the two-value form:
 *   `const char = requireLatestCharacter(ctx); if (!char) return`
 *
 * Returns the character or null. The caller is responsible for returning the error object.
 */
export function requireLatestCharacter(ctx: CommandContext): Character5e | null {
  if (!ctx.character) return null
  const char = getLatestCharacter(ctx.character.id)
  return char ?? null
}

export function findTokenByName(targetName: string) {
  const { maps, activeMapId } = useGameStore.getState()
  const activeMap = maps.find((m) => m.id === activeMapId)
  return activeMap?.tokens.find((t) => t.label.toLowerCase().startsWith(targetName.toLowerCase()))
}

export function generateMessageId(): string {
  return `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

// ─── Map helpers ────────────────────────────────────────────────

/**
 * Returns the active map ID if one is set, otherwise calls ctx.addSystemMessage with
 * an appropriate error and returns null.
 */
export function requireActiveMapId(ctx: CommandContext): string | null {
  const { activeMapId } = useGameStore.getState()
  if (!activeMapId) {
    ctx.addSystemMessage('No active map. Load a map first.')
    return null
  }
  return activeMapId
}

/**
 * Returns the active MapCanvas map object if one is set, otherwise calls
 * ctx.addSystemMessage with an appropriate error and returns null.
 */
export function requireActiveMap(ctx: CommandContext): { id: string; tokens: MapToken[]; name?: string } | null {
  const gameState = useGameStore.getState()
  const activeMapId = gameState.activeMapId
  if (!activeMapId) {
    ctx.addSystemMessage('No active map. Load a map first.')
    return null
  }
  const activeMap = gameState.maps.find((m) => m.id === activeMapId)
  if (!activeMap) {
    ctx.addSystemMessage('Active map not found.')
    return null
  }
  return activeMap as { id: string; tokens: MapToken[]; name?: string }
}

/**
 * Find a token on a map by label (case-insensitive exact match, then partial).
 * If not found, calls ctx.addSystemMessage and returns null.
 */
export function requireTokenOnMap(mapId: string, name: string, ctx: CommandContext): MapToken | null {
  const gameState = useGameStore.getState()
  const map = gameState.maps.find((m) => m.id === mapId)
  if (!map) {
    ctx.addSystemMessage('Active map not found.')
    return null
  }
  const q = name.toLowerCase()
  const token =
    (map.tokens as MapToken[]).find((t) => t.label?.toLowerCase() === q) ??
    (map.tokens as MapToken[]).find((t) => t.label?.toLowerCase().includes(q))
  if (!token) {
    ctx.addSystemMessage(`Token not found: "${name}"`)
    return null
  }
  return token
}

// ─── Condition helpers ──────────────────────────────────────────

/**
 * Add a permanent named condition to a character entity.
 */
export function addConditionOnCharacter(char: Character5e, conditionName: string): void {
  const gameStore = useGameStore.getState()
  gameStore.addCondition({
    id: crypto.randomUUID(),
    entityId: char.id,
    entityName: char.name,
    condition: conditionName,
    duration: 'permanent',
    source: 'command',
    appliedRound: gameStore.round
  })
}

/**
 * Remove the first condition whose name starts with `prefix` for the given entity.
 * Returns the removed condition, or undefined if none found.
 */
export function removeConditionByPrefix(
  entityId: string,
  prefix: string
): ReturnType<typeof useGameStore.getState>['conditions'][number] | undefined {
  const gameStore = useGameStore.getState()
  const existing = gameStore.conditions.find(
    (c) => c.entityId === entityId && c.condition.toLowerCase().startsWith(prefix.toLowerCase())
  )
  if (existing) {
    gameStore.removeCondition(existing.id)
  }
  return existing
}

/**
 * Remove a condition that includes the given substring in its name for the given entity.
 * Returns the removed condition, or undefined if none found.
 */
export function removeConditionBySubstring(
  entityId: string,
  substring: string
): ReturnType<typeof useGameStore.getState>['conditions'][number] | undefined {
  const gameStore = useGameStore.getState()
  const existing = gameStore.conditions.find(
    (c) => c.entityId === entityId && c.condition.toLowerCase().includes(substring.toLowerCase())
  )
  if (existing) {
    gameStore.removeCondition(existing.id)
  }
  return existing
}
