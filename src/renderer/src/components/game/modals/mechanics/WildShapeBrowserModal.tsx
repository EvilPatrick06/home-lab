import { useEffect, useState } from 'react'
import { getWildShapeEligibleBeasts } from '../../../../services/character/companion-service'
import { load5eMonsters } from '../../../../services/data-provider'
import type { MonsterStatBlock } from '../../../../types/monster'
import { MonsterStatBlockView } from '../../dm'

interface WildShapeBrowserModalProps {
  onClose: () => void
  druidLevel: number
  wildShapeUses: { current: number; max: number }
  activeFormId?: string | null
  onTransform: (monster: MonsterStatBlock) => void
  onRevert: () => void
  onUseAdjust: (delta: number) => void
}

export default function WildShapeBrowserModal({
  onClose,
  druidLevel,
  wildShapeUses,
  activeFormId,
  onTransform,
  onRevert,
  onUseAdjust
}: WildShapeBrowserModalProps): JSX.Element {
  const [_allMonsters, setAllMonsters] = useState<MonsterStatBlock[]>([])
  const [eligible, setEligible] = useState<MonsterStatBlock[]>([])
  const [selected, setSelected] = useState<MonsterStatBlock | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    load5eMonsters().then((all) => {
      setAllMonsters(all)
      setEligible(getWildShapeEligibleBeasts(druidLevel, all))
    })
  }, [druidLevel])

  const maxCR = druidLevel >= 8 ? 1 : druidLevel >= 4 ? 0.5 : 0.25
  const filtered = query ? eligible.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())) : eligible

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[750px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-green-400">Wild Shape</h2>
            <span className="text-xs text-gray-500">
              Level {druidLevel} Druid — Beasts up to CR {maxCR}
              {druidLevel >= 8 ? ' (flying OK)' : druidLevel >= 4 ? ' (swim OK)' : ''}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl cursor-pointer">
            x
          </button>
        </div>

        {/* Uses bar */}
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300">Wild Shape Uses:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onUseAdjust(-1)}
                disabled={wildShapeUses.current <= 0}
                className="w-6 h-6 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 text-xs cursor-pointer disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="text-sm font-semibold text-green-400 w-10 text-center">
                {wildShapeUses.current}/{wildShapeUses.max}
              </span>
              <button
                onClick={() => onUseAdjust(1)}
                disabled={wildShapeUses.current >= wildShapeUses.max}
                className="w-6 h-6 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 text-xs cursor-pointer disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>
          {activeFormId && (
            <button
              onClick={onRevert}
              className="px-3 py-1 text-xs bg-red-700/80 hover:bg-red-600 text-white rounded cursor-pointer"
            >
              Revert to Normal Form
            </button>
          )}
        </div>

        <div className="px-4 py-2 border-b border-gray-700/50">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter beasts..."
            className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-green-500"
          />
        </div>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Beast list */}
          <div className="w-56 overflow-y-auto border-r border-gray-700/50">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`w-full px-3 py-2 text-left cursor-pointer transition-colors ${
                  selected?.id === m.id
                    ? 'bg-green-600/20 border-l-2 border-green-500'
                    : 'hover:bg-gray-800 border-l-2 border-transparent'
                }`}
              >
                <div className="text-sm text-gray-200 font-medium">{m.name}</div>
                <div className="text-[10px] text-gray-500">
                  {m.size} Beast — CR {m.cr} — HP {m.hp}
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-gray-500 text-xs text-center p-4">No eligible beasts</div>}
          </div>

          {/* Stat block + transform */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div className="space-y-3">
                <MonsterStatBlockView monster={selected} />
                <button
                  onClick={() => {
                    onTransform(selected)
                    onClose()
                  }}
                  disabled={wildShapeUses.current <= 0 || !!activeFormId}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {activeFormId
                    ? 'Already Transformed'
                    : wildShapeUses.current <= 0
                      ? 'No Uses Left'
                      : `Transform into ${selected.name}`}
                </button>
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center mt-20">Select a beast to view its stat block</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
