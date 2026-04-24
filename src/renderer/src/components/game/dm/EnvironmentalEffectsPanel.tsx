import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { load5eEnvironmentalEffects } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import type { ActiveEnvironmentalEffect, EnvironmentalEffect } from '../../../types/dm-toolbox'

const CATEGORY_LABELS: Record<EnvironmentalEffect['category'], string> = {
  weather: 'Weather',
  terrain: 'Terrain',
  magical: 'Magical',
  planar: 'Planar'
}

const CATEGORY_ORDER: EnvironmentalEffect['category'][] = ['weather', 'terrain', 'magical', 'planar']

interface EnvironmentalEffectsPanelProps {
  onBroadcastResult?: (message: string) => void
}

export default function EnvironmentalEffectsPanel({ onBroadcastResult }: EnvironmentalEffectsPanelProps): JSX.Element {
  const { activeEnvironmentalEffects, addEnvironmentalEffect, removeEnvironmentalEffect } = useGameStore(
    useShallow((s) => ({
      activeEnvironmentalEffects: s.activeEnvironmentalEffects,
      addEnvironmentalEffect: s.addEnvironmentalEffect,
      removeEnvironmentalEffect: s.removeEnvironmentalEffect
    }))
  )

  const [effects, setEffects] = useState<EnvironmentalEffect[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    load5eEnvironmentalEffects()
      .then(setEffects)
      .catch(() => setEffects([]))
      .finally(() => setLoading(false))
  }, [])

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return effects
    const q = search.toLowerCase().trim()
    return effects.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.effect.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    )
  }, [effects, search])

  const grouped = useMemo(() => {
    const map = new Map<EnvironmentalEffect['category'], EnvironmentalEffect[]>()
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, [])
    }
    for (const e of filteredBySearch) {
      map.get(e.category)!.push(e)
    }
    return map
  }, [filteredBySearch])

  const handleAdd = useCallback(
    (effect: EnvironmentalEffect) => {
      const active: ActiveEnvironmentalEffect = {
        id: crypto.randomUUID(),
        effectId: effect.id,
        name: effect.name,
        appliedAt: Date.now()
      }
      addEnvironmentalEffect(active)
      onBroadcastResult?.(`Environmental Effect: ${effect.name} applied to the scene.`)
    },
    [addEnvironmentalEffect, onBroadcastResult]
  )

  const handleRemove = useCallback(
    (id: string) => {
      removeEnvironmentalEffect(id)
    },
    [removeEnvironmentalEffect]
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-500">Loading environmental effects...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Active effects */}
      {activeEnvironmentalEffects.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 uppercase">Active Effects</span>
          <div className="mt-1 space-y-1">
            {activeEnvironmentalEffects.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 bg-emerald-900/30 border border-emerald-700 rounded px-3 py-2"
              >
                <span className="text-white text-sm font-medium truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  title="Remove effect"
                  className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-900/30 transition-colors cursor-pointer"
                >
                  &#215;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div>
        <span className="text-xs text-gray-500 uppercase">Add Effect</span>
        <input
          type="text"
          placeholder="Search effects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </div>

      {/* Effect list grouped by category */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat) ?? []
          if (items.length === 0) return null

          return (
            <div key={cat}>
              <span className="text-xs text-gray-500 uppercase">{CATEGORY_LABELS[cat]}</span>
              <div className="mt-1 space-y-1">
                {items.map((effect) => {
                  const isExpanded = expandedId === effect.id
                  return (
                    <div key={effect.id} className="bg-gray-800/50 border border-gray-700 rounded px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm font-medium">{effect.name}</span>
                          {effect.saveDC != null && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-300">
                              DC {effect.saveDC} {effect.saveAbility ?? ''}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAdd(effect)}
                          title={`Add ${effect.name}`}
                          className="shrink-0 w-6 h-6 rounded flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : effect.id)}
                        className="mt-1 text-[10px] text-gray-500 hover:text-gray-400 cursor-pointer"
                      >
                        {isExpanded ? 'Hide' : 'Show'} description
                      </button>
                      {isExpanded && (
                        <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                          {effect.description}
                          {effect.mechanicalEffect && (
                            <>
                              <br />
                              <span className="text-amber-500/80">{effect.mechanicalEffect}</span>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {filteredBySearch.length === 0 && <div className="text-xs text-gray-500">No effects match your search.</div>}
    </div>
  )
}
