import { useEffect, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { load5eFeats } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { FeatData } from '../../../types/data'
import { meetsFeatPrerequisites } from '../../../utils/feat-prerequisites'
import { FeatPickerRow } from './FeatureCard5e'

interface FeatPickerProps {
  character: Character5e
  takenFeatIds: Set<string>
  onSelect: (feat: FeatData) => void
  onClose: () => void
}

export function FeatPicker({ character, takenFeatIds, onSelect, onClose }: FeatPickerProps): JSX.Element {
  const [allFeats, setAllFeats] = useState<FeatData[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (allFeats.length === 0) {
      load5eFeats()
        .then(setAllFeats)
        .catch((err) => {
          logger.error('Failed to load feats', err)
          addToast('Failed to load feats', 'error')
          setAllFeats([])
        })
    }
  }, [allFeats.length])

  const filteredFeats = allFeats.filter((f) => {
    if (takenFeatIds.has(f.id) && !f.repeatable) return false
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
    if (!meetsFeatPrerequisites(character, f.prerequisites)) return false
    return true
  })

  return (
    <div className="mt-2 border border-gray-700 rounded-lg p-3 bg-gray-900/80">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-semibold">Select a Feat</span>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
          Cancel
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {['all', 'Origin', 'General', 'Fighting Style', 'Epic Boon'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
              categoryFilter === cat
                ? 'bg-amber-600 text-white'
                : 'border border-gray-600 text-gray-400 hover:text-gray-200'
            }`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search feats..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 mb-2"
      />

      {/* Feat list */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filteredFeats.map((feat) => (
          <FeatPickerRow key={feat.id} feat={feat} character={character} onSelect={onSelect} />
        ))}
        {filteredFeats.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-2">No matching feats found.</p>
        )}
      </div>
    </div>
  )
}

interface BonusFeatPickerProps {
  character: Character5e
  bonusFeats: Array<{ id: string; name: string; description: string }>
  onSelect: (feat: FeatData) => void
  onClose: () => void
}

export function BonusFeatPicker({ character, bonusFeats, onSelect, onClose }: BonusFeatPickerProps): JSX.Element {
  const [allFeats, setAllFeats] = useState<FeatData[]>([])
  const [bonusFeatCategory, setBonusFeatCategory] = useState<string>('all')
  const [bonusFeatSearch, setBonusFeatSearch] = useState('')

  useEffect(() => {
    if (allFeats.length === 0) {
      load5eFeats()
        .then(setAllFeats)
        .catch((err) => {
          logger.error('Failed to load feats', err)
          addToast('Failed to load feats', 'error')
          setAllFeats([])
        })
    }
  }, [allFeats.length])

  const takenBonusIds = new Set(bonusFeats.map((bf) => bf.id))

  return (
    <div className="mt-2 border border-amber-700/50 rounded-lg p-3 bg-gray-900/80">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-amber-300 font-semibold">Select Bonus Feat</span>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
          Cancel
        </button>
      </div>

      <div className="flex gap-1 mb-2 flex-wrap">
        {['all', 'General', 'Epic Boon'].map((cat) => (
          <button
            key={cat}
            onClick={() => setBonusFeatCategory(cat)}
            className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
              bonusFeatCategory === cat
                ? 'bg-amber-600 text-white'
                : 'border border-gray-600 text-gray-400 hover:text-gray-200'
            }`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Search feats..."
        value={bonusFeatSearch}
        onChange={(e) => setBonusFeatSearch(e.target.value)}
        className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 mb-2"
      />

      <div className="max-h-48 overflow-y-auto space-y-1">
        {allFeats
          .filter((f) => {
            if (takenBonusIds.has(f.id) && !f.repeatable) return false
            if (bonusFeatCategory !== 'all' && f.category !== bonusFeatCategory) return false
            if (bonusFeatSearch && !f.name.toLowerCase().includes(bonusFeatSearch.toLowerCase())) return false
            if (!meetsFeatPrerequisites(character, f.prerequisites)) return false
            return true
          })
          .map((feat) => (
            <FeatPickerRow key={feat.id} feat={feat} character={character} onSelect={onSelect} />
          ))}
      </div>
    </div>
  )
}
