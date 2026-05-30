import { useT } from '../../i18n'
import { useLibraryUiStore } from '../../stores/use-library-ui-store'
import type { SortField, Tab } from './library-constants'
import { CR_OPTIONS, SIZE_OPTIONS, sizeOrder, TABS, TYPE_OPTIONS } from './library-constants'

export type { SortField, Tab }
export { CR_OPTIONS, SIZE_OPTIONS, sizeOrder, TABS, TYPE_OPTIONS }

export default function LibraryFilters(): JSX.Element {
  const { t } = useT()
  const { searchQuery, setSearchQuery } = useLibraryUiStore()

  return (
    <div className="mb-4">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('pages.libraryFilters.searchPlaceholder')}
        className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      />
    </div>
  )
}
