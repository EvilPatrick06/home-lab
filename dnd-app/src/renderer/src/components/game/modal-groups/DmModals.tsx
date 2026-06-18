import { lazy, Suspense } from 'react'
import type { HandoutSharePayload, MessageType } from '../../../network'
import { useFloatingToolsStore } from '../../../stores/use-floating-tools-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import type { Companion5e } from '../../../types/companion'
import type { Handout } from '../../../types/game-state'
import type { GameMap, MapToken } from '../../../types/map'
import type { MonsterStatBlock } from '../../../types/monster'
import type { ActiveModal } from '../active-modal-types'

const DMNotesModal = lazy(() => import('../modals/dm-tools/DMNotesModal'))
const DMRollerModal = lazy(() => import('../modals/dm-tools/DMRollerModal'))
const DMShopModal = lazy(() => import('../modals/dm-tools/DMShopModal'))
const InitiativeModal = lazy(() => import('../modals/combat/InitiativeModal'))
const CreatureModal = lazy(() => import('../modals/dm-tools/CreatureModal'))
const SentientItemModal = lazy(() => import('../modals/dm-tools/SentientItemModal'))
const EncounterBuilderModal = lazy(() => import('../modals/dm-tools/EncounterBuilderModal'))
const TreasureGeneratorModal = lazy(() => import('../modals/dm-tools/TreasureGeneratorModal'))
const NPCGeneratorModal = lazy(() => import('../modals/dm-tools/NPCGeneratorModal'))
const TokenEditorModal = lazy(() => import('../modals/dm-tools/TokenEditorModal'))
const GridSettingsModal = lazy(() => import('../modals/dm-tools/GridSettingsModal'))
const HandoutModal = lazy(() => import('../modals/dm-tools/HandoutModal'))
const HandoutViewerModal = lazy(() => import('../modals/dm-tools/HandoutViewerModal'))
const TimerModal = lazy(() => import('../modals/utility/TimerModal'))
const DmScreenPanel = lazy(() => import('../modals/dm-tools/DmScreenPanel'))
const RollTableModal = lazy(() => import('../modals/dm-tools/RollTableModal'))
const TriggerManagerModal = lazy(() => import('../modals/dm-tools/TriggerManagerModal'))
const AiMapAnalysisModal = lazy(() => import('../modals/dm-tools/AiMapAnalysisModal'))
const AiImageModal = lazy(() => import('../modals/dm-tools/AiImageModal'))
const GenerateBattlemapModal = lazy(() => import('../modals/dm-tools/GenerateBattlemapModal'))
const SceneModeModal = lazy(() => import('../modals/dm-tools/SceneModeModal'))

interface DmModalsProps {
  activeModal: ActiveModal
  close: () => void
  effectiveIsDM: boolean
  character: Character | null
  activeMap: GameMap | null
  campaign: Campaign
  broadcast: (message: string) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  handleCompanionSummon: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => Promise<void>
  editingToken: { token: MapToken; mapId: string } | null
  setEditingToken: (t: { token: MapToken; mapId: string } | null) => void
  viewingHandout: Handout | null
  setViewingHandout: (h: Handout | null) => void
}

export default function DmModals({
  activeModal,
  close,
  effectiveIsDM,
  character,
  activeMap,
  campaign: _campaign,
  broadcast,
  sendMessage,
  handleCompanionSummon,
  editingToken,
  setEditingToken,
  viewingHandout,
  setViewingHandout
}: DmModalsProps): JSX.Element {
  const gameStore = useGameStore()
  // Phase 16c — non-blocking floating tools (initiative, DM notes). Persisted per session.
  const floating = useFloatingToolsStore((s) => s.floating)
  const setFloating = useFloatingToolsStore((s) => s.setFloating)

  const handlePlaceMonster = effectiveIsDM
    ? (monster: MonsterStatBlock): void => {
        if (!activeMap) return
        // BUG-6 — place at the cell the right-click "Place Token" came from (was
        // hardcoded to the map origin, dropping every token in the top-left corner).
        // Falls back to 0,0 only when opened without an originating cell.
        const cell = gameStore.pendingPlaceCell
        gameStore.addToken(activeMap.id, {
          id: crypto.randomUUID(),
          entityId: `npc-${crypto.randomUUID()}`,
          entityType: 'npc',
          label: monster.name,
          gridX: cell?.gridX ?? 0,
          gridY: cell?.gridY ?? 0,
          sizeX: monster.tokenSize?.x ?? 1,
          sizeY: monster.tokenSize?.y ?? 1,
          visibleToPlayers: false,
          conditions: [],
          currentHP: monster.hp,
          maxHP: monster.hp,
          ac: monster.ac,
          monsterStatBlockId: monster.id,
          walkSpeed: monster.speed.walk ?? 0,
          swimSpeed: monster.speed.swim,
          climbSpeed: monster.speed.climb,
          flySpeed: monster.speed.fly,
          initiativeModifier: monster.abilityScores ? Math.floor((monster.abilityScores.dex - 10) / 2) : 0,
          resistances: monster.resistances,
          vulnerabilities: monster.vulnerabilities,
          immunities: monster.damageImmunities,
          darkvision: !!monster.senses?.darkvision,
          darkvisionRange: monster.senses?.darkvision || undefined
        })
        gameStore.setPendingPlaceCell(null)
        // BUG-6 — log it like the sibling "Summon Monster" path does.
        broadcast(`DM placed ${monster.name} on the map.`)
        close()
      }
    : undefined

  return (
    <Suspense fallback={null}>
      {activeModal === 'dmRoller' && effectiveIsDM && <DMRollerModal onClose={close} />}
      {activeModal === 'shop' && effectiveIsDM && <DMShopModal onClose={close} />}
      {activeModal === 'timer' && effectiveIsDM && <TimerModal onClose={close} />}
      {/* Phase 16c — Initiative: docked when active (with a Float button) unless already floating. */}
      {activeModal === 'initiative' && effectiveIsDM && !floating.initiative && (
        <InitiativeModal
          onClose={close}
          onFloat={() => {
            setFloating('initiative', true)
            close()
          }}
        />
      )}
      {/* Floating instance persists across modal open/close + reloads (sessionStorage). */}
      {effectiveIsDM && floating.initiative && (
        <InitiativeModal floating onClose={() => setFloating('initiative', false)} />
      )}

      {activeModal === 'notes' && effectiveIsDM && !floating.notes && (
        <DMNotesModal
          onClose={close}
          onFloat={() => {
            setFloating('notes', true)
            close()
          }}
        />
      )}
      {effectiveIsDM && floating.notes && <DMNotesModal floating onClose={() => setFloating('notes', false)} />}

      {activeModal === 'creatures' && (
        <CreatureModal
          onClose={close}
          isDM={effectiveIsDM}
          initialTab="browse"
          characterId={character?.id}
          onSummon={character ? handleCompanionSummon : undefined}
          onPlace={handlePlaceMonster}
        />
      )}

      {activeModal === 'summonCreature' && character && (
        <CreatureModal
          onClose={close}
          onSummon={handleCompanionSummon}
          characterId={character.id}
          initialTab="summon"
          isDM={effectiveIsDM}
          onPlace={handlePlaceMonster}
        />
      )}

      {activeModal === 'encounterBuilder' && effectiveIsDM && (
        <EncounterBuilderModal onClose={close} onBroadcastResult={broadcast} />
      )}
      {activeModal === 'treasureGenerator' && effectiveIsDM && (
        <TreasureGeneratorModal onClose={close} onBroadcastResult={broadcast} />
      )}
      {activeModal === 'npcGenerator' && effectiveIsDM && (
        <NPCGeneratorModal onClose={close} onBroadcastResult={broadcast} />
      )}
      {activeModal === 'gridSettings' && effectiveIsDM && <GridSettingsModal onClose={close} />}
      {activeModal === 'tokenEditor' && effectiveIsDM && editingToken && (
        <TokenEditorModal
          token={editingToken.token}
          mapId={editingToken.mapId}
          onClose={() => {
            close()
            setEditingToken(null)
          }}
        />
      )}
      {activeModal === 'handout' && effectiveIsDM && (
        <HandoutModal
          onClose={close}
          onShareHandout={(handout) => {
            const sharePayload: HandoutSharePayload = { handout }
            sendMessage('dm:share-handout', sharePayload)
          }}
        />
      )}
      {activeModal === 'sentientItem' && <SentientItemModal onClose={close} />}
      {activeModal === 'handoutViewer' && viewingHandout && (
        <HandoutViewerModal
          handout={viewingHandout}
          onClose={() => {
            close()
            setViewingHandout(null)
          }}
        />
      )}
      {activeModal === 'dm-screen' && effectiveIsDM && <DmScreenPanel onClose={close} />}
      {activeModal === 'roll-table' && effectiveIsDM && <RollTableModal onClose={close} />}
      {activeModal === 'triggerManager' && effectiveIsDM && <TriggerManagerModal onClose={close} />}
      {activeModal === 'aiMapAnalysis' && effectiveIsDM && <AiMapAnalysisModal onClose={close} />}
      {activeModal === 'aiImage' && effectiveIsDM && <AiImageModal onClose={close} />}
      {activeModal === 'generateBattlemap' && effectiveIsDM && <GenerateBattlemapModal onClose={close} />}
      {activeModal === 'sceneMode' && effectiveIsDM && <SceneModeModal onClose={close} />}
    </Suspense>
  )
}
