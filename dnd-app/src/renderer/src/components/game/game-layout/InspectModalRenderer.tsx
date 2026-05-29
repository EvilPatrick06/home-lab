import { lazy, Suspense } from 'react'
import { useGameStore } from '../../../stores/use-game-store'
import { ErrorBoundary } from '../../ui'

const CharacterInspectModal = lazy(() => import('../modals/utility/CharacterInspectModal'))

/**
 * Character Inspect Modal renderer — driven by store state (inspectedCharacterData),
 * not the activeModal dispatcher. Extracted from GameLayout as a focused sibling.
 */
export function InspectModalRenderer(): JSX.Element | null {
  const inspectedCharacterData = useGameStore((s) => s.inspectedCharacterData)
  const clearInspectedCharacter = useGameStore((s) => s.clearInspectedCharacter)
  if (!inspectedCharacterData) return null
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <CharacterInspectModal characterData={inspectedCharacterData} onClose={clearInspectedCharacter} />
      </Suspense>
    </ErrorBoundary>
  )
}
