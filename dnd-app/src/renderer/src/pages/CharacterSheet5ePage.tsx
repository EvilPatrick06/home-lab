import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import AbilityScoresGrid5e from '../components/sheet/5e/AbilityScoresGrid5e'
import ClassResourcesSection5e from '../components/sheet/5e/ClassResourcesSection5e'
import CombatStatsBar5e from '../components/sheet/5e/CombatStatsBar5e'
import CompanionsSection5e from '../components/sheet/5e/CompanionsSection5e'
import ConditionsSection5e from '../components/sheet/5e/ConditionsSection5e'
import CraftingSection5e from '../components/sheet/5e/CraftingSection5e'
import DefenseSection5e from '../components/sheet/5e/DefenseSection5e'
import EquipmentSection5e from '../components/sheet/5e/EquipmentSection5e'
import FeaturesSection5e from '../components/sheet/5e/FeaturesSection5e'
import HighElfCantripSwapModal5e from '../components/sheet/5e/HighElfCantripSwapModal5e'
import NotesSection5e from '../components/sheet/5e/NotesSection5e'
import OffenseSection5e from '../components/sheet/5e/OffenseSection5e'
import SavingThrowsSection5e from '../components/sheet/5e/SavingThrowsSection5e'
import SheetHeader5e from '../components/sheet/5e/SheetHeader5e'
import ShortRestModal5e from '../components/sheet/5e/ShortRestModal5e'
import SkillsSection5e from '../components/sheet/5e/SkillsSection5e'
import SpellcastingSection5e from '../components/sheet/5e/SpellcastingSection5e'
import Modal from '../components/ui/Modal'
import { addToast } from '../hooks/use-toast'

const PrintSheet = lazy(() => import('../components/sheet/shared/PrintSheet'))

import { shouldLevelUp } from '../data/xp-thresholds'
import { applyLongRest } from '../services/character/rest-service-5e'
import { useBuilderStore } from '../stores/use-builder-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { useNetworkStore } from '../stores/use-network-store'
import type { Character } from '../types/character'
import { is5eCharacter } from '../types/character'
import type { Character5e } from '../types/character-5e'

export default function CharacterSheet5ePage(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo

  const storeCharacter = useCharacterStore((s) => s.characters.find((c) => c.id === id))
  const remoteCharacters = useLobbyStore((s) => s.remoteCharacters)
  const rawCharacter = storeCharacter ?? (id ? remoteCharacters[id] : undefined)
  const character: Character5e | undefined = rawCharacter && is5eCharacter(rawCharacter) ? rawCharacter : undefined

  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const role = useNetworkStore((s) => s.role)
  const players = useLobbyStore((s) => s.players)

  const loadCharacterForEdit = useBuilderStore((s) => s.loadCharacterForEdit)

  const [isEditing, setIsEditing] = useState(false)
  const [showShortRest, setShowShortRest] = useState(false)
  const [showLongRestConfirm, setShowLongRestConfirm] = useState(false)
  const [showLevelUpBanner, setShowLevelUpBanner] = useState(false)
  const [showCantripSwap, setShowCantripSwap] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [versions, setVersions] = useState<Array<{ fileName: string; timestamp: string; sizeBytes: number }>>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null)
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null)

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

  // Permission logic
  const canEdit = (() => {
    if (character.playerId === 'local') return true
    if (role === 'host') return true
    const localPlayer = players.find((p) => p.peerId === localPeerId)
    if (localPlayer?.isCoDM) return true
    if (character.playerId === localPeerId) return true
    return false
  })()

  const readonly = !canEdit || !isEditing

  const handleBack = (): void => {
    navigate(returnTo || '/characters')
  }

  const handleMakeCharacter = (): void => {
    const ownerPlayer = players.find((p) => p.characterId === character.id)
    const editChar =
      ownerPlayer && ownerPlayer.peerId !== localPeerId ? { ...character, playerId: ownerPlayer.peerId } : character
    loadCharacterForEdit(editChar)
    navigate(`/characters/5e/edit/${character.id}`, { state: { returnTo: `/characters/5e/${character.id}` } })
  }

  const handleLevelUp = (): void => {
    navigate(`/characters/5e/${character.id}/levelup`, { state: { returnTo: `/characters/5e/${character.id}` } })
  }

  // --- Long Rest logic (5e only) ---

  const handleLongRest = (): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    if (!is5eCharacter(latest)) return

    const result = applyLongRest(latest)
    useCharacterStore.getState().saveCharacter(result.character)
    broadcastIfDM(result.character)

    setShowLongRestConfirm(false)

    // High Elf: offer cantrip swap after Long Rest
    if (result.highElfCantripSwap) {
      setShowCantripSwap(true)
    }
  }

  const broadcastIfDM = (updated: Character): void => {
    const { role: r, sendMessage } = useNetworkStore.getState()
    if (r === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }
  }

  // 5e hit dice info for short rest button tooltip
  const hdRemaining = character.hitDice.reduce((s, h) => s + h.current, 0)
  const hdTotal = character.hitDice.reduce((s, h) => s + h.maximum, 0)
  const hitDiceInfo =
    character.hitDice.length > 1
      ? `${hdRemaining}/${hdTotal} (${character.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')}) remaining`
      : `${hdRemaining}d${character.hitDice[0]?.dieType ?? 8} remaining`

  const isMaxLevel = character.level >= 20

  // XP-based level-up notification
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (character.levelingMode === 'xp' && shouldLevelUp(character.level, character.xp)) {
      setShowLevelUpBanner(true)
    } else {
      setShowLevelUpBanner(false)
    }
  }, [character.levelingMode, character.xp, character.level])

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
          {returnTo?.startsWith('/game/') && (
            <button
              onClick={() => navigate(returnTo)}
              className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition-colors"
            >
              Return to Game
            </button>
          )}
          <div className="w-px h-4 bg-gray-700" />
          <span className="text-xs text-gray-500">Character Sheet</span>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                isEditing
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'border border-gray-600 hover:border-amber-600 text-gray-300 hover:text-amber-400'
              }`}
            >
              {isEditing ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={() => setShowShortRest(true)}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-blue-600 text-gray-300 hover:text-blue-400 rounded transition-colors"
              title={hitDiceInfo}
            >
              Short Rest
            </button>
            <button
              onClick={() => setShowLongRestConfirm(true)}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-purple-600 text-gray-300 hover:text-purple-400 rounded transition-colors"
            >
              Long Rest
            </button>
            <button
              onClick={handleMakeCharacter}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-green-600 text-gray-300 hover:text-green-400 rounded transition-colors"
            >
              Re-Make Character
            </button>
            <button
              onClick={handleLevelUp}
              disabled={isMaxLevel}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
            >
              Level Up
            </button>
            <button
              onClick={() => setShowPrint(true)}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded transition-colors"
            >
              Print
            </button>
            <button
              onClick={async () => {
                setShowVersionHistory(true)
                setLoadingVersions(true)
                try {
                  const result = await window.api.listCharacterVersions(character.id)
                  if (result.success && result.data) setVersions(result.data)
                } catch {
                  addToast('Failed to load version history.', 'error')
                }
                setLoadingVersions(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded transition-colors"
            >
              History
            </button>
          </div>
        )}
      </div>

      {/* Level Up Banner */}
      {showLevelUpBanner && canEdit && (
        <div className="flex items-center justify-between px-4 py-2 bg-green-900/30 border-b border-green-700">
          <span className="text-sm text-green-400 font-semibold">You have enough XP to level up!</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLevelUp}
              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition-colors"
            >
              Level Up Now
            </button>
            <button
              onClick={() => setShowLevelUpBanner(false)}
              className="px-3 py-1 text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 rounded transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Sheet content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <SheetHeader5e character={character} readonly={readonly} />
          <CombatStatsBar5e character={character} readonly={readonly} />
          <AbilityScoresGrid5e character={character} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ClassResourcesSection5e character={character} readonly={readonly} />
              <SavingThrowsSection5e character={character} />
              <SkillsSection5e character={character} readonly={readonly} />
              <ConditionsSection5e character={character} readonly={readonly} />
              <FeaturesSection5e character={character} readonly={readonly} />
            </div>
            <div className="space-y-6">
              <OffenseSection5e character={character} readonly={readonly} />
              <DefenseSection5e character={character} readonly={readonly} />
              <SpellcastingSection5e character={character} readonly={readonly} />
              <EquipmentSection5e character={character} readonly={readonly} />
              <CompanionsSection5e character={character} readonly={readonly} />
              <CraftingSection5e character={character} readonly={readonly} />
            </div>
          </div>

          <div className="mt-6">
            <NotesSection5e character={character} readonly={readonly} />
          </div>
        </div>
      </div>

      {/* Short Rest Modal */}
      <ShortRestModal5e character={character} open={showShortRest} onClose={() => setShowShortRest(false)} />

      {/* Long Rest Confirmation */}
      <Modal open={showLongRestConfirm} onClose={() => setShowLongRestConfirm(false)} title="Long Rest">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Taking a long rest will:</p>
          <ul className="list-disc ml-5 mt-2 space-y-1 text-sm text-gray-400">
            <li>Restore HP to maximum</li>
            <li>Recover all Hit Point Dice</li>
            <li>Restore all spell slots</li>
            <li>Clear death saves</li>
            <li>Clear temporary HP</li>
            <li>Reduce Exhaustion by 1 level</li>
            {(character.knownSpells ?? []).some((s) => s.innateUses) && <li>Restore innate spell uses</li>}
            {character.wildShapeUses && character.wildShapeUses.max > 0 && <li>Restore all Wild Shape uses</li>}
            {character.species?.toLowerCase() === 'human' && <li>Grant Heroic Inspiration (Human trait)</li>}
          </ul>
          <div className="text-xs text-gray-500">
            Hit Point Dice: {character.hitDice.reduce((s, h) => s + h.current, 0)}/
            {character.hitDice.reduce((s, h) => s + h.maximum, 0)}
            {character.hitDice.length > 1 && (
              <span> ({character.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')})</span>
            )}{' '}
            &rarr; {character.hitDice.reduce((s, h) => s + h.maximum, 0)}/
            {character.hitDice.reduce((s, h) => s + h.maximum, 0)}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowLongRestConfirm(false)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLongRest}
              className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              Take Long Rest
            </button>
          </div>
        </div>
      </Modal>

      {/* High Elf Cantrip Swap Modal (after Long Rest) */}
      <HighElfCantripSwapModal5e
        character={character}
        open={showCantripSwap}
        onClose={() => setShowCantripSwap(false)}
      />

      {/* Print Sheet */}
      {showPrint && (
        <Suspense fallback={null}>
          <PrintSheet character={character} onClose={() => setShowPrint(false)} />
        </Suspense>
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowVersionHistory(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-amber-400">Version History</h3>
              <button
                onClick={() => setShowVersionHistory(false)}
                aria-label="Close version history"
                className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {loadingVersions ? (
                <p className="text-xs text-gray-500 text-center py-4">Loading versions...</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No previous versions saved yet.</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.fileName}
                    className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/30"
                  >
                    <div>
                      <div className="text-xs text-gray-200">
                        {new Date(v.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="text-[10px] text-gray-500">{(v.sizeBytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <button
                      onClick={() => setConfirmRestoreFile(v.fileName)}
                      disabled={restoringVersion !== null}
                      className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer transition-colors"
                    >
                      {restoringVersion === v.fileName ? 'Restoring...' : 'Restore'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version Restore Confirmation Modal */}
      <Modal open={confirmRestoreFile !== null} onClose={() => setConfirmRestoreFile(null)} title="Restore Version">
        <div className="space-y-4">
          <p className="text-sm text-gray-300">Restore this version? Your current save will be backed up first.</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmRestoreFile(null)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!confirmRestoreFile) return
                const fileName = confirmRestoreFile
                setConfirmRestoreFile(null)
                setRestoringVersion(fileName)
                try {
                  const result = await window.api.restoreCharacterVersion(character.id, fileName)
                  if (result.success && result.data) {
                    await useCharacterStore.getState().loadCharacters()
                    setShowVersionHistory(false)
                    addToast('Character version restored successfully.', 'success')
                  } else {
                    addToast('Failed to restore version. Please try again.', 'error')
                  }
                } catch {
                  addToast('Failed to restore version. Please try again.', 'error')
                }
                setRestoringVersion(null)
              }}
              className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition-colors"
            >
              Restore
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
