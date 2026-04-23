import type { LibraryCategory } from '../../types/library'
import { LIBRARY_GROUPS } from '../../types/library'

interface LibraryCategoryGridProps {
  onSelectCategory: (category: LibraryCategory) => void
  itemCounts: Record<string, number>
  totalCounts?: Record<string, number>
}

export default function LibraryCategoryGrid({
  onSelectCategory,
  itemCounts,
  totalCounts
}: LibraryCategoryGridProps): JSX.Element {
  return (
    <div className="space-y-8">
      {LIBRARY_GROUPS.filter((g) => g.categories.length > 0).map((group) => (
        <section key={group.id}>
          <h2 className="text-lg font-bold text-gray-200 mb-3 border-b border-gray-800 pb-2">{group.label}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {group.categories.map((cat) => {
              const total = totalCounts?.[cat.id] ?? 0
              const hbCount = itemCounts[cat.id] ?? 0
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-800
                    bg-gray-900/50 hover:bg-gray-800/80 hover:border-amber-600/50
                    transition-all duration-200 cursor-pointer text-center"
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="text-sm font-medium text-gray-200 group-hover:text-amber-400 transition-colors">
                    {cat.label}
                  </span>
                  {(total > 0 || hbCount > 0) && (
                    <span className="text-xs text-gray-500">
                      {total > 0 ? `${total} items` : ''}
                      {hbCount > 0 ? `${total > 0 ? ' · ' : ''}${hbCount} custom` : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
