import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCategoryItems } from '../../../../services/library-service'
import { useLibraryStore } from '../../../../stores/use-library-store'
import type { LibraryCategory, LibraryItem } from '../../../../types/library'
import { LibraryDetailModal, LibraryItemList } from '../../../library'
import Modal from '../../../ui/Modal'

interface CompendiumModalProps {
  onClose: () => void
}

const TABS: { id: LibraryCategory; label: string }[] = [
  { id: 'actions', label: 'Actions' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'cover', label: 'Cover' },
  { id: 'damage-types', label: 'Damage Types' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'dcs', label: 'DCs' },
  { id: 'spells', label: 'Spells' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'gear', label: 'Gear' },
  { id: 'armor', label: 'Armor' },
  { id: 'feats', label: 'Feats' },
  { id: 'magic-items', label: 'Magic Items' },
  { id: 'diseases', label: 'Diseases' },
  { id: 'poisons', label: 'Poisons' },
  { id: 'languages', label: 'Languages' },
  { id: 'weapon-mastery', label: 'Weapon Mastery' },
  { id: 'invocations', label: 'Invocations' },
  { id: 'metamagic', label: 'Metamagic' }
]

export default function CompendiumModal({ onClose }: CompendiumModalProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<LibraryCategory>('actions')
  const [search, setSearch] = useState('')
  const [tabData, setTabData] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const cache = useRef(new Map<LibraryCategory, LibraryItem[]>())

  const { homebrewEntries, favorites, toggleFavorite, loadHomebrew } = useLibraryStore()

  useEffect(() => {
    loadHomebrew()
  }, [loadHomebrew])

  // Load data for active tab
  useEffect(() => {
    const loadTabData = async (): Promise<void> => {
      if (cache.current.has(activeTab)) {
        setTabData(cache.current.get(activeTab)!)
        return
      }

      setLoading(true)
      try {
        const items = await loadCategoryItems(activeTab, homebrewEntries)
        cache.current.set(activeTab, items)
        setTabData(items)
      } catch {
        setTabData([])
      } finally {
        setLoading(false)
      }
    }
    loadTabData()
  }, [activeTab, homebrewEntries])

  // Filtered items
  const filtered = useMemo(() => {
    if (!search.trim()) return tabData
    const q = search.toLowerCase()
    return tabData.filter((item) => item.name.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q))
  }, [tabData, search])

  const handleTabChange = useCallback((tab: LibraryCategory) => {
    setActiveTab(tab)
    setSearch('')
  }, [])

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title="Rules Compendium"
        className="max-w-5xl w-full h-[80vh] !overflow-hidden"
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full mb-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-amber-500/50 shrink-0"
          />

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 mb-3 shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === tab.id
                    ? 'bg-amber-600/25 border border-amber-500/50 text-amber-300'
                    : 'bg-gray-800/40 border border-gray-700/30 text-gray-400 hover:bg-gray-700/40 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden border border-gray-800 rounded-lg flex flex-col">
            <LibraryItemList
              items={filtered}
              loading={loading}
              onSelectItem={setSelectedItem}
              onCreateNew={() => {}}
              categoryLabel={TABS.find((t) => t.id === activeTab)?.label ?? activeTab}
              category={activeTab}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        </div>
      </Modal>

      {selectedItem && (
        <LibraryDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} onCloneAsHomebrew={() => {}} />
      )}
    </>
  )
}
