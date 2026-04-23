import { useEffect, useState } from 'react'
import { load5eSpells } from '../../../services/data-provider'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character5e } from '../../../types/character-5e'
import type { SpellEntry } from '../../../types/character-common'
import Modal from '../../ui/Modal'

interface HighElfCantripSwapModal5eProps {
  character: Character5e
  open: boolean
  onClose: () => void
}

interface SpellData {
  id: string
  name: string
  level: number
  school?: string
  castingTime?: string
  castTime?: string
  range?: string
  duration?: string
  description: string
  concentration?: boolean
  ritual?: boolean
  components?: string
  classes?: string[]
  spellList?: string[]
}

export default function HighElfCantripSwapModal5e({
  character,
  open,
  onClose
}: HighElfCantripSwapModal5eProps): JSX.Element | null {
  const [wizardCantrips, setWizardCantrips] = useState<SpellData[]>([])
  const [selectedCantripId, setSelectedCantripId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Find the current High Elf species cantrip
  const currentSpeciesCantrip = (character.knownSpells ?? []).find(
    (s) => s.level === 0 && s.id.startsWith('species-') && s.id.includes('Elf')
  )

  useEffect(() => {
    if (!open) return
    load5eSpells()
      .then((spells) => {
        const cantrips = spells
          .filter((s) => s.level === 0 && s.spellList?.includes('arcane'))
          .sort((a, b) => a.name.localeCompare(b.name))
        setWizardCantrips(cantrips)
      })
      .catch(() => setWizardCantrips([]))
  }, [open])

  const filteredCantrips = wizardCantrips.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))

  function handleConfirm(): void {
    if (!selectedCantripId) {
      onClose()
      return
    }

    const newCantrip = wizardCantrips.find((c) => c.id === selectedCantripId)
    if (!newCantrip || !currentSpeciesCantrip) {
      onClose()
      return
    }

    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character

    // Replace the old species cantrip with the new one
    const updatedSpells: SpellEntry[] = (latest.knownSpells ?? []).map((s) => {
      if (s.id !== currentSpeciesCantrip.id) return s
      return {
        id: `species-${newCantrip.id}-Elf`,
        name: newCantrip.name,
        level: 0,
        description: newCantrip.description,
        castingTime: newCantrip.castingTime || newCantrip.castTime || '',
        range: newCantrip.range || '',
        duration: newCantrip.duration || '',
        components: typeof newCantrip.components === 'string' ? newCantrip.components : '',
        school: newCantrip.school,
        concentration: newCantrip.concentration,
        ritual: newCantrip.ritual,
        source: 'species'
      }
    })

    const updated = { ...latest, knownSpells: updatedSpells, updatedAt: new Date().toISOString() } as Character5e
    useCharacterStore.getState().saveCharacter(updated)

    // Broadcast if DM editing remote character
    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }

    setSelectedCantripId(null)
    setSearchQuery('')
    onClose()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="High Elf Cantrip Swap">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          As a High Elf, you can replace your species cantrip with a different Wizard cantrip after a Long Rest.
        </p>

        {currentSpeciesCantrip && (
          <div className="text-sm">
            <span className="text-gray-500">Current cantrip: </span>
            <span className="text-purple-400 font-medium">{currentSpeciesCantrip.name}</span>
          </div>
        )}

        <input
          type="text"
          placeholder="Search cantrips..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />

        <div className="max-h-60 overflow-y-auto space-y-1">
          {filteredCantrips.map((cantrip) => (
            <button
              key={cantrip.id}
              onClick={() => setSelectedCantripId(cantrip.id)}
              className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                selectedCantripId === cantrip.id
                  ? 'bg-purple-600/30 border border-purple-500 text-purple-300'
                  : 'hover:bg-gray-800 text-gray-300 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{cantrip.name}</span>
                <span className="text-xs text-gray-500">{cantrip.school}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cantrip.description}</p>
            </button>
          ))}
          {filteredCantrips.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No matching cantrips found.</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => {
              setSelectedCantripId(null)
              setSearchQuery('')
              onClose()
            }}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors text-gray-300"
          >
            Keep Current
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedCantripId}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            Swap Cantrip
          </button>
        </div>
      </div>
    </Modal>
  )
}
