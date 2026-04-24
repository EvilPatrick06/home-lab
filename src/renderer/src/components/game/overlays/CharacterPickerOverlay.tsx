import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useCharacterStore } from '../../../stores/use-character-store'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import { getBuilderCreatePath } from '../../../utils/character-routes'

interface CharacterPickerOverlayProps {
  campaignId: string
  onSelect: (character: Character) => void
  onClose: () => void
}

export default function CharacterPickerOverlay({
  campaignId,
  onSelect,
  onClose
}: CharacterPickerOverlayProps): JSX.Element {
  const navigate = useNavigate()
  const { characters, loadCharacters } = useCharacterStore()

  // Load characters from the main process via IPC
  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-96 shadow-2xl max-h-[70vh] flex flex-col">
        <h3 className="text-sm font-semibold text-amber-400 mb-3">Select a Character</h3>
        <p className="text-xs text-gray-400 mb-3">Choose a character to view the game as a player.</p>
        <div className="flex-1 overflow-y-auto space-y-1 mb-3">
          {characters.length === 0 && (
            <p className="text-xs text-gray-500 italic">No characters found. Create one first.</p>
          )}
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800 cursor-pointer flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm text-gray-200">{c.name}</div>
                <div className="text-xs text-gray-500">
                  Level {c.level} {is5eCharacter(c) ? c.classes.map((cl) => cl.name).join(' / ') : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onClose()
              navigate(getBuilderCreatePath(), { state: { returnTo: `/game/${campaignId}` } })
            }}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer"
          >
            Create New Character
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
