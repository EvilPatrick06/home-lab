import { useCallback, useState } from 'react'

/**
 * Phase 18b — DmAlert gains an optional `actions` array. Each action is
 * a label + callback (synchronous; callers can `void`-wrap async). The
 * alert tray renders the buttons inline below the message. Use this for
 * actionable notifications — e.g. mid-game player rejoin "Kick back to
 * lobby?" — that would otherwise force the DM to chase down the player
 * in the sidebar and click Kick there.
 */
export interface DmAlertAction {
  label: string
  onClick: () => void
  style?: 'primary' | 'danger' | 'subtle'
}

interface DmAlert {
  id: string
  level: 'error' | 'warning' | 'info'
  message: string
  timestamp: number
  actions?: DmAlertAction[]
}

const MAX_ALERTS = 50

let alerts: DmAlert[] = []
let listeners: Array<() => void> = []

function notify(): void {
  for (const fn of listeners) fn()
}

export function pushDmAlert(level: DmAlert['level'], message: string, actions?: DmAlertAction[]): void {
  alerts = [{ id: crypto.randomUUID(), level, message, timestamp: Date.now(), actions }, ...alerts].slice(0, MAX_ALERTS)
  notify()
}

/** Remove a single alert by id (e.g. after the user clicks one of its actions). */
export function dismissDmAlert(id: string): void {
  alerts = alerts.filter((a) => a.id !== id)
  notify()
}

export function clearDmAlerts(): void {
  alerts = []
  notify()
}

function useAlerts(): DmAlert[] {
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick((t) => t + 1), [])

  // Subscribe on mount, unsubscribe on unmount
  useState(() => {
    listeners.push(rerender)
    return () => {
      listeners = listeners.filter((fn) => fn !== rerender)
    }
  })

  return alerts
}

export default function DmAlertTray(): JSX.Element {
  const items = useAlerts()
  const [expanded, setExpanded] = useState(false)

  const unreadCount = items.length
  const levelColor = (level: DmAlert['level']): string => {
    if (level === 'error') return 'text-red-400'
    if (level === 'warning') return 'text-yellow-400'
    return 'text-blue-400'
  }

  const levelIcon = (level: DmAlert['level']): string => {
    if (level === 'error') return '\u2716' // ✖
    if (level === 'warning') return '\u26A0' // ⚠
    return '\u2139' // ℹ
  }

  return (
    <div className="relative">
      {/* Badge button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
          unreadCount > 0
            ? 'bg-red-900/80 border-red-700 text-red-200 hover:bg-red-800/80'
            : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:bg-gray-700/80'
        }`}
      >
        Alerts
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Expanded tray */}
      {expanded && (
        <div className="absolute top-9 right-0 w-80 max-h-96 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <span className="text-xs font-semibold text-gray-300">DM Alerts</span>
            {items.length > 0 && (
              <button onClick={clearDmAlerts} className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">
                Clear all
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-80 divide-y divide-gray-800">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-500">No alerts</div>
            ) : (
              items.map((a) => (
                <div key={a.id} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className={`text-xs mt-0.5 ${levelColor(a.level)}`}>{levelIcon(a.level)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 break-words">{a.message}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{new Date(a.timestamp).toLocaleTimeString()}</p>
                      {a.actions && a.actions.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5">
                          {a.actions.map((act) => (
                            <button
                              key={act.label}
                              type="button"
                              onClick={() => {
                                try {
                                  act.onClick()
                                } finally {
                                  dismissDmAlert(a.id)
                                }
                              }}
                              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
                                act.style === 'danger'
                                  ? 'bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/50'
                                  : act.style === 'subtle'
                                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
                                    : 'bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 border border-amber-700/50'
                              }`}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
