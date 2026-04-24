// ---------------------------------------------------------------------------
// Combat Log Export & Filter Service
// ---------------------------------------------------------------------------

import type { CombatLogEntry } from '../../types/game-state'

// --- Export functions --------------------------------------------------------

/**
 * Export combat log entries to a plain text format.
 */
export function exportCombatLogText(entries: CombatLogEntry[]): string {
  if (entries.length === 0) return '(No combat log entries)'

  const lines: string[] = ['=== Combat Log ===', '']

  for (const entry of entries) {
    const time = new Date(entry.timestamp).toLocaleTimeString()
    const round = entry.round > 0 ? `[Round ${entry.round}]` : ''
    const type = `[${entry.type.toUpperCase()}]`
    lines.push(`${time} ${round} ${type} ${entry.description}`)
  }

  lines.push('', `Total entries: ${entries.length}`)
  return lines.join('\n')
}

/**
 * Export combat log entries to JSON format.
 */
export function exportCombatLogJSON(entries: CombatLogEntry[]): string {
  return JSON.stringify(entries, null, 2)
}

/**
 * Export combat log entries to CSV format.
 */
export function exportCombatLogCSV(entries: CombatLogEntry[]): string {
  const headers = [
    'id',
    'timestamp',
    'round',
    'type',
    'sourceEntityId',
    'sourceEntityName',
    'targetEntityId',
    'targetEntityName',
    'value',
    'damageType',
    'description'
  ]

  const rows = entries.map((entry) =>
    [
      csvEscape(entry.id),
      new Date(entry.timestamp).toISOString(),
      entry.round.toString(),
      csvEscape(entry.type),
      csvEscape(entry.sourceEntityId ?? ''),
      csvEscape(entry.sourceEntityName ?? ''),
      csvEscape(entry.targetEntityId ?? ''),
      csvEscape(entry.targetEntityName ?? ''),
      entry.value?.toString() ?? '',
      csvEscape(entry.damageType ?? ''),
      csvEscape(entry.description)
    ].join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// --- Filter utility ---------------------------------------------------------

export interface CombatLogFilter {
  search?: string
  actor?: string
  type?: CombatLogEntry['type']
}

/**
 * Filter combat log entries by search text, actor name, and/or entry type.
 */
export function filterCombatLog(entries: CombatLogEntry[], filter: CombatLogFilter): CombatLogEntry[] {
  let result = entries

  if (filter.type) {
    result = result.filter((e) => e.type === filter.type)
  }

  if (filter.actor) {
    const actor = filter.actor.toLowerCase()
    result = result.filter(
      (e) => e.sourceEntityName?.toLowerCase().includes(actor) || e.targetEntityName?.toLowerCase().includes(actor)
    )
  }

  if (filter.search) {
    const search = filter.search.toLowerCase()
    result = result.filter(
      (e) =>
        e.description.toLowerCase().includes(search) ||
        e.sourceEntityName?.toLowerCase().includes(search) ||
        e.targetEntityName?.toLowerCase().includes(search) ||
        e.damageType?.toLowerCase().includes(search)
    )
  }

  return result
}
