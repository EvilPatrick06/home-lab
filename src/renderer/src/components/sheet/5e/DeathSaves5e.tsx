import { trigger3dDice } from '../../../components/game/dice3d'
import { rollSingle } from '../../../services/dice/dice-service'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'

interface DeathSaves5eProps {
  character: Character5e
  effectiveCharacter: Character5e
  readonly?: boolean
}

export default function DeathSaves5e({
  character,
  effectiveCharacter,
  readonly
}: DeathSaves5eProps): JSX.Element | null {
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const deathSaves = effectiveCharacter.deathSaves

  if (effectiveCharacter.hitPoints.current > 0) return null

  const saveDeathSaves = (successes: number, failures: number): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const updated = {
      ...latest,
      deathSaves: { successes, failures },
      updatedAt: new Date().toISOString()
    }
    saveCharacter(updated)

    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated as Character)
    }
  }

  const resetDeathSaves = (): void => {
    saveDeathSaves(0, 0)
  }

  const toggleSuccess = (index: number): void => {
    if (readonly) return
    const newSuccesses = index < deathSaves.successes ? index : index + 1
    saveDeathSaves(Math.min(3, Math.max(0, newSuccesses)), deathSaves.failures)
  }

  const toggleFailure = (index: number): void => {
    if (readonly) return
    const newFailures = index < deathSaves.failures ? index : index + 1
    saveDeathSaves(deathSaves.successes, Math.min(3, Math.max(0, newFailures)))
  }

  const rollDeathSave = (): void => {
    const roll = rollSingle(20)
    trigger3dDice({
      formula: '1d20',
      rolls: [roll],
      total: roll,
      rollerName: effectiveCharacter.name
    })
    let newSuccesses = deathSaves.successes
    let newFailures = deathSaves.failures
    let resultMsg = ''

    if (roll === 1) {
      newFailures = Math.min(3, newFailures + 2)
      resultMsg = `Death Save: Natural 1! Two failures (${newFailures}/3)`
    } else if (roll === 20) {
      resultMsg = `Death Save: Natural 20! Regains 1 HP!`
      const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
      const updated = {
        ...latest,
        hitPoints: { ...effectiveCharacter.hitPoints, current: 1 },
        deathSaves: { successes: 0, failures: 0 },
        updatedAt: new Date().toISOString()
      }
      saveCharacter(updated)
      const { role, sendMessage } = useNetworkStore.getState()
      if (role === 'host' && updated.playerId !== 'local') {
        sendMessage('dm:character-update', {
          characterId: updated.id,
          characterData: updated,
          targetPeerId: updated.playerId
        })
        useLobbyStore.getState().setRemoteCharacter(updated.id, updated as Character)
      }
      const { sendMessage: send } = useNetworkStore.getState()
      send('chat:message', { message: `${effectiveCharacter.name} ${resultMsg}`, isSystem: true })
      return
    } else if (roll >= 10) {
      newSuccesses = Math.min(3, newSuccesses + 1)
      resultMsg = `Death Save: ${roll} - Success! (${newSuccesses}/3)`
    } else {
      newFailures = Math.min(3, newFailures + 1)
      resultMsg = `Death Save: ${roll} - Failure (${newFailures}/3)`
    }

    saveDeathSaves(newSuccesses, newFailures)
    const { sendMessage: send } = useNetworkStore.getState()
    send('chat:message', { message: `${effectiveCharacter.name} ${resultMsg}`, isSystem: true })
  }

  return (
    <div className="mt-3 bg-gray-900/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm text-gray-400 font-semibold">Death Saves:</span>

        {/* Successes */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <button
              key={`success-${i}`}
              onClick={() => toggleSuccess(i)}
              disabled={readonly}
              className={`text-lg ${readonly ? '' : 'cursor-pointer'}`}
              title={`Success ${i + 1}`}
            >
              {i < deathSaves.successes ? (
                <span className="text-green-500">{'\u25CF'}</span>
              ) : (
                <span className="text-gray-600">{'\u25CB'}</span>
              )}
            </button>
          ))}
          <span className="text-xs text-gray-500 ml-1">Successes</span>
        </div>

        <span className="text-gray-600">|</span>

        {/* Failures */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <button
              key={`failure-${i}`}
              onClick={() => toggleFailure(i)}
              disabled={readonly}
              className={`text-lg ${readonly ? '' : 'cursor-pointer'}`}
              title={`Failure ${i + 1}`}
            >
              {i < deathSaves.failures ? (
                <span className="text-red-500">{'\u25CF'}</span>
              ) : (
                <span className="text-gray-600">{'\u25CB'}</span>
              )}
            </button>
          ))}
          <span className="text-xs text-gray-500 ml-1">Failures</span>
        </div>

        {/* Roll Death Save button */}
        {!readonly && deathSaves.successes < 3 && deathSaves.failures < 3 && (
          <button
            onClick={rollDeathSave}
            className="px-2.5 py-1 text-xs bg-amber-700 hover:bg-amber-600 rounded text-white font-semibold cursor-pointer"
          >
            Roll Death Save
          </button>
        )}

        {/* Reset button */}
        {!readonly && (deathSaves.successes > 0 || deathSaves.failures > 0) && (
          <button
            onClick={resetDeathSaves}
            className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 ml-auto"
          >
            Reset
          </button>
        )}
      </div>

      {/* Status messages */}
      {deathSaves.successes >= 3 && <div className="mt-2 text-sm text-green-400 font-semibold">Stabilized!</div>}
      {deathSaves.failures >= 3 && <div className="mt-2 text-sm text-red-400 font-semibold">Dead!</div>}
    </div>
  )
}
