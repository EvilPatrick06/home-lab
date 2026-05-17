import { cryptoRollDie } from '../../utils/crypto-random'

export interface DiceParsed {
  count: number
  sides: number
  modifier: number
}

export interface DiceRollResult {
  formula: string
  total: number
  rolls: number[]
}

export function parseDiceFormula(formula: string): DiceParsed | null {
  const match = formula.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/)
  if (!match) return null
  return {
    count: match[1] ? parseInt(match[1], 10) : 1,
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0
  }
}

export function rollDice(count: number, sides: number): number[] {
  if (count < 1 || sides < 1) return []
  const results: number[] = []
  for (let i = 0; i < count; i++) {
    if (sides === 3) {
      const d6 = cryptoRollDie(6)
      results.push(Math.ceil(d6 / 2))
    } else {
      results.push(cryptoRollDie(sides))
    }
  }
  return results
}

export function rollFormula(formula: string): DiceRollResult | null {
  const parsed = parseDiceFormula(formula)
  if (!parsed) return null

  const rolls = rollDice(parsed.count, parsed.sides)
  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier

  return { formula, total, rolls }
}

// ─── Extended expression parser ────────────────────────────────────────────────
// Supports compound expressions: 1d20+1d6, 2d20+5-1d4, 1d20+1d20+1d20+5
// Supports keep-highest/lowest: 2d20kh1 (advantage), 4d6kh3, 2d20kl1 (disadvantage)
// Supports drop-highest/lowest: 4d6dl1
// Returns rolls (all dice rolled, including dropped), total (after kh/kl/dl/dh),
// and a display string, or { error } if invalid.

export interface DiceExpressionRoll {
  /** The original input formula */
  formula: string
  /** Pretty display string with each term's rolls inlined */
  display: string
  /** Final sum after modifiers and keep/drop applied */
  total: number
  /** All dice rolled, in order of input (includes dropped values for transparency) */
  rolls: number[]
}

export interface DiceExpressionError {
  error: string
}

const MAX_DICE = 100
const MAX_SIDES = 1000
// Match a single dice term: optional sign, count, d, sides, optional keep/drop modifier
// Examples: 1d20, d20, 2d6, 4d6kh3, 2d20kl1, 4d6dh1, 4d6dl1
const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?$/i

function rollOnce(sides: number): number {
  return cryptoRollDie(sides)
}

/**
 * Evaluate a dice expression like "1d20+5" or "2d20kh1+3" or "1d8+1d6+2".
 * On error returns { error: '...' } with a user-readable reason.
 */
export function evalDiceExpression(formula: string): DiceExpressionRoll | DiceExpressionError {
  const cleaned = formula.trim().replace(/\s+/g, '')
  if (!cleaned) return { error: 'Empty dice formula.' }

  // Split into terms preserving the leading sign of each. Leading + is implicit.
  // Walk the string and split on + or - that are not at position 0.
  const terms: { sign: 1 | -1; body: string }[] = []
  let i = 0
  let sign: 1 | -1 = 1
  let buf = ''
  while (i < cleaned.length) {
    const ch = cleaned[i]
    if ((ch === '+' || ch === '-') && buf.length > 0) {
      terms.push({ sign, body: buf })
      sign = ch === '+' ? 1 : -1
      buf = ''
    } else if ((ch === '+' || ch === '-') && buf.length === 0 && i === 0) {
      sign = ch === '+' ? 1 : -1
    } else {
      buf += ch
    }
    i++
  }
  if (buf.length > 0) terms.push({ sign, body: buf })
  if (terms.length === 0) return { error: 'Empty dice formula.' }

  const allRolls: number[] = []
  const displayParts: string[] = []
  let total = 0
  let totalDiceRolled = 0

  for (let t = 0; t < terms.length; t++) {
    const { sign: termSign, body } = terms[t]
    const signStr = termSign === -1 ? '-' : t === 0 ? '' : '+'

    // Constant?
    if (/^\d+$/.test(body)) {
      const c = parseInt(body, 10) * termSign
      total += c
      displayParts.push(`${signStr}${body}`)
      continue
    }

    // Dice term
    const m = body.match(TERM_RE)
    if (!m) {
      return { error: `Cannot parse "${body}". Use NdM (e.g. 1d20), NdMkhX (advantage), or NdMklX (disadvantage).` }
    }
    const count = m[1] ? parseInt(m[1], 10) : 1
    const sides = parseInt(m[2], 10)
    const modKind = m[3]?.toLowerCase() as 'kh' | 'kl' | 'dh' | 'dl' | undefined
    const modN = m[4] ? parseInt(m[4], 10) : 0

    if (count < 1) return { error: `Dice count must be at least 1 (got "${body}").` }
    if (sides < 1) return { error: `Die size must be at least 1 (got "${body}").` }
    if (sides > MAX_SIDES) return { error: `Die size too large — max d${MAX_SIDES} (got "${body}").` }
    totalDiceRolled += count
    if (totalDiceRolled > MAX_DICE) {
      return { error: `Too many dice — max ${MAX_DICE} dice per roll.` }
    }
    if (modKind && (modN < 1 || modN > count)) {
      return {
        error: `${modKind.toUpperCase()} value must be between 1 and the dice count (got ${modN} for ${count} dice).`
      }
    }

    const rolled: number[] = []
    for (let k = 0; k < count; k++) rolled.push(rollOnce(sides))
    allRolls.push(...rolled)

    let kept = rolled.slice()
    if (modKind) {
      const sorted = rolled.slice().sort((a, b) => a - b) // ascending
      if (modKind === 'kh') kept = sorted.slice(-modN)
      else if (modKind === 'kl') kept = sorted.slice(0, modN)
      else if (modKind === 'dh') kept = sorted.slice(0, count - modN)
      else if (modKind === 'dl') kept = sorted.slice(modN)
    }
    const termTotal = kept.reduce((acc, v) => acc + v, 0) * termSign
    total += termTotal

    // Display: show all rolls; mark kept vs dropped if a kh/kl/dh/dl was used.
    let detail: string
    if (modKind) {
      const keptCount: Record<number, number> = {}
      for (const v of kept) keptCount[v] = (keptCount[v] ?? 0) + 1
      const parts = rolled.map((v) => {
        if (keptCount[v] && keptCount[v] > 0) {
          keptCount[v]--
          return String(v)
        }
        return `~~${v}~~` // dropped
      })
      detail = `[${parts.join(', ')}]`
    } else {
      detail = `[${rolled.join(', ')}]`
    }
    displayParts.push(`${signStr}${body} ${detail}`)
  }

  return {
    formula,
    display: displayParts.join(' ').replace(/^\+/, ''),
    total,
    rolls: allRolls
  }
}

export function isDiceExpressionError(r: DiceExpressionRoll | DiceExpressionError): r is DiceExpressionError {
  return (r as DiceExpressionError).error !== undefined
}
