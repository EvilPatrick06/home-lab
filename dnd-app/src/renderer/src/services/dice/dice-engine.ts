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
