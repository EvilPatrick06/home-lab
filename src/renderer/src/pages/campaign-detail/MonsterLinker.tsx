import { useState } from 'react'
import { MonsterStatBlockView } from '../../components/game/dm'
import { loadAllStatBlocks, searchMonsters } from '../../services/data-provider'
import type { MonsterStatBlock } from '../../types/monster'

interface MonsterLinkerProps {
  onSelect: (monster: MonsterStatBlock) => void
  selectedId?: string
  showPreview?: boolean
}

export default function MonsterLinker({ onSelect, selectedId, showPreview }: MonsterLinkerProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MonsterStatBlock[]>([])
  const [allMonsters, setAllMonsters] = useState<MonsterStatBlock[]>([])
  const [preview, setPreview] = useState<MonsterStatBlock | null>(null)

  const handleSearch = (q: string): void => {
    setQuery(q)
    if (q.length < 2) {
      setResults([])
      return
    }
    if (allMonsters.length === 0) {
      loadAllStatBlocks().then((all) => {
        setAllMonsters(all)
        setResults(searchMonsters(all, q).slice(0, 10))
      })
    } else {
      setResults(searchMonsters(allMonsters, q).slice(0, 10))
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
        placeholder="Search monsters..."
      />
      {results.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded max-h-40 overflow-y-auto">
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(m)
                setPreview(m)
                setQuery(m.name)
                setResults([])
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 cursor-pointer flex items-center justify-between ${
                selectedId === m.id ? 'text-amber-400' : 'text-gray-300'
              }`}
            >
              <span>{m.name}</span>
              <span className="text-gray-500">
                {m.type} &middot; CR {m.cr}
              </span>
            </button>
          ))}
        </div>
      )}
      {showPreview && preview && results.length === 0 && (
        <div className="mt-2">
          <MonsterStatBlockView monster={preview} compact />
        </div>
      )}
    </div>
  )
}
