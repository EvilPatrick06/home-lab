import { useState } from 'react'
import type { Bastion } from '../../types/bastion'
import { ORDER_COLORS, ORDER_LABELS } from './bastion-constants'

export function TurnsTab({ bastion, onStartTurn }: { bastion: Bastion; onStartTurn: () => void }): JSX.Element {
  const sortedTurns = [...bastion.turns].sort((a, b) => b.turnNumber - a.turnNumber)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Bastion Turns ({bastion.turns.length})</h2>
        <button
          onClick={onStartTurn}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
        >
          + New Turn
        </button>
      </div>
      {sortedTurns.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-900 rounded-lg p-4">No turns recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {sortedTurns.map((turn) => (
            <div key={turn.turnNumber} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 font-mono">
                    Turn {turn.turnNumber}
                  </span>
                  <span className="text-xs text-gray-500">{turn.inGameDate}</span>
                </div>
                {turn.resolvedAt ? (
                  <span className="text-xs text-green-400">Completed</span>
                ) : (
                  <span className="text-xs text-amber-400">In Progress</span>
                )}
              </div>
              {/* Orders */}
              {turn.orders.length > 0 && (
                <div className="space-y-1 mb-2">
                  {turn.orders.map((o, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded border ${ORDER_COLORS[o.orderType]}`}>
                        {ORDER_LABELS[o.orderType]}
                      </span>
                      <span className="text-gray-300">
                        {o.facilityName}: {o.details || 'No details'}
                      </span>
                      {(o.goldCost ?? 0) > 0 && <span className="text-red-400">-{o.goldCost} GP</span>}
                      {(o.goldGained ?? 0) > 0 && <span className="text-green-400">+{o.goldGained} GP</span>}
                    </div>
                  ))}
                </div>
              )}
              {/* Event */}
              {turn.eventOutcome && (
                <div className="bg-gray-800/50 rounded p-2 mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                      d100: {turn.eventRoll}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{turn.eventType?.replace(/-/g, ' ')}</span>
                  </div>
                  <p className="text-xs text-gray-300">{turn.eventOutcome}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EventsTab({ bastion }: { bastion: Bastion }): JSX.Element {
  const [filterType, setFilterType] = useState<string>('all')
  const events = bastion.turns.filter((t) => t.eventOutcome).sort((a, b) => b.turnNumber - a.turnNumber)

  const filteredEvents = filterType === 'all' ? events : events.filter((t) => t.eventType === filterType)

  const eventTypes = Array.from(new Set(events.map((t) => t.eventType).filter(Boolean))) as string[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Events Log ({filteredEvents.length})</h2>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
        >
          <option value="all">All Events</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/-/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      {filteredEvents.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-900 rounded-lg p-4">No events recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.map((turn) => (
            <div key={turn.turnNumber} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 font-mono">
                  Turn {turn.turnNumber}
                </span>
                <span className="text-xs text-gray-500">{turn.inGameDate}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                  d100: {turn.eventRoll}
                </span>
                <span className="text-xs text-gray-400 capitalize">{turn.eventType?.replace(/-/g, ' ')}</span>
              </div>
              <p className="text-sm text-gray-200">{turn.eventOutcome}</p>
              {turn.eventDetails && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(turn.eventDetails as Record<string, unknown>).goldGained != null && (
                    <span className="text-xs text-green-400">
                      +{String((turn.eventDetails as Record<string, unknown>).goldGained)} GP
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
