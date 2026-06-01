import lightingTravelData from '@data/5e/game/mechanics/lighting-travel.json'
import { lazy, Suspense } from 'react'
import { generateSentientItem } from '../../../data/sentient-items'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
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
  const { t } = useT()
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
      senderName: t('game.dmToolsTabContent.systemSender'),
      content: message,
      timestamp: Date.now(),
      isSystem: true
    })
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label={t('game.dmToolsTabContent.toolbarLabel')}>
      <button className={btnClass} onClick={() => onOpenModal('whisper')}>
        {t('game.dmToolsTabContent.whisper')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('lightSource')}>
        {t('game.dmToolsTabContent.lightSource')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('encounterBuilder')}>
        {t('game.dmToolsTabContent.encounterBuilder')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('treasureGenerator')}>
        {t('game.dmToolsTabContent.treasureGenerator')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('groupRoll')}>
        {t('game.dmToolsTabContent.groupRoll')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('npcGenerator')}>
        {t('game.dmToolsTabContent.generateNpc')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('dm-screen')}>
        {t('game.dmToolsTabContent.dmScreen')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('roll-table')}>
        {t('game.dmToolsTabContent.rollTables')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('partyInventory')}>
        {t('game.dmToolsTabContent.partyInventory')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('triggerManager')}>
        {t('game.dmToolsTabContent.aiTriggers')}
      </button>
      <button className={btnClass} onClick={() => onOpenModal('aiMapAnalysis')}>
        {t('game.dmToolsTabContent.aiMapAnalysis')}
      </button>
      <button
        className={btnClass}
        onClick={() => {
          const item = generateSentientItem()
          const msg = [
            t('game.dmToolsTabContent.sentientItemGenerated'),
            t('game.dmToolsTabContent.sentientAlignment', { alignment: item.alignment }),
            t('game.dmToolsTabContent.sentientCommunication', {
              method: item.communication.method,
              description: item.communication.description
            }),
            t('game.dmToolsTabContent.sentientSenses', { senses: item.senses }),
            t('game.dmToolsTabContent.sentientScores', {
              int: item.mentalScores.intelligence,
              wis: item.mentalScores.wisdom,
              cha: item.mentalScores.charisma
            }),
            t('game.dmToolsTabContent.sentientPurpose', {
              name: item.specialPurpose.name,
              description: item.specialPurpose.description
            })
          ].join('\n')
          addToast(msg, 'info', 10000)
          addChatMessage({
            id: `sentient-item-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
            senderId: 'system',
            senderName: t('game.dmToolsTabContent.systemSender'),
            content: msg,
            timestamp: Date.now(),
            isSystem: true
          })
        }}
      >
        {t('game.dmToolsTabContent.sentientItem')}
      </button>

      {/* Environment toggles */}
      <div className="w-full border-t border-border/40 mt-1 pt-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 block">
          {t('game.dmToolsTabContent.environment')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            className={underwaterCombat ? toggleOnClass : btnClass}
            onClick={() => setUnderwaterCombat(!underwaterCombat)}
            aria-pressed={underwaterCombat}
          >
            {t('game.dmToolsTabContent.underwater')}{' '}
            {underwaterCombat ? t('game.dmToolsTabContent.on') : t('game.dmToolsTabContent.off')}
          </button>
          <button
            className={flankingEnabled ? toggleOnClass : btnClass}
            onClick={() => setFlankingEnabled(!flankingEnabled)}
            title={t('game.dmToolsTabContent.flankingTitle')}
            aria-pressed={flankingEnabled}
          >
            {t('game.dmToolsTabContent.flanking')}{' '}
            {flankingEnabled ? t('game.dmToolsTabContent.on') : t('game.dmToolsTabContent.off')}
          </button>
          <button
            className={groupInitiativeEnabled ? toggleOnClass : btnClass}
            onClick={() => setGroupInitiativeEnabled(!groupInitiativeEnabled)}
            title={t('game.dmToolsTabContent.groupInitTitle')}
            aria-pressed={groupInitiativeEnabled}
          >
            {t('game.dmToolsTabContent.groupInit')}{' '}
            {groupInitiativeEnabled ? t('game.dmToolsTabContent.on') : t('game.dmToolsTabContent.off')}
          </button>
          <button
            className={diagonalRule === 'alternate' ? toggleOnClass : btnClass}
            onClick={() => setDiagonalRule(diagonalRule === 'alternate' ? 'standard' : 'alternate')}
            title={t('game.dmToolsTabContent.diagTitle')}
            aria-pressed={diagonalRule === 'alternate'}
          >
            {t('game.dmToolsTabContent.diag')}{' '}
            {diagonalRule === 'alternate' ? t('game.dmToolsTabContent.on') : t('game.dmToolsTabContent.off')}
          </button>
        </div>

        {/* Lighting */}
        <div
          className="flex items-center gap-1.5 mt-1.5"
          role="radiogroup"
          aria-label={t('game.dmToolsTabContent.ambientLightingLevel')}
        >
          <span className="text-xs text-gray-500">{t('game.dmToolsTabContent.lighting')}</span>
          {lightingTravelData.lightingLevels.map(({ level, tip }) => (
            <button
              key={level}
              onClick={() => setAmbientLight(level as 'bright' | 'dim' | 'darkness')}
              title={tip}
              aria-pressed={ambientLight === level}
              aria-label={t('game.dmToolsTabContent.setLighting', { level })}
              className={`px-1.5 py-0.5 text-xs rounded cursor-pointer ${
                ambientLight === level
                  ? level === 'bright'
                    ? 'bg-yellow-600 text-white'
                    : level === 'dim'
                      ? 'bg-amber-700 text-white'
                      : 'bg-gray-600 text-white'
                  : 'bg-surface-2 text-muted hover:bg-gray-700'
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        {/* Travel pace */}
        <div
          className="flex items-center gap-1.5 mt-1.5"
          role="radiogroup"
          aria-label={t('game.dmToolsTabContent.travelPace')}
        >
          <span className="text-xs text-gray-500">{t('game.dmToolsTabContent.pace')}</span>
          {(lightingTravelData.travelPaces as Array<string | null>).map((pace) => (
            <button
              key={pace ?? 'none'}
              onClick={() => setTravelPace(pace as 'fast' | 'normal' | 'slow' | null)}
              aria-pressed={travelPace === pace}
              aria-label={t('game.dmToolsTabContent.setTravelPace', { pace: pace ?? 'none' })}
              className={`px-1.5 py-0.5 text-xs rounded cursor-pointer ${
                travelPace === pace ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'
              }`}
            >
              {pace ? pace.charAt(0).toUpperCase() + pace.slice(1) : t('game.dmToolsTabContent.none')}
            </button>
          ))}
        </div>

        {/* Fog controls */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-xs text-gray-500">{t('game.dmToolsTabContent.fog')}</span>
          <button
            className={btnClass}
            onClick={() => {
              if (activeMapId) clearVision(activeMapId)
            }}
            disabled={!activeMapId}
            title={t('game.dmToolsTabContent.clearFogTitle')}
          >
            {t('game.dmToolsTabContent.clearFog')}
          </button>
          <button
            className={btnClass}
            onClick={() => clearAllVision()}
            title={t('game.dmToolsTabContent.resetExploredTitle')}
          >
            {t('game.dmToolsTabContent.resetExplored')}
          </button>
        </div>
      </div>

      {/* Disease & Curse Tracker */}
      <div className="w-full border-t border-border/40 mt-2 pt-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">
          {t('game.dmToolsTabContent.diseasesCurses')}
        </span>
        <Suspense fallback={<div className="text-xs text-gray-500">{t('game.dmToolsTabContent.loadingTracker')}</div>}>
          <DiseaseCurseTracker onBroadcastResult={broadcastSystem('disease-curse')} />
        </Suspense>
      </div>

      {/* Environmental Effects */}
      <div className="w-full border-t border-border/40 mt-2 pt-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">
          {t('game.dmToolsTabContent.environmentalEffects')}
        </span>
        <Suspense fallback={<div className="text-xs text-gray-500">{t('game.dmToolsTabContent.loadingEffects')}</div>}>
          <EnvironmentalEffectsPanel onBroadcastResult={broadcastSystem('env-effect')} />
        </Suspense>
      </div>

      {/* Trap Placer */}
      <div className="w-full border-t border-border/40 mt-2 pt-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">
          {t('game.dmToolsTabContent.traps')}
        </span>
        <Suspense fallback={<div className="text-xs text-gray-500">{t('game.dmToolsTabContent.loadingTraps')}</div>}>
          <TrapPlacerPanel onBroadcastResult={broadcastSystem('trap')} />
        </Suspense>
      </div>
    </div>
  )
}
