import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useCharacterStore } from '../../stores/use-character-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import type { Character } from '../../types/character'

interface CharacterSelectorProps {
  onSelect: (characterId: string, characterName: string) => void
}

function getCharacterSummary(character: Character): { name: string; level: number; className: string } {
  const primaryClass = character.classes[0]
  return {
    name: character.name,
    level: character.level,
    className: primaryClass ? primaryClass.name : 'Unknown'
  }
}

export default function CharacterSelector({ onSelect }: CharacterSelectorProps): JSX.Element {
  const navigate = useNavigate()
  const { campaignId } = useParams<{ campaignId: string }>()
  const { characters, loading, loadCharacters } = useCharacterStore()
  const isHost = useLobbyStore((s) => s.isHost)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const localPlayer = useLobbyStore((s) => s.players.find((p) => p.peerId === localPeerId))
  const isCoDM = localPlayer?.isCoDM ?? false
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  const selectedCharacter = selectedId === '__none__' ? null : characters.find((c) => c.id === selectedId)
  const selectedSummary = selectedCharacter ? getCharacterSummary(selectedCharacter) : null
  const isNoneSelected = selectedId === '__none__'

  const handleSelect = (character: Character): void => {
    const summary = getCharacterSummary(character)
    setSelectedId(character.id)
    setIsOpen(false)
    onSelect(character.id, summary.name)
  }

  const handleSelectNone = (): void => {
    setSelectedId('__none__')
    setIsOpen(false)
    onSelect('', 'Dungeon Master')
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide px-1">Your Character</h3>

      {/* Current selection */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 rounded-lg border text-left transition-all cursor-pointer
                   border-gray-700 bg-gray-800/50 hover:border-gray-600"
      >
        {isNoneSelected ? (
          <div>
            <p className="font-semibold text-gray-100">Dungeon Master</p>
            <p className="text-xs text-gray-400 mt-0.5">No character selected</p>
          </div>
        ) : selectedSummary ? (
          <div>
            <p className="font-semibold text-gray-100">{selectedSummary.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Level {selectedSummary.level} {selectedSummary.className}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-400">Select a Character</p>
            <p className="text-xs text-gray-600 mt-0.5">Click to choose</p>
          </div>
        )}
        <div className="flex justify-end mt-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {/* Dropdown list */}
      {isOpen && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden max-h-60 overflow-y-auto">
          {/* DM / Co-DM: no character option */}
          {(isHost || isCoDM) && (
            <button
              onClick={handleSelectNone}
              className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer
                border-b border-gray-700/50
                ${isNoneSelected ? 'bg-amber-900/20 text-amber-300' : 'hover:bg-gray-700/50 text-gray-200'}`}
            >
              <p className="text-sm font-medium">No Character</p>
              <p className="text-xs text-gray-500">Run the game without a player character</p>
            </button>
          )}
          {loading ? (
            <p className="p-3 text-sm text-gray-500 text-center">Loading...</p>
          ) : characters.length === 0 && !isHost && !isCoDM ? (
            <p className="p-3 text-sm text-gray-500 text-center">No characters found</p>
          ) : (
            characters.map((character) => {
              const summary = getCharacterSummary(character)
              const isSelected = character.id === selectedId
              return (
                <button
                  key={character.id}
                  onClick={() => handleSelect(character)}
                  className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer
                    border-b border-gray-700/50 last:border-b-0
                    ${isSelected ? 'bg-amber-900/20 text-amber-300' : 'hover:bg-gray-700/50 text-gray-200'}`}
                >
                  <p className="text-sm font-medium">{summary.name}</p>
                  <p className="text-xs text-gray-500">
                    Level {summary.level} {summary.className}
                  </p>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* Create new character button */}
      <button
        onClick={() => navigate('/characters/create', { state: { returnTo: `/lobby/${campaignId}` } })}
        className="w-full p-2.5 rounded-lg border border-dashed border-gray-700 text-sm text-gray-400
                   hover:border-amber-600/50 hover:text-amber-400 transition-colors cursor-pointer
                   text-center"
      >
        + Create New Character
      </button>
    </div>
  )
}
