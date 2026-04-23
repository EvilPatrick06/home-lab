import { cryptoRandom } from './crypto-random'

export interface ParsedDice {
  count: number
  sides: number
  modifier: number
}

export interface DiceRollResult {
  formula: string
  total: number
  rolls: number[]
}

export function parseDiceFormula(formula: string): ParsedDice | null {
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

export function rollDice(formula: string): DiceRollResult | null {
  const parsed = parseDiceFormula(formula)
  if (!parsed) return null
  const rolls: number[] = []
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(cryptoRandom() * parsed.sides) + 1)
  }
  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier
  return { formula, total, rolls }
}
