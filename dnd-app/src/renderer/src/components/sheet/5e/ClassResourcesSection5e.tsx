import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { ClassResource } from '../../../types/character-common'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'

interface ClassResourcesSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function ClassResourcesSection5e({
  character,
  readonly
}: ClassResourcesSection5eProps): JSX.Element | null {
  const classResources = character.classResources ?? []
  const speciesResources = character.speciesResources ?? []
  if (classResources.length === 0 && speciesResources.length === 0) return null

  const broadcastUpdate = (updated: Character5e): void => {
    useCharacterStore.getState().saveCharacter(updated)
    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }
  }

  const handleClassToggle = (resourceId: string, index: number): void => {
    if (readonly) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    if (!is5eCharacter(latest)) return

    const updatedResources = (latest.classResources ?? []).map((r) => {
      if (r.id !== resourceId) return r
      const newCurrent = index < r.current ? index : index + 1
      return { ...r, current: Math.max(0, Math.min(r.max, newCurrent)) }
    })

    broadcastUpdate({ ...latest, classResources: updatedResources, updatedAt: new Date().toISOString() })
  }

  const handleSpeciesToggle = (resourceId: string, index: number): void => {
    if (readonly) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    if (!is5eCharacter(latest)) return

    const updatedResources = (latest.speciesResources ?? []).map((r) => {
      if (r.id !== resourceId) return r
      const newCurrent = index < r.current ? index : index + 1
      return { ...r, current: Math.max(0, Math.min(r.max, newCurrent)) }
    })

    broadcastUpdate({ ...latest, speciesResources: updatedResources, updatedAt: new Date().toISOString() })
  }

  const renderResource = (resource: ClassResource, onToggle: (id: string, index: number) => void): JSX.Element => (
    <div key={resource.id} className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-200 font-medium">{resource.name}</span>
        <span className="text-xs text-gray-500">
          (
          {resource.shortRestRestore === 'all'
            ? 'Short Rest: all'
            : resource.shortRestRestore > 0
              ? `Short Rest: ${resource.shortRestRestore}`
              : 'Long Rest only'}
          )
        </span>
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: resource.max }, (_, i) => {
          const isFilled = i < resource.current
          return (
            <button
              key={i}
              onClick={() => onToggle(resource.id, i)}
              disabled={readonly}
              className={`w-5 h-5 rounded-full border-2 transition-colors ${
                isFilled ? 'bg-amber-500 border-amber-400' : 'bg-transparent border-gray-600'
              } ${!readonly ? 'cursor-pointer hover:border-amber-400' : 'cursor-default'}`}
              title={isFilled ? 'Click to expend' : 'Click to restore'}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <SheetSectionWrapper title="Resources">
      <div className="space-y-3">
        {classResources.length > 0 && (
          <>
            {classResources.length > 0 && speciesResources.length > 0 && (
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Class</div>
            )}
            {classResources.map((r) => renderResource(r, handleClassToggle))}
          </>
        )}
        {speciesResources.length > 0 && (
          <>
            {classResources.length > 0 && speciesResources.length > 0 && (
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Species</div>
            )}
            {speciesResources.map((r) => renderResource(r, handleSpeciesToggle))}
          </>
        )}
      </div>
    </SheetSectionWrapper>
  )
}
