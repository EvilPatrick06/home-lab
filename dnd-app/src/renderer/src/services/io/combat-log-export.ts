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
