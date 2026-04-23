import { useCallback, useState } from 'react'
import {
  applyLongRest,
  applyShortRest,
  type LongRestPreview,
  type LongRestResult,
  type ShortRestResult
} from '../../../../services/character/rest-service-5e'

type _LongRestPreview = LongRestPreview
type _LongRestResult = LongRestResult
type _ShortRestResult = ShortRestResult

import { useCharacterStore } from '../../../../stores/use-character-store'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import { is5eCharacter } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import LongRestPanel, { initLongRestStates, type PCLongRestState } from './LongRestPanel'
import ShortRestPanel, { initShortRestStates, type PCShortRestState } from './ShortRestPanel'

interface RestModalProps {
  mode: 'shortRest' | 'longRest'
  campaignCharacterIds: string[]
  onClose: () => void
  onApply: (restoredCharacterIds: string[]) => void
}

/** Shared preamble used by both rest handlers: resolves stores and the active map. */
function getRestContext() {
  const { saveCharacter } = useCharacterStore.getState()
  const { role, sendMessage } = useNetworkStore.getState()
  const { setRemoteCharacter } = useLobbyStore.getState()
  const activeMap = useGameStore.getState().maps.find((m) => m.id === useGameStore.getState().activeMapId)
  return { saveCharacter, role, sendMessage, setRemoteCharacter, activeMap }
}

/** After applying a rest result, syncs the token HP and broadcasts to remote players if needed. */
function syncRestResult(
  result: { character: Character5e },
  tokenHpUpdate: { currentHP: number; maxHP?: number },
  context: ReturnType<typeof getRestContext>
): void {
  const { role, sendMessage, setRemoteCharacter, activeMap } = context
  if (activeMap) {
    const token = activeMap.tokens.find((t) => t.entityId === result.character.id)
    if (token) {
      useGameStore.getState().updateToken(activeMap.id, token.id, tokenHpUpdate)
    }
  }
  if (role === 'host' && result.character.playerId !== 'local') {
    sendMessage('dm:character-update', {
      characterId: result.character.id,
      characterData: result.character,
      targetPeerId: result.character.playerId
    })
    setRemoteCharacter(result.character.id, result.character)
  }
}

export default function RestModal({ mode, campaignCharacterIds, onClose, onApply }: RestModalProps): JSX.Element {
  const characters = useCharacterStore((s) => s.characters)
  const remoteCharacters = useLobbyStore((s) => s.remoteCharacters)

  // Get all PCs for this campaign
  const pcs: Character5e[] = campaignCharacterIds
    .map((id) => {
      const local = characters.find((c) => c.id === id)
      const remote = remoteCharacters[id]
      return local ?? remote
    })
    .filter((c): c is Character5e => !!c && is5eCharacter(c))

  const [shortRestStates, setShortRestStates] = useState<Record<string, PCShortRestState>>(() =>
    initShortRestStates(pcs)
  )
  const [longRestStates, setLongRestStates] = useState<Record<string, PCLongRestState>>(() => initLongRestStates(pcs))
  const [applied, setApplied] = useState(false)

  const handleApplyShortRest = useCallback(() => {
    const restoredIds: string[] = []
    const context = getRestContext()

    for (const pc of pcs) {
      const state = shortRestStates[pc.id]
      if (!state?.selected) continue

      const latest = useCharacterStore.getState().characters.find((c) => c.id === pc.id) ?? pc
      if (!is5eCharacter(latest)) continue

      const result = applyShortRest(latest, state.rolls, state.arcaneRecoverySlots)
      context.saveCharacter(result.character)
      restoredIds.push(pc.id)
      syncRestResult(result, { currentHP: result.character.hitPoints.current }, context)
    }

    setApplied(true)
    onApply(restoredIds)
  }, [pcs, shortRestStates, onApply])

  const handleApplyLongRest = useCallback(() => {
    const restoredIds: string[] = []
    const context = getRestContext()

    for (const pc of pcs) {
      if (!longRestStates[pc.id]?.selected) continue

      const latest = useCharacterStore.getState().characters.find((c) => c.id === pc.id) ?? pc
      if (!is5eCharacter(latest)) continue

      const result = applyLongRest(latest)
      context.saveCharacter(result.character)
      restoredIds.push(pc.id)
      syncRestResult(
        result,
        { currentHP: result.character.hitPoints.current, maxHP: result.character.hitPoints.maximum },
        context
      )
    }

    setApplied(true)
    onApply(restoredIds)
  }, [pcs, longRestStates, onApply])

  const selectedCount =
    mode === 'shortRest'
      ? Object.values(shortRestStates).filter((s) => s.selected).length
      : Object.values(longRestStates).filter((s) => s.selected).length

  const allRolled =
    mode === 'shortRest'
      ? Object.entries(shortRestStates).every(([, s]) => !s.selected || s.rolled || s.diceCount === 0)
      : true

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-5 max-w-2xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-amber-400">
            {mode === 'shortRest' ? 'Short Rest (1 Hour)' : 'Long Rest (8 Hours)'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {applied ? (
          <div className="text-center py-8">
            <div className="text-green-400 text-lg font-semibold mb-2">Rest Complete!</div>
            <p className="text-gray-400 text-sm">
              {mode === 'shortRest' ? 'Short rest applied successfully.' : 'Long rest applied successfully.'}
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {pcs.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No characters found in this campaign.</p>
              ) : mode === 'shortRest' ? (
                <ShortRestPanel pcs={pcs} states={shortRestStates} onStatesChange={setShortRestStates} />
              ) : (
                <LongRestPanel pcs={pcs} states={longRestStates} onStatesChange={setLongRestStates} />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-700/50 pt-3">
              <span className="text-xs text-gray-500">
                {selectedCount} of {pcs.length} characters selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800 text-gray-300 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={mode === 'shortRest' ? handleApplyShortRest : handleApplyLongRest}
                  disabled={selectedCount === 0 || (mode === 'shortRest' && !allRolled)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white cursor-pointer transition-colors"
                >
                  Apply {mode === 'shortRest' ? 'Short' : 'Long'} Rest
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
