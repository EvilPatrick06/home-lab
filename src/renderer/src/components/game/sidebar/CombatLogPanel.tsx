import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../../stores/use-game-store'
import type { CombatLogEntry } from '../../../types/game-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CombatLogPanelProps {
  onClose?: () => void
}

type TabId = 'log' | 'summary'

interface EntitySummary {
  entityId: string
  entityName: string
  damageDealt: number
  damageTaken: number
  healed: number
  kills: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEntryColor(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'damage':
      return 'text-red-400'
    case 'heal':
      return 'text-green-400'
    case 'condition':
      return 'text-purple-400'
    case 'save':
      return 'text-orange-400'
    case 'attack':
      return 'text-blue-400'
    case 'death':
      return 'text-red-300'
    default:
      return 'text-gray-400'
  }
}

function getEntryBorderColor(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'damage':
      return 'border-l-red-500/50'
    case 'heal':
      return 'border-l-green-500/50'
    case 'condition':
      return 'border-l-purple-500/50'
    case 'save':
      return 'border-l-orange-500/50'
    case 'attack':
      return 'border-l-blue-500/50'
    case 'death':
      return 'border-l-red-400/50'
    default:
      return 'border-l-gray-600/50'
  }
}

function getTypeIcon(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'damage':
      return '\u2694\uFE0F' // crossed swords
    case 'heal':
      return '\u2764\uFE0F' // heart
    case 'condition':
      return '\u2728' // sparkles
    case 'save':
      return '\uD83D\uDEE1\uFE0F' // shield
    case 'attack':
      return '\uD83C\uDFAF' // target
    case 'death':
      return '\uD83D\uDC80' // skull
    default:
      return '\u25CF' // bullet
  }
}

function getValueColor(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'damage':
      return 'text-red-300 bg-red-900/30'
    case 'heal':
      return 'text-green-300 bg-green-900/30'
    case 'save':
      return 'text-orange-300 bg-orange-900/30'
    default:
      return 'text-gray-300 bg-gray-700/30'
  }
}

/** Group log entries by round number */
function groupByRound(entries: CombatLogEntry[]): Map<number, CombatLogEntry[]> {
  const groups = new Map<number, CombatLogEntry[]>()
  for (const entry of entries) {
    const round = entry.round
    if (!groups.has(round)) {
      groups.set(round, [])
    }
    groups.get(round)?.push(entry)
  }
  return groups
}

/** Build per-entity summary stats from log entries */
function buildSummaries(entries: CombatLogEntry[]): EntitySummary[] {
  const map = new Map<string, EntitySummary>()

  const getOrCreate = (id: string, name: string): EntitySummary => {
    if (!map.has(id)) {
      map.set(id, { entityId: id, entityName: name, damageDealt: 0, damageTaken: 0, healed: 0, kills: 0 })
    }
    return map.get(id)!
  }

  for (const entry of entries) {
    if (entry.type === 'damage' && entry.value) {
      // Source dealt damage
      if (entry.sourceEntityId && entry.sourceEntityName) {
        getOrCreate(entry.sourceEntityId, entry.sourceEntityName).damageDealt += entry.value
      }
      // Target took damage
      if (entry.targetEntityId && entry.targetEntityName) {
        getOrCreate(entry.targetEntityId, entry.targetEntityName).damageTaken += entry.value
      }
    }

    if (entry.type === 'heal' && entry.value) {
      // Source healed the target (credit the source)
      if (entry.sourceEntityId && entry.sourceEntityName) {
        getOrCreate(entry.sourceEntityId, entry.sourceEntityName).healed += entry.value
      } else if (entry.targetEntityId && entry.targetEntityName) {
        // Self-heal or no source: credit the target
        getOrCreate(entry.targetEntityId, entry.targetEntityName).healed += entry.value
      }
    }

    if (entry.type === 'death') {
      // Credit the source with a kill
      if (entry.sourceEntityId && entry.sourceEntityName) {
        getOrCreate(entry.sourceEntityId, entry.sourceEntityName).kills += 1
      }
      // Also ensure the dead entity appears in the summary
      if (entry.targetEntityId && entry.targetEntityName) {
        getOrCreate(entry.targetEntityId, entry.targetEntityName)
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.damageDealt - a.damageDealt)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LogEntry({ entry }: { entry: CombatLogEntry }): JSX.Element {
  const color = getEntryColor(entry.type)
  const borderColor = getEntryBorderColor(entry.type)
  const icon = getTypeIcon(entry.type)
  const valueColor = getValueColor(entry.type)

  return (
    <div className={`border-l-2 ${borderColor} pl-2 py-1`}>
      <div className="flex items-start gap-1.5">
        <span className="text-[11px] shrink-0 mt-px">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {entry.sourceEntityName && (
              <span className="text-[11px] font-semibold text-gray-200">{entry.sourceEntityName}</span>
            )}
            {entry.sourceEntityName && entry.targetEntityName && (
              <span className="text-[10px] text-gray-600">{'\u2192'}</span>
            )}
            {entry.targetEntityName && (
              <span className="text-[11px] font-semibold text-gray-300">{entry.targetEntityName}</span>
            )}
          </div>
          <p className={`text-[11px] ${color} leading-snug mt-0.5`}>{entry.description}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {entry.value != null && entry.value !== 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${valueColor}`}>
                {entry.type === 'heal' ? '+' : ''}
                {entry.value}
                {entry.damageType ? ` ${entry.damageType}` : ''}
              </span>
            )}
            <span className="text-[9px] text-gray-600">
              {new Date(entry.timestamp).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoundDivider({ round }: { round: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 h-px bg-gray-700/50" />
      <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider shrink-0">Round {round}</span>
      <div className="flex-1 h-px bg-gray-700/50" />
    </div>
  )
}

function SummaryBar({
  label,
  value,
  maxValue,
  color
}: {
  label: string
  value: number
  maxValue: number
  color: string
}): JSX.Element {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-16 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-300 w-10 shrink-0">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CombatLogPanel({ onClose }: CombatLogPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('log')

  const combatLog = useGameStore((s) => s.combatLog)
  const clearCombatLog = useGameStore((s) => s.clearCombatLog)
  const round = useGameStore((s) => s.round)

  // Auto-scroll ref
  const logEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (activeTab === 'log' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeTab])

  // Grouped by round for the live log
  const roundGroups = useMemo(() => groupByRound(combatLog), [combatLog])

  // Summary data
  const summaries = useMemo(() => buildSummaries(combatLog), [combatLog])

  const totalDamage = useMemo(() => summaries.reduce((sum, s) => sum + s.damageDealt, 0), [summaries])
  const totalHealed = useMemo(() => summaries.reduce((sum, s) => sum + s.healed, 0), [summaries])
  const maxDamageDealt = useMemo(() => Math.max(...summaries.map((s) => s.damageDealt), 1), [summaries])
  const maxDamageTaken = useMemo(() => Math.max(...summaries.map((s) => s.damageTaken), 1), [summaries])
  const maxHealed = useMemo(() => Math.max(...summaries.map((s) => s.healed), 1), [summaries])

  const highestRound = useMemo(() => {
    if (combatLog.length === 0) return 0
    return Math.max(...combatLog.map((e) => e.round))
  }, [combatLog])

  const handleClear = (): void => {
    if (combatLog.length === 0) return
    clearCombatLog()
  }

  return (
    <div className="w-80 h-full bg-gray-900/95 border-l border-gray-700 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-gray-100">Combat Log</h2>
          {round > 0 && (
            <span className="text-[10px] font-semibold text-amber-500 bg-amber-900/30 px-1.5 py-0.5 rounded">
              Round {round}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            title="Clear log"
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 cursor-pointer transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-gray-800 cursor-pointer transition-colors"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 px-3 py-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('log')}
          className={`px-3 py-1 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
            activeTab === 'log'
              ? 'bg-amber-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
          }`}
        >
          Live Log
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-3 py-1 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
            activeTab === 'summary'
              ? 'bg-amber-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
          }`}
        >
          Summary
        </button>
      </div>

      {/* Content */}
      {activeTab === 'log' ? (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-0 space-y-1">
          {combatLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-xs text-gray-500">No combat events recorded yet.</p>
              <p className="text-[10px] text-gray-600 mt-1">Events will appear here during combat.</p>
            </div>
          ) : (
            <>
              {Array.from(roundGroups.entries()).map(([roundNum, entries]) => (
                <div key={roundNum}>
                  <RoundDivider round={roundNum} />
                  <div className="space-y-1">
                    {entries.map((entry) => (
                      <LogEntry key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
          {combatLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-xs text-gray-500">No combat data to summarize.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Totals banner */}
              <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/30">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                  Combat Overview
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-100">{highestRound}</div>
                    <div className="text-[10px] text-gray-500">Rounds</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-400">{totalDamage}</div>
                    <div className="text-[10px] text-gray-500">Total Dmg</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{totalHealed}</div>
                    <div className="text-[10px] text-gray-500">Total Healed</div>
                  </div>
                </div>
              </div>

              {/* Per-entity breakdown */}
              <div className="space-y-3">
                {summaries.map((summary) => (
                  <div key={summary.entityId} className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-200">{summary.entityName}</span>
                      {summary.kills > 0 && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">
                          {summary.kills} kill{summary.kills !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <SummaryBar
                        label="Dealt"
                        value={summary.damageDealt}
                        maxValue={maxDamageDealt}
                        color="bg-red-500"
                      />
                      <SummaryBar
                        label="Taken"
                        value={summary.damageTaken}
                        maxValue={maxDamageTaken}
                        color="bg-orange-500"
                      />
                      {summary.healed > 0 && (
                        <SummaryBar label="Healed" value={summary.healed} maxValue={maxHealed} color="bg-green-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Event type breakdown */}
              <div className="bg-gray-800/40 rounded-lg p-2.5 border border-gray-700/30">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                  Event Breakdown
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {(['damage', 'heal', 'attack', 'condition', 'save', 'death', 'other'] as const).map((type) => {
                    const count = combatLog.filter((e) => e.type === type).length
                    if (count === 0) return null
                    return (
                      <div key={type} className="flex items-center justify-between">
                        <span className={`text-[11px] capitalize ${getEntryColor(type)}`}>
                          {getTypeIcon(type)} {type}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
