import Fuse from 'fuse.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../../../i18n'
import { loadCategoryItems } from '../../../../services/library-service'
import { useLibraryStore } from '../../../../stores/use-library-store'
import { useLibraryUiStore } from '../../../../stores/use-library-ui-store'
import type { LibraryCategory, LibraryItem } from '../../../../types/library'
import { LibraryDetailModal, LibraryItemList } from '../../../library'
import Modal from '../../../ui/Modal'

interface CompendiumModalProps {
  onClose: () => void
  // PHASE-13 13H — deep-link target: open on this category's tab (when it has one) and
  // auto-select the first exact name match so chat-link clicks land on the entry.
  initialCategory?: LibraryCategory
  initialQuery?: string
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

export default function CompendiumModal({ onClose, initialCategory, initialQuery }: CompendiumModalProps): JSX.Element {
  const { t } = useT()
  const [activeTab, setActiveTab] = useState<LibraryCategory>(
    initialCategory && TABS.some((tab) => tab.id === initialCategory) ? initialCategory : 'actions'
  )
  const [search, setSearch] = useState(initialQuery ?? '')
  const [tabData, setTabData] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const cache = useRef(new Map<LibraryCategory, LibraryItem[]>())
  // PHASE-13 13H — one-shot auto-select for a deep-linked entry (first non-empty load only).
  const didSeedRef = useRef(false)

  // Allow drag-through: make modal backdrop transparent during drags so drop targets underneath are reachable
  useEffect(() => {
    const onStart = (): void => setIsDragging(true)
    const onEnd = (): void => setIsDragging(false)
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [])

  const { homebrewEntries, loadHomebrew } = useLibraryStore()
  const { favorites, toggleFavorite } = useLibraryUiStore()

  useEffect(() => {
    loadHomebrew()
  }, [loadHomebrew])

  // Load data for active tab
  useEffect(() => {
    // PHASE-13 13H — once the deep-linked tab's data lands, auto-select the exact name
    // match. Skip empty loads so the homebrew-populated re-run still gets a chance.
    const seedSelection = (items: LibraryItem[]): void => {
      if (!initialQuery || didSeedRef.current || items.length === 0) return
      didSeedRef.current = true
      const match = items.find((it) => it.name?.toLowerCase() === initialQuery.toLowerCase())
      if (match) setSelectedItem(match)
    }
    const loadTabData = async (): Promise<void> => {
      if (cache.current.has(activeTab)) {
        const items = cache.current.get(activeTab)!
        setTabData(items)
        seedSelection(items)
        return
      }

      setLoading(true)
      try {
        const items = await loadCategoryItems(activeTab, homebrewEntries)
        cache.current.set(activeTab, items)
        setTabData(items)
        seedSelection(items)
      } catch {
        setTabData([])
      } finally {
        setLoading(false)
      }
    }
    loadTabData()
  }, [activeTab, homebrewEntries, initialQuery])

  // Fuse.js fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(tabData, {
        keys: ['name', 'summary', 'data.tags'],
        threshold: 0.3,
        distance: 100,
        ignoreLocation: true
      }),
    [tabData]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return tabData
    return fuse.search(search).map((r) => r.item)
  }, [fuse, search, tabData])

  const handleTabChange = useCallback((tab: LibraryCategory) => {
    setActiveTab(tab)
    setSearch('')
  }, [])

  return (
    <>
      <Modal
        open={true}
        onClose={onClose}
        title={t('game.compendiumModal.title')}
        className={`max-w-5xl w-full h-[80vh] !overflow-hidden ${isDragging ? 'pointer-events-none' : ''}`}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Search */}
          <input
            aria-label={t('game.compendiumModal.searchPlaceholder')}
            type="text"
            placeholder={t('game.compendiumModal.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full mb-3 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-amber-500/50 shrink-0"
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
                    : 'bg-surface-2/40 border border-border/30 text-muted hover:bg-gray-700/40 hover:text-gray-300'
                }`}
              >
                {t(`game.compendiumModal.tabs.${tab.id}`)}
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
              categoryLabel={
                TABS.some((tab) => tab.id === activeTab) ? t(`game.compendiumModal.tabs.${activeTab}`) : activeTab
              }
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
