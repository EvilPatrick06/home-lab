import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import type { LibraryCategory, LibraryGroup } from '../../types/library'
import { LIBRARY_GROUPS } from '../../types/library'

interface LibrarySidebarProps {
  selectedCategory: LibraryCategory | null
  onSelectCategory: (category: LibraryCategory | null) => void
  homebrewCounts: Record<string, number>
  totalCounts?: Record<string, number>
  onSelectFavorites?: () => void
  isFavoritesSelected?: boolean
  onSelectCoreBooks?: () => void
  isCoreBooksSelected?: boolean
}

const ALWAYS_MY_CONTENT = new Set<LibraryCategory>(['characters', 'campaigns', 'bastions'])

export default function LibrarySidebar({
  selectedCategory,
  onSelectCategory,
  homebrewCounts,
  totalCounts,
  onSelectFavorites,
  isFavoritesSelected,
  onSelectCoreBooks,
  isCoreBooksSelected
}: LibrarySidebarProps): JSX.Element {
  const { t } = useT()
  const [expandedGroups, setExpandedGroups] = useState<Set<LibraryGroup>>(new Set())

  // Compute dynamic My Content categories based on homebrew counts
  const dynamicMyContentCats = useMemo(() => {
    const extra: { id: LibraryCategory; label: string; icon: string }[] = []
    for (const [catId, count] of Object.entries(homebrewCounts)) {
      if (count > 0 && !ALWAYS_MY_CONTENT.has(catId as LibraryCategory)) {
        // Find definition in any group
        for (const group of LIBRARY_GROUPS) {
          const def = group.categories.find((c) => c.id === catId)
          if (def) {
            extra.push({ id: def.id, label: def.label, icon: def.icon })
            break
          }
        }
      }
    }
    return extra
  }, [homebrewCounts])

  const toggleGroup = (groupId: LibraryGroup): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <aside className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-800 overflow-y-auto max-h-[35vh] md:max-h-none md:h-full">
      <button
        onClick={() => onSelectCategory(null)}
        className={`w-full text-left px-4 py-3 text-sm font-semibold transition-colors cursor-pointer
          ${selectedCategory === null && !isFavoritesSelected ? 'text-accent bg-surface-2/60' : 'text-gray-300 hover:text-accent hover:bg-surface-2/40'}`}
      >
        {t('library.librarySidebar.allCategories')}
      </button>

      {onSelectFavorites && (
        <button
          onClick={onSelectFavorites}
          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer
            ${isFavoritesSelected ? 'text-accent bg-amber-900/20 border-r-2 border-amber-500' : 'text-muted hover:text-gray-200 hover:bg-surface-2/40'}`}
        >
          <span className="text-base leading-none">★</span>
          <span className="flex-1 truncate">{t('library.librarySidebar.favorites')}</span>
        </button>
      )}

      {onSelectCoreBooks && (
        <button
          onClick={onSelectCoreBooks}
          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer
            ${isCoreBooksSelected ? 'text-accent bg-amber-900/20 border-r-2 border-amber-500' : 'text-muted hover:text-gray-200 hover:bg-surface-2/40'}`}
        >
          <span className="text-base leading-none">📚</span>
          <span className="flex-1 truncate">{t('library.librarySidebar.coreBooks')}</span>
        </button>
      )}

      {LIBRARY_GROUPS.map((group) => {
        // Skip empty groups (like core-books)
        const groupCats = group.categories
        const dynamicCats = group.id === 'my-content' ? dynamicMyContentCats : []
        if (groupCats.length === 0 && dynamicCats.length === 0) return null

        return (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            >
              <span>{group.label}</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${expandedGroups.has(group.id) ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {expandedGroups.has(group.id) && (
              <div className="pb-1">
                {groupCats.map((cat) => {
                  const hbCount = homebrewCounts[cat.id] ?? 0
                  const total = totalCounts?.[cat.id] ?? 0
                  return (
                    <button
                      key={cat.id}
                      onClick={() => onSelectCategory(cat.id)}
                      className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 transition-colors cursor-pointer
                        ${
                          selectedCategory === cat.id
                            ? 'text-accent bg-amber-900/20 border-r-2 border-amber-500'
                            : 'text-muted hover:text-gray-200 hover:bg-surface-2/40'
                        }`}
                    >
                      <span className="text-base leading-none">{cat.icon}</span>
                      <span className="flex-1 truncate">{cat.label}</span>
                      {(total > 0 || hbCount > 0) && (
                        <span className="text-xs bg-gray-700/60 text-muted px-1.5 rounded-full">
                          {total > 0 ? total : ''}
                          {hbCount > 0
                            ? `${total > 0 ? ' · ' : ''}${t('library.librarySidebar.customCount', { count: hbCount })}`
                            : ''}
                        </span>
                      )}
                    </button>
                  )
                })}
                {/* Dynamic homebrew categories in My Content */}
                {group.id === 'my-content' &&
                  dynamicCats.map((cat) => (
                    <button
                      key={`dynamic-${cat.id}`}
                      onClick={() => onSelectCategory(cat.id)}
                      className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 transition-colors cursor-pointer
                        ${
                          selectedCategory === cat.id
                            ? 'text-accent bg-amber-900/20 border-r-2 border-amber-500'
                            : 'text-muted hover:text-gray-200 hover:bg-surface-2/40'
                        }`}
                    >
                      <span className="text-base leading-none">{cat.icon}</span>
                      <span className="flex-1 truncate">{cat.label}</span>
                      <span className="text-xs bg-purple-600/30 text-purple-300 px-1.5 rounded-full">
                        {t('library.librarySidebar.customCount', { count: homebrewCounts[cat.id] })}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </aside>
  )
}
