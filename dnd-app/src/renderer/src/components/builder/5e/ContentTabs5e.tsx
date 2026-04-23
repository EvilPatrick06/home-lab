import { useBuilderStore } from '../../../stores/use-builder-store'
import type { ContentTab } from '../../../types/builder'

const TABS: Array<{ id: ContentTab; label: string }> = [
  { id: 'details', label: 'About' },
  { id: 'special-abilities', label: 'Specials' },
  { id: 'languages', label: 'Languages' },
  { id: 'spells', label: 'Spells' },
  { id: 'gear', label: 'Gear' }
]

export default function ContentTabs5e(): JSX.Element {
  const activeTab = useBuilderStore((s) => s.activeTab)
  const setActiveTab = useBuilderStore((s) => s.setActiveTab)

  return (
    <div className="flex border-b border-gray-700 bg-gray-900/50 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
            activeTab === tab.id
              ? 'text-amber-400 border-amber-400'
              : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-gray-600'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
