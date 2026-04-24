import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import LevelUpWizard5e from '../components/levelup/5e/LevelUpWizard5e'

import { useCharacterStore } from '../stores/use-character-store'
import { useLevelUpStore } from '../stores/use-level-up-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { useNetworkStore } from '../stores/use-network-store'
import { is5eCharacter } from '../types/character'
import type { Character5e } from '../types/character-5e'
import { logger } from '../utils/logger'

export default function LevelUp5ePage(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo

  const storeCharacter = useCharacterStore((s) => s.characters.find((c) => c.id === id))
  const remoteCharacters = useLobbyStore((s) => s.remoteCharacters)
  const rawCharacter = storeCharacter ?? (id ? remoteCharacters[id] : undefined)
  const character: Character5e | undefined = rawCharacter && is5eCharacter(rawCharacter) ? rawCharacter : undefined

  const initLevelUp = useLevelUpStore((s) => s.initLevelUp)
  const applyLevelUp = useLevelUpStore((s) => s.applyLevelUp)
  const reset = useLevelUpStore((s) => s.reset)
  const storeCharacterRef = useLevelUpStore((s) => s.character)

  const [incompleteChoices, setIncompleteChoices] = useState<string[]>([])
  useEffect(() => {
    const update = (): void => setIncompleteChoices(useLevelUpStore.getState().getIncompleteChoices())
    update()
    return useLevelUpStore.subscribe(update)
  }, [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (character && !storeCharacterRef) {
      initLevelUp(character)
    }
  }, [character, storeCharacterRef, initLevelUp])

  if (!character) {
    return (
      <div className="p-8 h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xl mb-2">Character not found</p>
          <button
            onClick={() => navigate(returnTo || '/characters')}
            className="text-amber-400 hover:text-amber-300 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (character.level >= 20) {
    return (
      <div className="p-8 h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xl mb-2">Already at maximum level</p>
          <button
            onClick={() => navigate(returnTo || `/characters/5e/${character.id}`)}
            className="text-amber-400 hover:text-amber-300 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  const handleBack = (): void => {
    reset()
    navigate(returnTo || `/characters/5e/${character.id}`)
  }

  const handleApply = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const updated = await applyLevelUp()
      await useCharacterStore.getState().saveCharacter(updated)

      // Broadcast if DM editing remote player
      const { role, sendMessage } = useNetworkStore.getState()
      if (role === 'host' && updated.playerId !== 'local') {
        sendMessage('dm:character-update', {
          characterId: updated.id,
          characterData: updated,
          targetPeerId: updated.playerId
        })
        useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
      }

      reset()
      navigate(returnTo || `/characters/5e/${updated.id}`)
    } catch (err) {
      logger.error('Failed to apply level up:', err)
      setError(err instanceof Error ? err.message : 'Failed to apply level up')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
          >
            &larr; Back
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <span className="text-sm text-gray-300 font-semibold">Level Up: {character.name}</span>
        </div>

        <div className="flex items-center gap-3">
          {incompleteChoices.length > 0 && (
            <span className="text-xs text-amber-400">
              {incompleteChoices.length} choice{incompleteChoices.length !== 1 ? 's' : ''} remaining
            </span>
          )}
          <button
            onClick={handleApply}
            disabled={saving || incompleteChoices.length > 0}
            className="px-4 py-1.5 text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
          >
            {saving ? 'Applying...' : 'Apply Level Up'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {incompleteChoices.length > 0 && (
            <div className="mb-4 px-4 py-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Choices Remaining</div>
              <div className="flex flex-wrap gap-1.5">
                {incompleteChoices.map((choice, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs bg-amber-900/30 text-amber-300 border border-amber-700/50 rounded"
                  >
                    {choice}
                  </span>
                ))}
              </div>
            </div>
          )}

          {storeCharacterRef && is5eCharacter(storeCharacterRef) && (
            <LevelUpWizard5e character={storeCharacterRef} incompleteChoices={incompleteChoices} />
          )}
        </div>
      </div>
    </div>
  )
}
