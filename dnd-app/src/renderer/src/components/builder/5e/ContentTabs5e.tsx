import { useT } from '../../../i18n'
import type { TranslationKeys } from '../../../i18n/types'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { ContentTab } from '../../../types/builder'

const TABS: Array<{ id: ContentTab; labelKey: TranslationKeys }> = [
  { id: 'details', labelKey: 'builder.contentTabs.details' },
  { id: 'special-abilities', labelKey: 'builder.contentTabs.specialAbilities' },
  { id: 'languages', labelKey: 'builder.contentTabs.languages' },
  { id: 'spells', labelKey: 'builder.contentTabs.spells' },
  { id: 'gear', labelKey: 'builder.contentTabs.gear' }
]

export default function ContentTabs5e(): JSX.Element {
  const { t } = useT()
  const activeTab = useBuilderStore((s) => s.activeTab)
  const setActiveTab = useBuilderStore((s) => s.setActiveTab)

  return (
    <div className="flex border-b border-border bg-surface/50 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
            activeTab === tab.id
              ? 'text-accent border-accent'
              : 'text-muted border-transparent hover:text-gray-200 hover:border-gray-600'
          }`}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}
