import { useCallback, useEffect, useState } from 'react'
import { loadAllStatBlocks, searchMonsters } from '../../../services/data-provider'
import type { MonsterStatBlock } from '../../../types/monster'

interface CreatureSearchModalProps {
  open: boolean
  onClose: () => void
  title: string
  onSelect: (monster: MonsterStatBlock) => void
}

export default function CreatureSearchModal({
  open,
  onClose,
  title,
  onSelect
}: CreatureSearchModalProps): JSX.Element | null {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MonsterStatBlock[]>([])
  const [allCreatures, setAllCreatures] = useState<MonsterStatBlock[]>([])
  const [creaturesLoaded, setCreaturesLoaded] = useState(false)

  const loadCreatures = useCallback(async (): Promise<void> => {
    if (creaturesLoaded) return
    try {
      const all = await loadAllStatBlocks()
      setAllCreatures(all)
      setCreaturesLoaded(true)
    } catch {
      // silently fail
    }
  }, [creaturesLoaded])

  useEffect(() => {
    if (open && !creaturesLoaded) {
      void loadCreatures()
    }
  }, [open, creaturesLoaded, loadCreatures])

  useEffect(() => {
    if (!open) return
    const results = searchMonsters(allCreatures, searchQuery)
    setSearchResults(results.slice(0, 50))
  }, [searchQuery, allCreatures, open])

  // Reset search query when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery('')
      setSearchResults([])
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-4 w-96 max-h-[80vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer">
            &times;
          </button>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search creatures by name, type, or tag..."
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500 mb-2"
          autoFocus
        />
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-80">
          {!creaturesLoaded && <p className="text-xs text-gray-500 text-center py-4">Loading creatures...</p>}
          {creaturesLoaded && searchResults.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">
              {searchQuery ? 'No creatures found' : 'Type to search'}
            </p>
          )}
          {searchResults.map((monster) => (
            <button
              key={monster.id}
              onClick={() => onSelect(monster)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-left transition-colors cursor-pointer border border-gray-700/30"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-200 truncate">{monster.name}</div>
                <div className="text-[10px] text-gray-500">
                  {monster.size} {monster.type} | CR {monster.cr}
                </div>
              </div>
              <span className="text-[10px] text-amber-400 shrink-0 ml-2">Select</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
