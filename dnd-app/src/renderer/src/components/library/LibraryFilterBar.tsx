import type { FilterConfig, SortDirection, SortField, SortOption } from '../../services/library-sort-filter'

interface LibraryFilterBarProps {
  sortOptions: SortOption[]
  filterConfigs: FilterConfig[]
  currentSort: { field: SortField; direction: SortDirection }
  currentFilters: Record<string, string[]>
  onSortChange: (field: SortField, direction: SortDirection) => void
  onFilterChange: (filters: Record<string, string[]>) => void
}

export default function LibraryFilterBar({
  sortOptions,
  filterConfigs,
  currentSort,
  currentFilters,
  onSortChange,
  onFilterChange
}: LibraryFilterBarProps): JSX.Element {
  const activeFilterEntries = Object.entries(currentFilters).filter(([, vals]) => vals.length > 0)
  const unusedFilters = filterConfigs.filter((fc) => !(currentFilters[fc.field]?.length > 0))

  const handleRemoveFilter = (field: string): void => {
    const next = { ...currentFilters }
    delete next[field]
    onFilterChange(next)
  }

  const handleAddFilter = (field: string, value: string): void => {
    const current = currentFilters[field] ?? []
    if (current.includes(value)) return
    onFilterChange({ ...currentFilters, [field]: [...current, value] })
  }

  const handleRemoveFilterValue = (field: string, value: string): void => {
    const current = currentFilters[field] ?? []
    const next = current.filter((v) => v !== value)
    if (next.length === 0) {
      handleRemoveFilter(field)
    } else {
      onFilterChange({ ...currentFilters, [field]: next })
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/80 border-b border-gray-800 flex-wrap">
      {/* Sort controls */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Sort:</span>
        <select
          value={currentSort.field}
          onChange={(e) => onSortChange(e.target.value as SortField, currentSort.direction)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
        >
          {sortOptions.map((opt) => (
            <option key={opt.field} value={opt.field}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => onSortChange(currentSort.field, currentSort.direction === 'asc' ? 'desc' : 'asc')}
          className="px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-amber-400 transition-colors cursor-pointer"
          title={currentSort.direction === 'asc' ? 'Ascending' : 'Descending'}
        >
          {currentSort.direction === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Separator */}
      {(activeFilterEntries.length > 0 || unusedFilters.length > 0) && <div className="w-px h-5 bg-gray-700" />}

      {/* Active filter chips */}
      {activeFilterEntries.map(([field, values]) => {
        const config = filterConfigs.find((fc) => fc.field === field)
        return values.map((val) => (
          <span
            key={`${field}-${val}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 text-xs"
          >
            <span className="text-gray-500">{config?.label ?? field}:</span>
            {val}
            <button
              onClick={() => handleRemoveFilterValue(field, val)}
              className="ml-0.5 hover:text-amber-200 cursor-pointer"
            >
              ×
            </button>
          </span>
        ))
      })}

      {/* Add filter dropdown */}
      {unusedFilters.length > 0 && (
        <div className="relative group">
          <button className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
            + Filter
          </button>
          <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 hidden group-hover:block min-w-[180px]">
            {unusedFilters.map((fc) => (
              <div key={fc.field} className="relative group/filter">
                <div className="px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-default flex items-center justify-between">
                  {fc.label}
                  <span className="text-gray-500">›</span>
                </div>
                <div className="absolute left-full top-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl hidden group-hover/filter:block min-w-[140px] max-h-60 overflow-y-auto">
                  {fc.values.map((val) => (
                    <button
                      key={val}
                      onClick={() => handleAddFilter(fc.field, val)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-amber-400 cursor-pointer"
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
