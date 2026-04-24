/**
 * Unified dice rolling service.
 * All dice rolls in the app should go through this service so that:
 * 1. 3D dice animations are triggered
 * 2. Results are broadcast to chat + network
 * 3. Sound effects play
 * 4. Last-roll tracking works for /reroll
 */
import {
  type CreateDieOptions,
  type Dice3dRollEvent,
  type DiceTrayEntry,
  trigger3dDice
} from '../../components/game/dice3d'
import type { DiceResultPayload, DiceRevealPayload, DiceRollHiddenPayload } from '../../network'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import { cryptoRandom } from '../../utils/crypto-random'
import type { DiceParsed, DiceRollResult as EngineRollResult } from './dice-engine'

type _CreateDieOptions = CreateDieOptions
type _Dice3dRollEvent = Dice3dRollEvent
type _DiceTrayEntry = DiceTrayEntry
type _DiceParsed = DiceParsed
type _EngineRollResult = EngineRollResult

// ─── Types ────────────────────────────────────────────────────

export interface DiceRollResult {
  formula: string
  rolls: number[]
  total: number
  natural20: boolean
  natural1: boolean
}

export interface DiceRollOptions {
  /** Don't show 3D animation or broadcast (DM hidden rolls) */
  secret?: boolean
  /** Label for the roll (e.g. "Attack", "Damage") */
  label?: string
  /** Roll with advantage (roll 2d20, take highest) */
  advantage?: boolean
  /** Roll with disadvantage (roll 2d20, take lowest) */
  disadvantage?: boolean
  /** Don't broadcast to chat (for sub-rolls that are part of a larger action) */
  silent?: boolean
  /** Roller name override (defaults to local player name) */
  rollerName?: string
}

// ─── Last roll tracking (for /reroll) ─────────────────────────

let _lastRoll: { formula: string; rolls: number[]; total: number; rollerName: string } | null = null

export function getLastRoll() {
  return _lastRoll
}
export function setLastRoll(roll: typeof _lastRoll) {
  _lastRoll = roll
}

// ─── Core dice rolling ────────────────────────────────────────

/** Roll a single die with the given number of sides */
export function rollSingle(sides: number): number {
  return Math.floor(cryptoRandom() * sides) + 1
}

/** Roll multiple dice of the same type */
export function rollMultiple(count: number, sides: number): number[] {
  const rolls: number[] = []
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(cryptoRandom() * sides) + 1)
  }
  return rolls
}

/** Parse a dice formula like "2d6+3", "1d20-1", "4d8" */
export function parseFormula(formula: string): { count: number; sides: number; modifier: number } | null {
  const match = formula.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/)
  if (!match) return null
  const count = match[1] ? parseInt(match[1], 10) : 1
  const sides = parseInt(match[2], 10)
  if (count < 1 || count > 100) return null
  if (sides < 1 || sides > 1000) return null
  return {
    count,
    sides,
    modifier: match[3] ? parseInt(match[3], 10) : 0
  }
}

// ─── Main roll function ───────────────────────────────────────

/**
 * Roll dice with a formula string (e.g. "2d6+3", "1d20+5").
 * Triggers 3D animation, broadcasts to chat/network, plays sound.
 */
export function roll(formula: string, options: DiceRollOptions = {}): DiceRollResult {
  const parsed = parseFormula(formula)
  if (!parsed) {
    return { formula, rolls: [0], total: 0, natural20: false, natural1: false }
  }

  let rolls: number[]
  let displayFormula = formula

  if ((options.advantage || options.disadvantage) && parsed.sides === 20 && parsed.count === 1) {
    // Roll 2d20 for advantage/disadvantage
    const roll1 = rollSingle(20)
    const roll2 = rollSingle(20)
    const chosen = options.advantage ? Math.max(roll1, roll2) : Math.min(roll1, roll2)
    rolls = [chosen]
    const label = options.advantage ? 'Adv' : 'Dis'
    displayFormula = `1d20${parsed.modifier >= 0 ? '+' : ''}${parsed.modifier || ''} (${label}: ${roll1}, ${roll2})`
  } else {
    rolls = rollMultiple(parsed.count, parsed.sides)
  }

  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier
  const natural20 = parsed.sides === 20 && parsed.count === 1 && rolls[0] === 20
  const natural1 = parsed.sides === 20 && parsed.count === 1 && rolls[0] === 1

  const result: DiceRollResult = { formula: displayFormula, rolls, total, natural20, natural1 }

  const rollerName = options.rollerName || getLocalPlayerName()

  // Track for /reroll
  if (!options.secret) {
    _lastRoll = { formula: displayFormula, rolls, total, rollerName }
  }

  // Trigger 3D dice animation (unless secret or silent)
  if (!options.secret) {
    trigger3dDice({
      formula: displayFormula,
      rolls,
      total,
      rollerName,
      isSecret: false
    })
  }

  // Broadcast to chat and network (unless silent or secret)
  if (!options.silent && !options.secret) {
    broadcastResult(displayFormula, rolls, total, rollerName, options.label)
  }

  return result
}

/**
 * Roll dice without any side effects (no 3D animation, no broadcast).
 * Use for internal calculations like treasure generation.
 */
export function rollQuiet(formula: string): DiceRollResult {
  return roll(formula, { silent: true, secret: true })
}

/**
 * Roll a d20 with modifier. Convenience for the most common roll type.
 * Broadcasts and triggers 3D animation by default.
 */
export function rollD20(modifier: number = 0, options: DiceRollOptions = {}): DiceRollResult {
  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`
  const formula = modifier !== 0 ? `1d20${modStr}` : '1d20'
  return roll(formula, options)
}

/**
 * Roll damage dice. Convenience for XdY+mod patterns.
 */
export function rollDamage(
  count: number,
  sides: number,
  modifier: number = 0,
  options: DiceRollOptions = {}
): DiceRollResult {
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ''
  const formula = `${count}d${sides}${modStr}`
  return roll(formula, options)
}

// ─── DM-specific rolls ───────────────────────────────────────

/**
 * Roll for DM — triggers local 3D dice with numbers visible,
 * sends hidden animation to players (blurred dice with '?').
 */
export function rollForDm(formula: string, options: DiceRollOptions = {}): DiceRollResult {
  const result = roll(formula, { ...options, secret: true }) // don't broadcast normally

  const rollerName = options.rollerName || 'DM'

  // Trigger 3D dice locally (DM sees real numbers)
  trigger3dDice({
    formula: result.formula,
    rolls: result.rolls,
    total: result.total,
    rollerName,
    isSecret: false
  })

  // Send hidden animation to players
  const { sendMessage } = useNetworkStore.getState()
  const parsed = parseFormula(formula)
  const hiddenPayload: DiceRollHiddenPayload = {
    formula: result.formula,
    diceCount: result.rolls.length,
    dieSides: parsed ? [parsed.sides] : [20],
    rollerName
  }
  sendMessage('game:dice-roll-hidden', hiddenPayload)

  return result
}

/**
 * Reveal a previously hidden roll — broadcasts to chat + network.
 */
export function revealRoll(result: DiceRollResult, label?: string): void {
  const rollerName = 'DM'
  broadcastResult(result.formula, result.rolls, result.total, rollerName, label)

  const { sendMessage } = useNetworkStore.getState()
  const revealPayload: DiceRevealPayload = {
    formula: result.formula,
    rolls: result.rolls,
    total: result.total,
    rollerName,
    label
  }
  sendMessage('game:dice-reveal', revealPayload)
}

// ─── Helpers ──────────────────────────────────────────────────

function getLocalPlayerName(): string {
  const localPeerId = useNetworkStore.getState().localPeerId
  const players = useLobbyStore.getState().players
  const localPlayer = localPeerId
    ? players.find((p) => p.peerId === localPeerId)
    : players.length > 0
      ? players[0]
      : undefined
  return localPlayer?.displayName || 'Player'
}

function broadcastResult(formula: string, rolls: number[], total: number, rollerName: string, label?: string): void {
  const { sendMessage } = useNetworkStore.getState()
  const { addChatMessage } = useLobbyStore.getState()
  const localPeerId = useNetworkStore.getState().localPeerId

  const content = label ? `${label}: rolled ${formula}` : `rolled ${formula}`

  addChatMessage({
    id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: localPeerId || 'local',
    senderName: rollerName,
    content,
    timestamp: Date.now(),
    isSystem: false,
    isDiceRoll: true,
    diceResult: { formula, rolls, total }
  })

  const resultPayload: DiceResultPayload = {
    formula,
    rolls,
    total,
    isCritical: rolls.length === 1 && rolls[0] === 20,
    isFumble: rolls.length === 1 && rolls[0] === 1,
    rollerName
  }
  sendMessage('game:dice-result', resultPayload)
}
