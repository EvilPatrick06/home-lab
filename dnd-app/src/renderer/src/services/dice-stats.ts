// ---------------------------------------------------------------------------
// Dice Roll Statistics
// ---------------------------------------------------------------------------
// Aggregates the DiceRollRecord[] the game store already records (diceHistory)
// into per-player statistics: d20 histograms, crit/fumble tallies, averages vs
// the expected mean, and a session "luck" summary. Pure functions (no store /
// React) so they are trivially unit-testable and reusable (e.g. to feed the AI
// DM end-of-session recap a one-line luck note).

import type { DiceRollRecord } from '../types/game-state'

/** A single d20 face count map: faces 1..20 → how many times rolled. */
export type D20Histogram = Record<number, number>

export interface PlayerDiceStats {
  rollerName: string
  /** Total rolls recorded for this player (any die). */
  totalRolls: number
  /** Number of d20 dice rolled (a `2d20` roll counts as 2). */
  d20Count: number
  /** Faces 1..20 → count, across every d20 die this player rolled. */
  d20Histogram: D20Histogram
  /** Natural 20s (a raw d20 die showing 20). */
  nat20: number
  /** Natural 1s (a raw d20 die showing 1). */
  nat1: number
  /** Mean of all raw d20 dice faces (0 when no d20 rolls). */
  d20Average: number
  /**
   * Luck index: observed d20 average minus the expected 10.5, so >0 is lucky,
   * <0 is unlucky. 0 when the player has no d20 rolls.
   */
  luck: number
}

export interface DiceStatsSummary {
  perPlayer: PlayerDiceStats[]
  totalRolls: number
  totalD20: number
  totalNat20: number
  totalNat1: number
  /** The luckiest player by d20 average (needs ≥1 d20 roll), else null. */
  luckiest: PlayerDiceStats | null
  /** The unluckiest player by d20 average (needs ≥1 d20 roll), else null. */
  unluckiest: PlayerDiceStats | null
}

/** Expected mean of a fair d20. */
export const D20_EXPECTED_MEAN = 10.5

// Match the die-size groups in a formula, e.g. "2d20", "1d20kh1", "d20+5".
// We only care about the `dN` count/size, so a simple global scan suffices.
const DIE_TERM_RE = /(\d*)d(\d+)/gi

/**
 * How many d20 DICE a formula rolls (e.g. "2d20+3" → 2, "1d8" → 0, "d20" → 1).
 * Advantage/disadvantage style "2d20kh1" still rolls 2 physical d20 dice, so all
 * raw d20 faces in `rolls` are counted — the histogram reflects physical dice,
 * not the kept result.
 */
export function countD20Dice(formula: string): number {
  let n = 0
  for (const m of formula.matchAll(DIE_TERM_RE)) {
    const size = parseInt(m[2], 10)
    if (size === 20) {
      const count = m[1] ? parseInt(m[1], 10) : 1
      n += count
    }
  }
  return n
}

/**
 * Extract the raw d20 die faces from a roll record. `rolls` is the flat list of
 * every raw die result; when a formula rolls exactly N d20 and no other dice,
 * every entry is a d20 face. When it mixes dice (e.g. "1d20+2d6"), we can only
 * safely attribute the FIRST `countD20Dice` entries as d20 faces if the d20
 * terms lead the formula; to stay correct we only harvest d20 faces from rolls
 * whose formula contains ONLY d20 dice (the overwhelmingly common attack/save/
 * check case). Mixed formulas still count toward totalRolls but not the d20
 * histogram — conservative over wrong.
 */
export function d20FacesFromRoll(roll: DiceRollRecord): number[] {
  const d20 = countD20Dice(roll.formula)
  if (d20 === 0) return []
  // Count total dice terms; if any non-d20 dice are present we skip histogram
  // attribution (can't map flat `rolls` back to specific dice reliably).
  let totalDice = 0
  for (const m of roll.formula.matchAll(DIE_TERM_RE)) {
    totalDice += m[1] ? parseInt(m[1], 10) : 1
  }
  if (totalDice !== d20) return []
  // Only the raw d20 faces (bounded to the valid 1..20 range).
  return roll.rolls.filter((v) => Number.isInteger(v) && v >= 1 && v <= 20)
}

function emptyPlayer(name: string): PlayerDiceStats {
  return {
    rollerName: name,
    totalRolls: 0,
    d20Count: 0,
    d20Histogram: {},
    nat20: 0,
    nat1: 0,
    d20Average: 0,
    luck: 0
  }
}

/** Compute the full per-player + session dice statistics from roll history. */
export function computeDiceStats(history: DiceRollRecord[]): DiceStatsSummary {
  const byPlayer = new Map<string, PlayerDiceStats>()
  const d20Sum = new Map<string, number>()

  for (const roll of history) {
    const name = roll.rollerName || 'Unknown'
    let p = byPlayer.get(name)
    if (!p) {
      p = emptyPlayer(name)
      byPlayer.set(name, p)
      d20Sum.set(name, 0)
    }
    p.totalRolls++

    const faces = d20FacesFromRoll(roll)
    for (const face of faces) {
      p.d20Count++
      p.d20Histogram[face] = (p.d20Histogram[face] ?? 0) + 1
      if (face === 20) p.nat20++
      if (face === 1) p.nat1++
      d20Sum.set(name, (d20Sum.get(name) ?? 0) + face)
    }
  }

  const perPlayer: PlayerDiceStats[] = []
  for (const p of byPlayer.values()) {
    if (p.d20Count > 0) {
      p.d20Average = (d20Sum.get(p.rollerName) ?? 0) / p.d20Count
      p.luck = p.d20Average - D20_EXPECTED_MEAN
    }
    perPlayer.push(p)
  }
  perPlayer.sort((a, b) => a.rollerName.localeCompare(b.rollerName))

  const withD20 = perPlayer.filter((p) => p.d20Count > 0)
  let luckiest: PlayerDiceStats | null = null
  let unluckiest: PlayerDiceStats | null = null
  for (const p of withD20) {
    if (!luckiest || p.d20Average > luckiest.d20Average) luckiest = p
    if (!unluckiest || p.d20Average < unluckiest.d20Average) unluckiest = p
  }

  return {
    perPlayer,
    totalRolls: history.length,
    totalD20: perPlayer.reduce((s, p) => s + p.d20Count, 0),
    totalNat20: perPlayer.reduce((s, p) => s + p.nat20, 0),
    totalNat1: perPlayer.reduce((s, p) => s + p.nat1, 0),
    luckiest,
    unluckiest
  }
}

/**
 * A one-line luck summary suitable for a session recap, e.g.
 * "Gavin was on fire (avg 13.2 on the d20, 4 nat-20s); Priya couldn't catch a
 * break (avg 8.1)." Returns '' when there isn't enough d20 data.
 */
export function luckSummaryLine(summary: DiceStatsSummary): string {
  if (summary.totalD20 === 0 || !summary.luckiest) return ''
  const parts: string[] = []
  const lucky = summary.luckiest
  parts.push(
    `${lucky.rollerName} rolled hot (avg ${lucky.d20Average.toFixed(1)} on the d20` +
      (lucky.nat20 > 0 ? `, ${lucky.nat20} nat-20${lucky.nat20 === 1 ? '' : 's'}` : '') +
      ')'
  )
  const unlucky = summary.unluckiest
  if (unlucky && unlucky.rollerName !== lucky.rollerName) {
    parts.push(`${unlucky.rollerName} ran cold (avg ${unlucky.d20Average.toFixed(1)})`)
  }
  return `${parts.join('; ')}.`
}
