import { useLibraryStore } from '../../stores/use-library-store'
import type { SortField, Tab } from './library-constants'
import { CR_OPTIONS, SIZE_OPTIONS, sizeOrder, TABS, TYPE_OPTIONS } from './library-constants'

export { CR_OPTIONS, SIZE_OPTIONS, sizeOrder, TABS, TYPE_OPTIONS }
export type { SortField, Tab }

export default function LibraryFilters(): JSX.Element {
  const { searchQuery, setSearchQuery } = useLibraryStore()

  return (
    <div className="mb-4">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search library..."
        className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      />
    </div>
  )
}
