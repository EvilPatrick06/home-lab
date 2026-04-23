import { useEffect, useState } from 'react'
import { load5eSubclasses } from '../../../services/data-provider'
import { useLevelUpStore } from '../../../stores/use-level-up-store'
import type { BuildSlot } from '../../../types/character-common'

export function SubclassSelector5e({ slot, classId }: { slot: BuildSlot; classId: string }): JSX.Element {
  const setSlotSelection = useLevelUpStore((s) => s.setSlotSelection)
  const [subclasses, setSubclasses] = useState<Array<{ id: string; name: string; description: string }>>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    load5eSubclasses()
      .then((all) => {
        setSubclasses(
          all
            .filter((sc) => sc.className?.toLowerCase() === classId)
            .map((sc) => ({
              id: sc.id ?? sc.name.toLowerCase().replace(/\s+/g, '-'),
              name: sc.name,
              description: sc.description
            }))
        )
      })
      .catch(() => setSubclasses([]))
  }, [classId])

  const isIncomplete = !slot.selectedId

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-1 flex items-center gap-2">
        {slot.label}:
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      {slot.selectedId ? (
        <div className="bg-indigo-900/20 border border-indigo-700/50 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-indigo-300 font-semibold text-sm">{slot.selectedName}</span>
            <button
              onClick={() => setSlotSelection(slot.id, null, null)}
              className="text-xs text-gray-500 hover:text-red-400 cursor-pointer"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            {expanded ? 'Hide Subclasses' : 'Select a Subclass'}
          </button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {subclasses.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => {
                    setSlotSelection(slot.id, sc.id, sc.name)
                    setExpanded(false)
                  }}
                  className="w-full text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-indigo-600 rounded p-2 cursor-pointer transition-colors"
                >
                  <div className="text-sm text-indigo-300 font-medium">{sc.name}</div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sc.description}</p>
                </button>
              ))}
              {subclasses.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No subclasses found for this class.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
