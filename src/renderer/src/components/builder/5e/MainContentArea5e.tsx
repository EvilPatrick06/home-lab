import { lazy, Suspense } from 'react'
import { useBuilderStore } from '../../../stores/use-builder-store'
import ErrorBoundary from '../../ui/ErrorBoundary'
import AbilityScoreModal from '../shared/AbilityScoreModal'
import AsiModal from '../shared/AsiModal'
import ExpertiseModal from '../shared/ExpertiseModal'
import SelectionModal from '../shared/SelectionModal'
import SkillsModal from '../shared/SkillsModal'
import ContentTabs5e from './ContentTabs5e'
import DetailsTab5e from './DetailsTab5e'
import LanguagesTab5e from './LanguagesTab5e'
import SpecialAbilitiesTab5e from './SpecialAbilitiesTab5e'
import SpellsTab5e from './SpellsTab5e'

const GearTab5e = lazy(() => import('./GearTab5e'))

function ActiveTabContent(): JSX.Element {
  const activeTab = useBuilderStore((s) => s.activeTab)

  switch (activeTab) {
    case 'details':
      return <DetailsTab5e />
    case 'special-abilities':
      return <SpecialAbilitiesTab5e />
    case 'languages':
      return <LanguagesTab5e />
    case 'spells':
      return <SpellsTab5e />
    case 'gear':
      return (
        <ErrorBoundary
          fallback={<div className="p-4 text-red-400 text-sm">Failed to load gear tab. Please restart the app.</div>}
        >
          <Suspense fallback={<div className="p-4 text-gray-500 text-sm">Loading...</div>}>
            <GearTab5e />
          </Suspense>
        </ErrorBoundary>
      )
    default:
      return <DetailsTab5e />
  }
}

export default function MainContentArea5e(): JSX.Element {
  const selectionModal = useBuilderStore((s) => s.selectionModal)
  const customModal = useBuilderStore((s) => s.customModal)

  return (
    <div className="flex-1 flex flex-col relative min-w-0">
      <ContentTabs5e />
      <div className="flex-1 overflow-y-auto">
        <ActiveTabContent />
      </div>

      {/* Selection modal overlays the content area */}
      {selectionModal && <SelectionModal />}

      {/* Custom modals for ability scores, skills, ASI */}
      {customModal === 'ability-scores' && <AbilityScoreModal />}
      {customModal === 'skills' && <SkillsModal />}
      {customModal === 'asi' && <AsiModal />}
      {customModal === 'expertise' && <ExpertiseModal />}
    </div>
  )
}
