/**
 * PHASE-47 F3 — display formatter for a rolled entry from a "simple array" roll
 * table. Most array tables are `string[]` (NPC traits, etc.), but a few are
 * arrays of OBJECTS (e.g. Weather: `{ d20Min, d20Max, condition }`). Coercing
 * an object entry straight into a chat line produced "[object Object]"; this
 * picks the first non-range display field instead.
 */

// Keys that describe a die range / weighting rather than display text.
const RANGE_KEYS = new Set([
  'roll',
  'weight',
  'min',
  'max',
  'd4Min',
  'd4Max',
  'd6Min',
  'd6Max',
  'd8Min',
  'd8Max',
  'd10Min',
  'd10Max',
  'd12Min',
  'd12Max',
  'd20Min',
  'd20Max',
  'd100Min',
  'd100Max'
])

export function formatTableEntry(entry: unknown, fallback: string): string {
  if (entry === null || entry === undefined) return fallback
  if (typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    const displayKey = Object.keys(obj).find((k) => !RANGE_KEYS.has(k))
    if (displayKey === undefined) return fallback
    const value = obj[displayKey]
    return value === null || value === undefined ? fallback : String(value)
  }
  return String(entry)
}
