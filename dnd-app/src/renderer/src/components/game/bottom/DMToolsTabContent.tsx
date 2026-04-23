import lightingTravelData from '@data/5e/game/mechanics/lighting-travel.json'
import { lazy, Suspense } from 'react'
import { generateSentientItem } from '../../../data/sentient-items'
import { addToast } from '../../../hooks/use-toast'
import { load5eLightingTravel } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'

const DiseaseCurseTracker = lazy(() => import('../dm/DiseaseCurseTracker'))
const EnvironmentalEffectsPanel = lazy(() => import('../dm/EnvironmentalEffectsPanel'))
const TrapPlacerPanel = lazy(() => import('../dm/TrapPlacerPanel'))

/** Load lighting/travel data from the data store (includes plugin additions). */
export async function loadLightingTravelData(): Promise<unknown> {
  return load5eLightingTravel()
}

interface DMToolsTabContentProps {
  onOpenModal: (modal: string) => void
  btnClass: string
}

const toggleOnClass =
  'px-3 py-2 text-xs font-medium rounded-lg bg-amber-600/30 border border-amber-500/50 text-amber-300 transition-all cursor-pointer whitespace-nowrap'

export default function DMToolsTabContent({ onOpenModal, btnClass }: DMToolsTabContentProps): JSX.Element {
  const underwaterCombat = useGameStore((s) => s.underwaterCombat)
  const setUnderwaterCombat = useGameStore((s) => s.setUnderwaterCombat)
  const flankingEnabled = useGameStore((s) => s.flankingEnabled)
  const setFlankingEnabled = useGameStore((s) => s.setFlankingEnabled)
  const groupInitiativeEnabled = useGameStore((s) => s.groupInitiativeEnabled)
  const setGroupInitiativeEnabled = useGameStore((s) => s.setGroupInitiativeEnabled)
  const diagonalRule = useGameStore((s) => s.diagonalRule)
  const setDiagonalRule = useGameStore((s) => s.setDiagonalRule)
  const ambientLight = useGameStore((s) => s.ambientLight)
  const setAmbientLight = useGameStore((s) => s.setAmbientLight)
  const travelPace = useGameStore((s) => s.travelPace)
  const setTravelPace = useGameStore((s) => s.setTravelPace)

  const clearVision = useGameStore((s) => s.clearVision)
  const clearAllVision = useGameStore((s) => s.clearAllVision)
  const activeMapId = useGameStore((s) => s.activeMapId)

  const { addChatMessage } = useLobbyStore()

  const broadcastSystem = (prefix: string) => (message: string) => {
    addChatMessage({
      id: `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      senderId: 'system',
      senderName: 'System',
      content: message,
      timestamp: Date.now(),
      isSystem: true
    })
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="DM tools">
      <button className={btnClass} onClick={() => onOpenModal('whisper')}>
        Whisper
      </button>
      <button className={btnClass} onClick={() => onOpenModal('lightSource')}>
        Light Source
      </button>
      <button className={btnClass} onClick={() => onOpenModal('encounterBuilder')}>
        Encounter Builder
      </button>
      <button className={btnClass} onClick={() => onOpenModal('treasureGenerator')}>
        Treasure Generator
      </button>
      <button className={btnClass} onClick={() => onOpenModal('groupRoll')}>
        Group Roll
      </button>
      <button className={btnClass} onClick={() => onOpenModal('npcGenerator')}>
        Generate NPC
      </button>
      <button className={btnClass} onClick={() => onOpenModal('dm-screen')}>
        DM Screen
      </button>
      <button className={btnClass} onClick={() => onOpenModal('roll-table')}>
        Roll Tables
      </button>
      <button className={btnClass} onClick={() => onOpenModal('partyInventory')}>
        Party Inventory
      </button>
      <button className={btnClass} onClick={() => onOpenModal('triggerManager')}>
        AI Triggers
      </button>
      <button className={btnClass} onClick={() => onOpenModal('aiMapAnalysis')}>
        AI Map Analysis
      </button>
      <button
        className={btnClass}
        onClick={() => {
          const item = generateSentientItem()
          const msg = [
            `Sentient Item Generated:`,
            `Alignment: ${item.alignment}`,
            `Communication: ${item.communication.method} - ${item.communication.description}`,
            `Senses: ${item.senses}`,
            `INT ${item.mentalScores.intelligence} / WIS ${item.mentalScores.wisdom} / CHA ${item.mentalScores.charisma}`,
            `Purpose: ${item.specialPurpose.name} - ${item.specialPurpose.description}`
          ].join('\n')
          addToast(msg, 'info', 10000)
          addChatMessage({
            id: `sentient-item-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
            senderId: 'system',
            senderName: 'System',
            content: msg,
            timestamp: Date.now(),
            isSystem: true
          })
        }}
      >
        Sentient Item
      </button>

      {/* Environment toggles */}
      <div className="w-full border-t border-gray-700/40 mt-1 pt-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Environment</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            className={underwaterCombat ? toggleOnClass : btnClass}
            onClick={() => setUnderwaterCombat(!underwaterCombat)}
            aria-pressed={underwaterCombat}
          >
            Underwater {underwaterCombat ? 'ON' : 'OFF'}
          </button>
          <button
            className={flankingEnabled ? toggleOnClass : btnClass}
            onClick={() => setFlankingEnabled(!flankingEnabled)}
            title="DMG optional rule: allies on opposite sides gain advantage on melee attacks"
            aria-pressed={flankingEnabled}
          >
            Flanking {flankingEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            className={groupInitiativeEnabled ? toggleOnClass : btnClass}
            onClick={() => setGroupInitiativeEnabled(!groupInitiativeEnabled)}
            title="DMG optional rule: identical monster types share one initiative roll"
            aria-pressed={groupInitiativeEnabled}
          >
            Group Init {groupInitiativeEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            className={diagonalRule === 'alternate' ? toggleOnClass : btnClass}
            onClick={() => setDiagonalRule(diagonalRule === 'alternate' ? 'standard' : 'alternate')}
            title="DMG 2024 p.18 optional rule: alternating 5/10/5/10 diagonal movement costs"
            aria-pressed={diagonalRule === 'alternate'}
          >
            Diag 5/10 {diagonalRule === 'alternate' ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Lighting */}
        <div className="flex items-center gap-1.5 mt-1.5" role="radiogroup" aria-label="Ambient lighting level">
          <span className="text-[10px] text-gray-500">Lighting:</span>
          {lightingTravelData.lightingLevels.map(({ level, tip }) => (
            <button
              key={level}
              onClick={() => setAmbientLight(level as 'bright' | 'dim' | 'darkness')}
              title={tip}
              aria-pressed={ambientLight === level}
              aria-label={`Set lighting to ${level}`}
              className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer ${
                ambientLight === level
                  ? level === 'bright'
                    ? 'bg-yellow-600 text-white'
                    : level === 'dim'
                      ? 'bg-amber-700 text-white'
                      : 'bg-gray-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        {/* Travel pace */}
        <div className="flex items-center gap-1.5 mt-1.5" role="radiogroup" aria-label="Travel pace">
          <span className="text-[10px] text-gray-500">Pace:</span>
          {(lightingTravelData.travelPaces as Array<string | null>).map((pace) => (
            <button
              key={pace ?? 'none'}
              onClick={() => setTravelPace(pace as 'fast' | 'normal' | 'slow' | null)}
              aria-pressed={travelPace === pace}
              aria-label={`Set travel pace to ${pace ?? 'none'}`}
              className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer ${
                travelPace === pace ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {pace ? pace.charAt(0).toUpperCase() + pace.slice(1) : 'None'}
            </button>
          ))}
        </div>

        {/* Fog controls */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-[10px] text-gray-500">Fog:</span>
          <button
            className={btnClass}
            onClick={() => {
              if (activeMapId) clearVision(activeMapId)
            }}
            disabled={!activeMapId}
            title="Clear all fog on the current map (reveal everything)"
          >
            Clear Fog
          </button>
          <button
            className={btnClass}
            onClick={() => clearAllVision()}
            title="Reset explored cells on all maps (re-hide previously explored areas)"
          >
            Reset Explored
          </button>
        </div>
      </div>

      {/* Disease & Curse Tracker */}
      <div className="w-full border-t border-gray-700/40 mt-2 pt-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">
          Diseases & Curses
        </span>
        <Suspense fallback={<div className="text-[10px] text-gray-500">Loading tracker...</div>}>
          <DiseaseCurseTracker onBroadcastResult={broadcastSystem('disease-curse')} />
        </Suspense>
      </div>

      {/* Environmental Effects */}
      <div className="w-full border-t border-gray-700/40 mt-2 pt-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">
          Environmental Effects
        </span>
        <Suspense fallback={<div className="text-[10px] text-gray-500">Loading effects...</div>}>
          <EnvironmentalEffectsPanel onBroadcastResult={broadcastSystem('env-effect')} />
        </Suspense>
      </div>

      {/* Trap Placer */}
      <div className="w-full border-t border-gray-700/40 mt-2 pt-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">Traps</span>
        <Suspense fallback={<div className="text-[10px] text-gray-500">Loading traps...</div>}>
          <TrapPlacerPanel onBroadcastResult={broadcastSystem('trap')} />
        </Suspense>
      </div>
    </div>
  )
}
