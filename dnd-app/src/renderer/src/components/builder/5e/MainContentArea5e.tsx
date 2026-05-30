import { lazy, Suspense, useMemo } from 'react'
import { useT } from '../../../i18n'
import type { TranslationKeys } from '../../../i18n/types'
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

const GUIDED_HINT_KEYS: Record<string, TranslationKeys> = {
  class: 'builder.mainContent.hint.class',
  background: 'builder.mainContent.hint.background',
  ancestry: 'builder.mainContent.hint.ancestry',
  'ability-scores': 'builder.mainContent.hint.abilityScores',
  'skill-choices': 'builder.mainContent.hint.skillChoices',
  heritage: 'builder.mainContent.hint.heritage',
  subclass: 'builder.mainContent.hint.subclass'
}

function GuidedBanner(): JSX.Element | null {
  const { t } = useT()
  const guidedMode = useBuilderStore((s) => s.guidedMode)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const selectionModal = useBuilderStore((s) => s.selectionModal)

  const hintKey = useMemo(() => {
    if (!guidedMode) return null
    // Show hint based on the active selection modal or next unconfirmed slot
    if (selectionModal) {
      const slot = buildSlots.find((s) => s.id === selectionModal.slotId)
      if (slot) {
        return GUIDED_HINT_KEYS[slot.category] || GUIDED_HINT_KEYS[slot.id] || null
      }
    }
    // Fall back to the next unconfirmed slot
    for (const slot of buildSlots) {
      if (!slot.selectedId && !slot.isAutoGranted) {
        return GUIDED_HINT_KEYS[slot.category] || GUIDED_HINT_KEYS[slot.id] || null
      }
    }
    return null
  }, [guidedMode, buildSlots, selectionModal])

  if (!hintKey) return null

  return <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-700/40 text-xs text-blue-300">{t(hintKey)}</div>
}

function ActiveTabContent(): JSX.Element {
  const { t } = useT()
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
          fallback={<div className="p-4 text-red-400 text-sm">{t('builder.mainContent.gearTabError')}</div>}
        >
          <Suspense fallback={<div className="p-4 text-gray-500 text-sm">{t('common.states.loading')}</div>}>
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
      <GuidedBanner />
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
