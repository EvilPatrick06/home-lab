import Fuse from 'fuse.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  CoreBooksGrid,
  HomebrewCreateModal,
  LibraryCategoryGrid,
  LibraryDetailModal,
  LibraryFilterBar,
  LibraryItemList,
  LibrarySidebar,
  PdfViewer
} from '../components/library'
import { BackButton, Button, EmptyState, Skeleton } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { exportEntities, importEntities, reIdItems } from '../services/io/entity-io'
import { loadCategoryItems, searchAllCategories, summarizeItem } from '../services/library-service'
import {
  filterItems,
  getFilterConfigs,
  getSortOptions,
  type SortDirection,
  type SortField,
  sortItems
} from '../services/library-sort-filter'
import { useLibraryStore } from '../stores/use-library-store'
import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../types/library'
import { getAllCategories, getCategoryDef, LIBRARY_GROUPS } from '../types/library'
import type { MonsterStatBlock } from '../types/monster'
import { logger } from '../utils/logger'

const BESTIARY_CATEGORIES = new Set<LibraryCategory>(['monsters', 'creatures', 'npcs'])
const NAV_CATEGORIES = new Set<LibraryCategory>(['characters', 'campaigns', 'bastions'])
const NAV_ROUTES: Record<string, string> = {
  characters: '/create-character',
  campaigns: '/create-campaign',
  bastions: '/create-bastion'
}

export default function LibraryPage(): JSX.Element {
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') || '/'
  const navigate = useNavigate()

  const {
    selectedCategory,
    setCategory,
    searchQuery: search,
    setSearchQuery: setSearch,
    setItems,
    loading,
    setLoading,
    homebrewEntries,
    loadHomebrew,
    saveHomebrewEntry,
    deleteHomebrewEntry,
    recentlyViewed,
    addToRecentlyViewed,
    favorites,
    toggleFavorite
  } = useLibraryStore()

  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [homebrewModal, setHomebrewModal] = useState<{
    category: LibraryCategory
    existingItem?: LibraryItem
  } | null>(null)

  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [showFavorites, setShowFavorites] = useState(false)
  const [showCoreBooks, setShowCoreBooks] = useState(false)
  const [pdfViewer, setPdfViewer] = useState<{ bookId: string; filePath: string; title: string } | null>(null)

  // Sort/filter state
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({})

  // Global search results
  const [globalSearchResults, setGlobalSearchResults] = useState<LibraryItem[]>([])
  const [globalSearching, setGlobalSearching] = useState(false)

  // Apply sort + filter to global search results
  const filteredGlobalItems = useMemo(() => {
    let items = globalSearchResults

    // Apply active filters
    items = filterItems(items, activeFilters)

    // Apply sort
    items = sortItems(items, sortField, sortDirection)

    return items
  }, [globalSearchResults, sortField, sortDirection, activeFilters])

  // Debounce search input (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Load homebrew on mount
  useEffect(() => {
    loadHomebrew()
      .then(() => setInitialLoading(false))
      .catch((err) => {
        logger.error('Failed to load homebrew', err)
        addToast('Failed to load library homebrew', 'error')
        setInitialLoading(false)
      })
  }, [loadHomebrew])

  // Compute homebrew counts per category
  const homebrewCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of homebrewEntries) {
      counts[entry.type] = (counts[entry.type] ?? 0) + 1
    }
    return counts
  }, [homebrewEntries])

  // Total available categories and groups for reference
  const allCategories = useMemo(() => getAllCategories(), [])
  const totalCategoryCount = allCategories.length
  const totalGroupCount = LIBRARY_GROUPS.length

  // Item counts per category (homebrew only for now — static counts are too expensive to load all at once)
  const itemCounts = homebrewCounts

  // Reset sort/filter when category changes
  useEffect(() => {
    setSortField('name')
    setSortDirection('asc')
    setActiveFilters({})
  }, [])

  // Load official items when category changes (not on homebrew changes)
  const [officialItems, setOfficialItems] = useState<LibraryItem[]>([])
  useEffect(() => {
    if (!selectedCategory) {
      setOfficialItems([])
      setItems([])
      return
    }
    let cancelled = false
    setLoading(true)
    loadCategoryItems(selectedCategory, [])
      .then((result) => {
        if (!cancelled) setOfficialItems(result)
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to load category items', selectedCategory, err)
          addToast(`Failed to load ${selectedCategory}`, 'error')
          setOfficialItems([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCategory, setItems, setLoading])

  // Global search when no category is selected
  useEffect(() => {
    if (selectedCategory || !debouncedSearch.trim()) {
      setGlobalSearchResults([])
      return
    }
    let cancelled = false
    setGlobalSearching(true)
    searchAllCategories(debouncedSearch, homebrewEntries)
      .then((results) => {
        if (!cancelled) setGlobalSearchResults(results)
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to search library', err)
          addToast('Search failed', 'error')
          setGlobalSearchResults([])
        }
      })
      .finally(() => {
        if (!cancelled) setGlobalSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCategory, debouncedSearch, homebrewEntries])

  // Merge official items with homebrew items for current category
  const mergedItems = useMemo(() => {
    if (!selectedCategory) return officialItems
    const hbItems = homebrewEntries
      .filter((e) => e.type === selectedCategory)
      .map((e) => ({
        id: e.id,
        name: e.name,
        category: selectedCategory,
        source: 'homebrew' as const,
        summary: summarizeItem(e.data as Record<string, unknown>, selectedCategory),
        data: { ...e.data, _homebrewId: e.id, _basedOn: e.basedOn, _createdAt: e.createdAt }
      }))
    return [...officialItems.filter((i) => i.source !== 'homebrew'), ...hbItems]
  }, [officialItems, homebrewEntries, selectedCategory])

  // Sync merged items into store (for consumers that read from store directly)
  useEffect(() => {
    setItems(mergedItems)
  }, [mergedItems, setItems])

  // Apply sort + filter + search
  const filteredItems = useMemo(() => {
    let items = mergedItems

    // Apply active filters
    items = filterItems(items, activeFilters)

    // Apply sort
    items = sortItems(items, sortField, sortDirection)

    // Apply search filter
    if (debouncedSearch.trim()) {
      const fuse = new Fuse(items, {
        keys: ['name', 'summary'],
        threshold: 0.3,
        distance: 100,
        ignoreLocation: true
      })
      items = fuse.search(debouncedSearch).map((result) => result.item)
    }

    return items
  }, [mergedItems, debouncedSearch, sortField, sortDirection, activeFilters])

  // Favorites items — load from all categories when favorites view is active
  const [favoriteItems, setFavoriteItems] = useState<LibraryItem[]>([])
  useEffect(() => {
    if (!showFavorites || favorites.size === 0) {
      setFavoriteItems([])
      return
    }
    let cancelled = false
    const allCats: LibraryCategory[] = [
      'monsters',
      'creatures',
      'npcs',
      'companions',
      'spells',
      'invocations',
      'metamagic',
      'classes',
      'subclasses',
      'species',
      'backgrounds',
      'feats',
      'class-features',
      'magic-items',
      'weapons',
      'armor',
      'gear',
      'tools',
      'vehicles',
      'mounts',
      'siege-equipment',
      'trinkets',
      'light-sources',
      'sentient-items',
      'conditions',
      'actions',
      'cover',
      'damage-types',
      'dcs',
      'weapon-mastery',
      'languages',
      'skills',
      'encounter-presets',
      'treasure-tables',
      'random-tables',
      'traps',
      'hazards',
      'poisons',
      'diseases',
      'supernatural-gifts',
      'maps',
      'portraits',
      'sounds',
      'deities',
      'planes',
      'adventure-seeds',
      'calendars',
      'npc-names',
      'light-sources',
      'sentient-items'
    ] as LibraryCategory[]

    Promise.all(allCats.map((cat) => loadCategoryItems(cat, []).catch(() => [] as LibraryItem[])))
      .then((results) => {
        if (cancelled) return
        const allItems = results.flat()
        const matched = allItems.filter((item) => favorites.has(item.id))
        const recentMatched = recentlyViewed.filter(
          (item) => favorites.has(item.id) && !matched.some((m) => m.id === item.id)
        )
        setFavoriteItems([...matched, ...recentMatched])
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to load favorites', err)
          addToast('Failed to load favorites', 'error')
          setFavoriteItems([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [showFavorites, favorites, recentlyViewed])

  // Sort/filter config for current category
  const sortOptions = useMemo(() => getSortOptions(selectedCategory ?? 'global'), [selectedCategory])
  const filterConfigs = useMemo(
    () => getFilterConfigs(selectedCategory ?? 'global', selectedCategory ? mergedItems : globalSearchResults),
    [selectedCategory, mergedItems, globalSearchResults]
  )

  const handleSelectCategory = useCallback(
    (cat: LibraryCategory | null) => {
      setCategory(cat)
      setSelectedItem(null)
      setSearch('')
      setShowFavorites(false)
      setShowCoreBooks(false)
    },
    [setCategory, setSearch]
  )

  const handleSelectFavorites = useCallback(() => {
    setCategory(null)
    setShowFavorites(true)
    setShowCoreBooks(false)
    setSelectedItem(null)
    setSearch('')
  }, [setCategory, setSearch])

  const handleSelectCoreBooks = useCallback(() => {
    setCategory(null)
    setShowFavorites(false)
    setShowCoreBooks(true)
    setSelectedItem(null)
    setSearch('')
  }, [setCategory, setSearch])

  const handleOpenBook = useCallback((book: { id: string; title: string; path: string }) => {
    setPdfViewer({ bookId: book.id, filePath: book.path, title: book.title })
  }, [])

  const handleSelectItem = useCallback(
    (item: LibraryItem) => {
      setSelectedItem(item)
      addToRecentlyViewed(item)
    },
    [addToRecentlyViewed]
  )

  const handleCloneAsHomebrew = useCallback((item: LibraryItem) => {
    setSelectedItem(null)
    setHomebrewModal({ category: item.category, existingItem: item })
  }, [])

  const handleDeleteItem = useCallback(
    async (item: LibraryItem) => {
      if (item.source !== 'homebrew') return
      const hbId = item.data._homebrewId as string | undefined
      if (!hbId) return
      const ok = await deleteHomebrewEntry(item.category, hbId)
      if (ok) {
        addToast(`Deleted "${item.name}"`, 'success')
        setSelectedItem(null)
      }
    },
    [deleteHomebrewEntry]
  )

  const handleSaveHomebrew = useCallback(
    async (entry: HomebrewEntry) => {
      const ok = await saveHomebrewEntry(entry)
      if (ok) {
        addToast(`Saved "${entry.name}"`, 'success')
        setHomebrewModal(null)
      } else {
        addToast('Failed to save', 'error')
      }
    },
    [saveHomebrewEntry]
  )

  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      const result = await importEntities<MonsterStatBlock>('monster')
      if (!result) {
        setImporting(false)
        return
      }
      const importedItems = reIdItems(result.items)
      for (const item of importedItems) {
        await window.api.saveCustomCreature(item as unknown as Record<string, unknown>)
      }
      addToast(`Imported ${importedItems.length} creature(s)`, 'success')
      handleSelectCategory(selectedCategory ?? 'monsters')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      addToast(msg, 'error')
      logger.error(err)
    } finally {
      setImporting(false)
    }
  }, [handleSelectCategory, selectedCategory])

  const handleExportAll = useCallback(async () => {
    if (filteredItems.length === 0) return
    setExporting(true)
    try {
      const ok = await exportEntities(
        'monster',
        filteredItems.map((i) => i.data)
      )
      if (ok) addToast(`Exported ${filteredItems.length} item(s)`, 'success')
    } catch (err) {
      addToast('Export failed', 'error')
      logger.error(err)
    } finally {
      setExporting(false)
    }
  }, [filteredItems])

  const handleCreateButton = useCallback(() => {
    if (selectedCategory && NAV_CATEGORIES.has(selectedCategory)) {
      navigate(NAV_ROUTES[selectedCategory])
    } else if (selectedCategory) {
      setHomebrewModal({ category: selectedCategory })
    }
  }, [selectedCategory, navigate])

  const catDef = selectedCategory ? getCategoryDef(selectedCategory) : null

  // Items to display in the list depending on mode
  const _displayItems = showFavorites ? favoriteItems : selectedCategory ? filteredItems : globalSearchResults

  if (initialLoading) {
    return (
      <div className="p-8 h-screen">
        <BackButton to={returnTo} />
        <div className="py-8">
          <Skeleton lines={4} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 h-screen flex flex-col">
      <BackButton to={returnTo} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1
          className="text-3xl font-bold text-amber-400"
          title={`${totalGroupCount} groups, ${totalCategoryCount} categories available`}
        >
          Library
        </h1>
        <div className="flex gap-2">
          {selectedCategory && BESTIARY_CATEGORIES.has(selectedCategory) && (
            <Button variant="secondary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          )}
          {selectedCategory && BESTIARY_CATEGORIES.has(selectedCategory) && filteredItems.length > 0 && (
            <Button variant="secondary" onClick={handleExportAll} disabled={exporting}>
              Export All ({filteredItems.length})
            </Button>
          )}
          {selectedCategory && (
            <Button variant="primary" onClick={handleCreateButton}>
              {NAV_CATEGORIES.has(selectedCategory) ? 'Create' : 'Create Custom'}
            </Button>
          )}
        </div>
      </div>

      {/* Search bar — always visible */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={selectedCategory ? `Search ${catDef?.label ?? selectedCategory}...` : 'Search all categories...'}
          className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Content */}
      <div className="flex gap-0 flex-1 min-h-0 border border-gray-800 rounded-lg overflow-hidden">
        {/* Sidebar */}
        <LibrarySidebar
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          homebrewCounts={homebrewCounts}
          onSelectFavorites={handleSelectFavorites}
          isFavoritesSelected={showFavorites}
          onSelectCoreBooks={handleSelectCoreBooks}
          isCoreBooksSelected={showCoreBooks}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Filter bar when category selected or global search active */}
          {(selectedCategory || (debouncedSearch.trim() && !showFavorites && !showCoreBooks)) && (
            <LibraryFilterBar
              sortOptions={sortOptions}
              filterConfigs={filterConfigs}
              currentSort={{ field: sortField, direction: sortDirection }}
              currentFilters={activeFilters}
              onSortChange={(field, dir) => {
                setSortField(field)
                setSortDirection(dir)
              }}
              onFilterChange={setActiveFilters}
            />
          )}

          {showFavorites ? (
            // Favorites mode
            favoriteItems.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState
                  title="No favorites yet"
                  description="Click the ☆ star on any item to add it to your favorites."
                />
              </div>
            ) : (
              <LibraryItemList
                items={favoriteItems}
                loading={false}
                onSelectItem={handleSelectItem}
                onCreateNew={() => {}}
                categoryLabel="Favorites"
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
              />
            )
          ) : showCoreBooks ? (
            // Core Books mode
            <div className="flex-1 overflow-y-auto">
              <CoreBooksGrid onOpenBook={handleOpenBook} />
            </div>
          ) : !selectedCategory ? (
            // No category selected
            <div className="flex-1 overflow-y-auto p-6">
              {/* Global search results */}
              {debouncedSearch.trim() ? (
                globalSearching ? (
                  <div className="space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded" />
                    ))}
                  </div>
                ) : filteredGlobalItems.length === 0 ? (
                  <EmptyState
                    title="No results found"
                    description={`No items match "${debouncedSearch}" across all categories with current filters.`}
                  />
                ) : (
                  <div>
                    <h2 className="text-lg font-bold text-gray-200 mb-3">
                      Search Results ({filteredGlobalItems.length})
                    </h2>
                    <LibraryItemList
                      items={filteredGlobalItems}
                      loading={false}
                      onSelectItem={handleSelectItem}
                      onCreateNew={() => {}}
                      categoryLabel="Search Results"
                      favorites={favorites}
                      onToggleFavorite={toggleFavorite}
                    />
                  </div>
                )
              ) : (
                <>
                  {/* Recently Viewed */}
                  {recentlyViewed.length > 0 && (
                    <section className="mb-8">
                      <h2 className="text-lg font-bold text-gray-200 mb-3 border-b border-gray-800 pb-2">
                        Recently Viewed
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {recentlyViewed.slice(0, 10).map((item) => {
                          const def = getCategoryDef(item.category)
                          return (
                            <button
                              key={`recent-${item.id}`}
                              onClick={() => handleSelectItem(item)}
                              className="group flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-800
                                bg-gray-900/50 hover:bg-gray-800/80 hover:border-amber-600/50
                                transition-all duration-200 cursor-pointer text-center"
                            >
                              <span className="text-lg">{def?.icon ?? '📄'}</span>
                              <span className="text-xs font-medium text-gray-200 group-hover:text-amber-400 transition-colors truncate w-full">
                                {item.name}
                              </span>
                              <span className="text-[10px] text-gray-500">{def?.label ?? item.category}</span>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {/* Category grid */}
                  <LibraryCategoryGrid onSelectCategory={handleSelectCategory} itemCounts={itemCounts} />
                </>
              )}
            </div>
          ) : loading && filteredItems.length === 0 ? (
            <div className="flex-1 p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded" />
              ))}
            </div>
          ) : !loading && filteredItems.length === 0 && debouncedSearch.trim() ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <EmptyState
                title="No results found"
                description={`No items match "${debouncedSearch}" in this category.`}
              />
            </div>
          ) : (
            <LibraryItemList
              items={filteredItems}
              loading={loading}
              onSelectItem={handleSelectItem}
              onCreateNew={handleCreateButton}
              categoryLabel={catDef?.label ?? selectedCategory}
              category={selectedCategory}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <LibraryDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onCloneAsHomebrew={handleCloneAsHomebrew}
          onDelete={selectedItem.source === 'homebrew' ? handleDeleteItem : undefined}
        />
      )}

      {/* Homebrew Create/Edit Modal */}
      {homebrewModal && (
        <HomebrewCreateModal
          category={homebrewModal.category}
          existingItem={homebrewModal.existingItem}
          onSave={handleSaveHomebrew}
          onClose={() => setHomebrewModal(null)}
        />
      )}

      {/* PDF Viewer overlay */}
      {pdfViewer && (
        <PdfViewer
          bookId={pdfViewer.bookId}
          filePath={pdfViewer.filePath}
          title={pdfViewer.title}
          onClose={() => setPdfViewer(null)}
          onOpenBook={async (targetBookId, page) => {
            try {
              const configs = await window.api.books.loadConfig()
              const book = configs.find((b: { id: string }) => b.id === targetBookId)
              if (book) {
                setPdfViewer({ bookId: book.id, filePath: book.path, title: book.title })
                // Small delay so the new viewer mounts before we try to navigate
                setTimeout(() => {
                  const event = new CustomEvent('pdf-go-to-page', { detail: { page } })
                  window.dispatchEvent(event)
                }, 1000)
              }
            } catch {
              addToast('Could not open referenced book', 'error')
            }
          }}
        />
      )}
    </div>
  )
}
