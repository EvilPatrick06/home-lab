import { useT } from '../../i18n'
import { useLibraryUiStore } from '../../stores/use-library-ui-store'
import type { SortField, Tab } from './library-constants'

export type { SortField, Tab }

export default function LibraryFilters(): JSX.Element {
  const { t } = useT()
  const { searchQuery, setSearchQuery } = useLibraryUiStore()

  return (
    <div className="mb-4">
      <input
        type="text"
        name="library-search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('pages.libraryFilters.searchPlaceholder')}
        className="w-full max-w-md bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
      />
    </div>
  )
}
