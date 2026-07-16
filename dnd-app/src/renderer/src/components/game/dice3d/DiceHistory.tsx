import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { computeDiceStats } from '../../../services/dice-stats'
import { useGameStore } from '../../../stores/use-game-store'
import type { DiceRollRecord } from '../../../types/game-state'

interface DiceHistoryProps {
  onClose?: () => void
}

type View = 'log' | 'stats'

function DiceStatsView({ history }: { history: DiceRollRecord[] }): JSX.Element {
  const { t } = useT()
  const stats = useMemo(() => computeDiceStats(history), [history])

  if (stats.totalD20 === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-xs text-gray-500">{t('game.diceHistory.noD20')}</p>
      </div>
    )
  }

  const maxBar = Math.max(1, ...stats.perPlayer.flatMap((p) => Object.values(p.d20Histogram)))

  return (
    <div className="space-y-3">
      {/* Session luck callouts */}
      {stats.luckiest && (
        <div className="text-[11px] text-accent">
          {t('game.diceHistory.luckyHot', { name: stats.luckiest.rollerName })} ({stats.luckiest.d20Average.toFixed(1)})
        </div>
      )}
      {stats.unluckiest && stats.unluckiest.rollerName !== stats.luckiest?.rollerName && (
        <div className="text-[11px] text-red-400">
          {t('game.diceHistory.luckyCold', { name: stats.unluckiest.rollerName })} (
          {stats.unluckiest.d20Average.toFixed(1)})
        </div>
      )}

      {stats.perPlayer
        .filter((p) => p.d20Count > 0)
        .map((p) => (
          <div key={p.rollerName} className="rounded-lg border border-border/40 bg-surface-2/30 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-200 truncate">{p.rollerName}</span>
              <span className="text-[10px] text-gray-500">
                {p.d20Count} {t('game.diceHistory.d20Rolls')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px] mb-1.5">
              <span className="text-gray-400">
                {t('game.diceHistory.average')}:{' '}
                <span className="font-mono text-gray-200">{p.d20Average.toFixed(1)}</span>
              </span>
              <span className="text-accent">
                {t('game.diceHistory.nat20')}: <span className="font-mono">{p.nat20}</span>
              </span>
              <span className="text-red-400">
                {t('game.diceHistory.nat1')}: <span className="font-mono">{p.nat1}</span>
              </span>
            </div>
            {/* d20 face histogram (1..20) */}
            <div
              className="flex items-end gap-[1px] h-12"
              role="img"
              aria-label={t('game.diceHistory.histogramTitle')}
              title={t('game.diceHistory.histogramTitle')}
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((face) => {
                const count = p.d20Histogram[face] ?? 0
                const heightPct = (count / maxBar) * 100
                return (
                  <div
                    key={face}
                    className="flex-1 flex flex-col justify-end items-center h-full"
                    title={`${face}: ${count}`}
                  >
                    <div
                      className={`w-full rounded-sm ${
                        face === 20 ? 'bg-amber-500' : face === 1 ? 'bg-red-500' : 'bg-gray-500'
                      }`}
                      style={{ height: `${heightPct}%`, minHeight: count > 0 ? '2px' : '0' }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
        ))}
    </div>
  )
}

export default function DiceHistory({ onClose }: DiceHistoryProps): JSX.Element {
  const { t } = useT()
  const diceHistory: DiceRollRecord[] = useGameStore((s) => s.diceHistory)
  const [filterPlayer, setFilterPlayer] = useState<string | null>(null)
  const [view, setView] = useState<View>('log')
  const scrollRef = useRef<HTMLDivElement>(null)

  const playerNames = useMemo(() => {
    const names = new Set<string>()
    for (const roll of diceHistory) names.add(roll.rollerName)
    return Array.from(names).sort()
  }, [diceHistory])

  const filtered = useMemo(() => {
    if (!filterPlayer) return diceHistory
    return diceHistory.filter((r) => r.rollerName === filterPlayer)
  }, [diceHistory, filterPlayer])

  // Auto-scroll to follow NEW entries (log view only). The old deps were
  // `[view]`, so this fired on Log/Stats tab switches but NEVER when a roll
  // arrived — the log stayed put while new rolls appended below the fold.
  // Depend on `filtered.length` so a new roll re-runs it, and only snap when the
  // user is already at/near the bottom, so someone who scrolled up to read older
  // rolls isn't yanked back down (standard chat-log behavior).
  // (ISSUES-LOG-DNDAPP 2026-07-15)
  const prevLenRef = useRef(filtered.length)
  useEffect(() => {
    const el = scrollRef.current
    const grew = filtered.length > prevLenRef.current
    prevLenRef.current = filtered.length
    if (view !== 'log' || !el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    // Snap when (re)entering the log view, or when a new entry arrives while the
    // user is already near the bottom.
    if (!grew || nearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [view, filtered.length])

  const formatTime = useCallback((ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }, [])

  return (
    <div className="w-72 h-full bg-surface/95 border-s border-border flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-sm font-bold text-fg">{t('game.diceHistory.title')}</h2>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">
            {t('game.diceHistory.rollCount', { count: diceHistory.length })}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-surface-2 cursor-pointer transition-colors"
              title={t('common.actions.close')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Log / Stats tabs */}
      <div className="shrink-0 flex gap-1 px-3 py-1.5 border-b border-border">
        <button
          onClick={() => setView('log')}
          className={`px-2.5 py-0.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
            view === 'log' ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:text-gray-200 hover:bg-gray-700'
          }`}
        >
          {t('game.diceHistory.tabLog')}
        </button>
        <button
          onClick={() => setView('stats')}
          className={`px-2.5 py-0.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
            view === 'stats'
              ? 'bg-amber-600 text-white'
              : 'bg-surface-2 text-muted hover:text-gray-200 hover:bg-gray-700'
          }`}
        >
          {t('game.diceHistory.tabStats')}
        </button>
      </div>

      {/* Player filter (log view) */}
      {view === 'log' && playerNames.length > 1 && (
        <div className="shrink-0 flex gap-1 px-3 py-2 border-b border-border flex-wrap">
          <button
            onClick={() => setFilterPlayer(null)}
            className={`px-2 py-0.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
              !filterPlayer
                ? 'bg-amber-600 text-white'
                : 'bg-surface-2 text-muted hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {t('game.diceHistory.all')}
          </button>
          {playerNames.map((name) => (
            <button
              key={name}
              onClick={() => setFilterPlayer(filterPlayer === name ? null : name)}
              className={`px-2 py-0.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
                filterPlayer === name
                  ? 'bg-amber-600 text-white'
                  : 'bg-surface-2 text-muted hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-0 space-y-1">
        {view === 'stats' ? (
          <DiceStatsView history={diceHistory} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-xs text-gray-500">{t('game.diceHistory.noRolls')}</p>
            <p className="text-xs text-gray-600 mt-1">{t('game.diceHistory.rollsWillAppear')}</p>
          </div>
        ) : (
          filtered.map((roll) => (
            <div
              key={roll.id}
              className={`rounded-lg px-2.5 py-1.5 border ${
                roll.isCritical
                  ? 'bg-amber-900/20 border-amber-600/40'
                  : roll.isFumble
                    ? 'bg-red-900/20 border-red-600/40'
                    : 'bg-surface-2/40 border-border/30'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-gray-200 truncate">{roll.rollerName}</span>
                <span className="text-[9px] text-gray-600 shrink-0">{formatTime(roll.timestamp)}</span>
              </div>

              {roll.reason && <div className="text-xs text-muted mt-0.5 truncate">{roll.reason}</div>}

              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-gray-500 font-mono">{roll.formula}</span>
                <span className="text-xs text-gray-600">=</span>
                <div className="flex gap-0.5">
                  {roll.rolls.map((die, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded bg-gray-700/60 text-gray-200"
                    >
                      {die}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-gray-600">=</span>
                <span
                  className={`text-xs font-bold ${
                    roll.isCritical ? 'text-accent' : roll.isFumble ? 'text-red-400' : 'text-fg'
                  }`}
                >
                  {roll.total}
                </span>
                {roll.isCritical && (
                  <span className="text-[9px] text-accent font-bold">{t('game.diceHistory.crit')}</span>
                )}
                {roll.isFumble && (
                  <span className="text-[9px] text-red-400 font-bold">{t('game.diceHistory.fumble')}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
