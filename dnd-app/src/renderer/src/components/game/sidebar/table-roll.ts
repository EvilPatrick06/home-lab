/**
 * Helpers for rolling "simple array" random tables that are actually weighted
 * range tables — rows keyed by a die span like `{ d20Min, d20Max, condition }`
 * (e.g. the 5e Weather table). Such tables must be rolled on the implied die and
 * matched by range, NOT 1dN by element count (which would make a 14-wide row as
 * likely as a 1-wide row).
 */

export interface RangeTableShape {
  die: number
  minKey: string
  maxKey: string
}

const RANGE_KEY_RE = /^d(\d+)Min$/

/** Detect a min/max-keyed range table; null for an ordinary by-count array. */
export function detectRangeTable(rows: unknown[]): RangeTableShape | null {
  const first = rows[0]
  if (typeof first !== 'object' || first === null) return null
  const keys = Object.keys(first as Record<string, unknown>)
  const minKey = keys.find((k) => RANGE_KEY_RE.test(k))
  if (!minKey) return null
  const die = Number(minKey.match(RANGE_KEY_RE)![1])
  if (!Number.isFinite(die) || die < 1) return null
  const maxKey = `d${die}Max`
  if (!keys.includes(maxKey)) return null
  return { die, minKey, maxKey }
}

/** Find the row whose [min,max] span contains the rolled value. */
export function pickRangeRow<T extends Record<string, unknown>>(
  rows: T[],
  shape: RangeTableShape,
  roll: number
): T | undefined {
  return rows.find((row) => {
    const min = Number(row[shape.minKey])
    const max = Number(row[shape.maxKey])
    return roll >= min && roll <= max
  })
}
