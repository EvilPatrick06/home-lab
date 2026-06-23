import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '../../../i18n'
import { load5eTraps } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import type { PlacedTrap, Trap } from '../../../types/dm-toolbox'

interface TrapPlacerPanelProps {
  onBroadcastResult: (message: string) => void
  onSelectTrapForPlacement?: (trapId: string, trapName: string) => void
}

export default function TrapPlacerPanel({
  onBroadcastResult,
  onSelectTrapForPlacement
}: TrapPlacerPanelProps): JSX.Element {
  const { t } = useT()
  const { placedTraps, removeTrap, triggerTrap, revealTrap, updatePlacedTrap } = useGameStore(
    useShallow((s) => ({
      placedTraps: s.placedTraps,
      removeTrap: s.removeTrap,
      triggerTrap: s.triggerTrap,
      revealTrap: s.revealTrap,
      updatePlacedTrap: s.updatePlacedTrap
    }))
  )

  const [traps, setTraps] = useState<Trap[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedTrapId, setExpandedTrapId] = useState<string | null>(null)
  const [expandedPlacedId, setExpandedPlacedId] = useState<string | null>(null)

  useEffect(() => {
    load5eTraps()
      .then(setTraps)
      .catch(() => setTraps([]))
      .finally(() => setLoading(false))
  }, [])

  const filteredTraps = useMemo(() => {
    if (!search.trim()) return traps
    const q = search.toLowerCase().trim()
    return traps.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.trigger.toLowerCase().includes(q) || t.level.toLowerCase().includes(q)
    )
  }, [traps, search])

  const trapById = useMemo(() => {
    const map = new Map<string, Trap>()
    for (const t of traps) map.set(t.id, t)
    return map
  }, [traps])

  const handleSelectForPlacement = useCallback(
    (trap: Trap) => {
      onSelectTrapForPlacement?.(trap.id, trap.name)
    },
    [onSelectTrapForPlacement]
  )

  const handleToggleArmed = useCallback(
    (placed: PlacedTrap) => {
      updatePlacedTrap(placed.id, { armed: !placed.armed })
    },
    [updatePlacedTrap]
  )

  const handleReveal = useCallback(
    (placed: PlacedTrap) => {
      revealTrap(placed.id)
    },
    [revealTrap]
  )

  const handleTrigger = useCallback(
    (placed: PlacedTrap) => {
      const trapData = trapById.get(placed.trapId)
      triggerTrap(placed.id)
      const damageSuffix = trapData?.damage ? t('game.trapPlacerPanel.damageSuffix', { damage: trapData.damage }) : ''
      const msg = trapData
        ? t('game.trapPlacerPanel.triggeredWithEffect', {
            name: placed.name,
            effect: trapData.effect,
            damage: damageSuffix
          })
        : t('game.trapPlacerPanel.triggered', { name: placed.name })
      onBroadcastResult(msg)
    },
    [triggerTrap, trapById, onBroadcastResult, t]
  )

  const handleRemove = useCallback(
    (id: string) => {
      removeTrap(id)
    },
    [removeTrap]
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-500">{t('game.trapPlacerPanel.loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Placed traps */}
      {placedTraps.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 uppercase">{t('game.trapPlacerPanel.placedTraps')}</span>
          <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
            {placedTraps.map((placed) => {
              const trapData = trapById.get(placed.trapId)
              const isExpanded = expandedPlacedId === placed.id
              return (
                <div key={placed.id} className="bg-surface-2/50 border border-border rounded px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`shrink-0 w-2 h-2 rounded-full ${placed.armed ? 'bg-green-500' : 'bg-gray-500'}`}
                        title={
                          placed.armed ? t('game.trapPlacerPanel.armed') : t('game.trapPlacerPanel.triggeredStatus')
                        }
                      />
                      <span className="text-white text-sm font-medium truncate">{placed.name}</span>
                      <span className="shrink-0 text-xs text-gray-500">
                        ({placed.gridX},{placed.gridY})
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {placed.armed && (
                        <button
                          type="button"
                          onClick={() => handleTrigger(placed)}
                          className="px-2 py-0.5 text-xs font-medium rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer"
                        >
                          {t('game.trapPlacerPanel.trigger')}
                        </button>
                      )}
                      {!placed.revealed && (
                        <button
                          type="button"
                          onClick={() => handleReveal(placed)}
                          className="px-2 py-0.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
                        >
                          {t('game.trapPlacerPanel.reveal')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleArmed(placed)}
                        title={placed.armed ? t('game.trapPlacerPanel.disarm') : t('game.trapPlacerPanel.reArm')}
                        className="px-2 py-0.5 text-xs text-muted hover:text-white transition-colors cursor-pointer"
                      >
                        {placed.armed ? t('game.trapPlacerPanel.disarm') : t('game.trapPlacerPanel.reArm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(placed.id)}
                        title={t('game.trapPlacerPanel.removeTrap')}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
                      >
                        &#215;
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedPlacedId(isExpanded ? null : placed.id)}
                    className="mt-1 text-xs text-gray-500 hover:text-muted cursor-pointer"
                  >
                    {isExpanded ? t('game.trapPlacerPanel.hideDetails') : t('game.trapPlacerPanel.showDetails')}
                  </button>
                  {isExpanded && trapData && (
                    <div className="mt-2 space-y-1 text-xs text-muted">
                      <p>
                        <span className="text-gray-500">{t('game.trapPlacerPanel.detection')}</span>{' '}
                        {trapData.detection}
                      </p>
                      <p>
                        <span className="text-gray-500">{t('game.trapPlacerPanel.disarmLabel')}</span> {trapData.disarm}
                      </p>
                      {trapData.damage && (
                        <p>
                          <span className="text-gray-500">{t('game.trapPlacerPanel.damage')}</span> {trapData.damage}
                        </p>
                      )}
                      {trapData.saveDC != null && (
                        <p>
                          <span className="text-gray-500">{t('game.trapPlacerPanel.save')}</span>{' '}
                          {t('game.trapPlacerPanel.dc', { dc: trapData.saveDC, ability: trapData.saveAbility ?? '' })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available traps */}
      <div>
        <span className="text-xs text-gray-500 uppercase">{t('game.trapPlacerPanel.availableTraps')}</span>
        <input
          aria-label={t('game.trapPlacerPanel.searchPlaceholder')}
          type="text"
          name="trap-search"
          placeholder={t('game.trapPlacerPanel.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 text-sm bg-surface-2 border border-border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
        <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
          {filteredTraps.map((trap) => {
            const isExpanded = expandedTrapId === trap.id
            return (
              <div key={trap.id} className="bg-surface-2/50 border border-border rounded px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                        trap.level === 'nuisance' ? 'bg-blue-600/80 text-blue-100' : 'bg-red-600/80 text-red-100'
                      }`}
                    >
                      {trap.level}
                    </span>
                    <span className="text-white text-sm font-medium truncate">{trap.name}</span>
                    <span className="shrink-0 text-xs text-gray-500 truncate max-w-[80px]">{trap.trigger}</span>
                  </div>
                  {onSelectTrapForPlacement && (
                    <button
                      type="button"
                      onClick={() => handleSelectForPlacement(trap)}
                      title={t('game.trapPlacerPanel.placeTitle', { name: trap.name })}
                      className="shrink-0 px-2 py-0.5 text-xs rounded bg-amber-600/80 hover:bg-accent-strong text-white transition-colors cursor-pointer"
                    >
                      {t('game.trapPlacerPanel.place')}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedTrapId(isExpanded ? null : trap.id)}
                  className="mt-1 text-xs text-gray-500 hover:text-muted cursor-pointer"
                >
                  {isExpanded ? t('game.trapPlacerPanel.hideDetails') : t('game.trapPlacerPanel.showDetails')}
                </button>
                {isExpanded && (
                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <p>
                      <span className="text-gray-500">{t('game.trapPlacerPanel.detection')}</span> {trap.detection}
                    </p>
                    <p>
                      <span className="text-gray-500">{t('game.trapPlacerPanel.disarmLabel')}</span> {trap.disarm}
                    </p>
                    {trap.damage && (
                      <p>
                        <span className="text-gray-500">{t('game.trapPlacerPanel.damage')}</span> {trap.damage}
                      </p>
                    )}
                    {trap.saveDC != null && (
                      <p>
                        <span className="text-gray-500">{t('game.trapPlacerPanel.save')}</span>{' '}
                        {t('game.trapPlacerPanel.dc', { dc: trap.saveDC, ability: trap.saveAbility ?? '' })}
                      </p>
                    )}
                    <p className="leading-relaxed">{trap.description}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {filteredTraps.length === 0 && <div className="text-xs text-gray-500">{t('game.trapPlacerPanel.noMatch')}</div>}
    </div>
  )
}
