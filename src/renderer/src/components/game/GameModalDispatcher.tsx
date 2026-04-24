import type { MessageType } from '../../network'
import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import type { Campaign } from '../../types/campaign'
import type { Character } from '../../types/character'
import type { Companion5e } from '../../types/companion'
import type { Handout } from '../../types/game-state'
import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'
import type { AoEConfig } from './map/aoe-overlay'
import CombatModals from './modal-groups/CombatModals'
import DmModals from './modal-groups/DmModals'
import MechanicsModals from './modal-groups/MechanicsModals'
import UtilityModals from './modal-groups/UtilityModals'

export type { ActiveModal } from './active-modal-types'

import type { ActiveModal } from './active-modal-types'

interface GameModalDispatcherProps {
  activeModal: ActiveModal
  setActiveModal: (modal: ActiveModal) => void
  effectiveIsDM: boolean
  isDM: boolean
  character: Character | null
  playerName: string
  campaign: Campaign
  isMyTurn: boolean
  handleAction: (action: string) => void
  handleRestApply: (restType: 'shortRest' | 'longRest', restoredIds: string[]) => void
  getCampaignCharacterIds: () => string[]
  setActiveAoE: (config: AoEConfig | null) => void
  disputeContext: { ruling: string; citation: string } | null
  setDisputeContext: (ctx: { ruling: string; citation: string } | null) => void
  editingToken: { token: MapToken; mapId: string } | null
  setEditingToken: (t: { token: MapToken; mapId: string } | null) => void
  viewingHandout: Handout | null
  setViewingHandout: (h: Handout | null) => void
  setConcCheckPrompt: (
    prompt: {
      entityId: string
      entityName: string
      spellName: string
      dc: number
      damage: number
    } | null
  ) => void
  handleCompanionSummon: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => Promise<void>
  handleWildShapeTransform: (monster: MonsterStatBlock) => void
  handleWildShapeRevert: () => void
  handleWildShapeUseAdjust: (delta: number) => void
  localPeerId: string
}

function broadcastMsg(
  addChatMessage: (msg: {
    id: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
    isSystem: boolean
  }) => void,
  sendMessage: (type: MessageType, payload: unknown) => void,
  message: string
): void {
  addChatMessage({
    id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: 'system',
    senderName: 'System',
    content: message,
    timestamp: Date.now(),
    isSystem: true
  })
  sendMessage('chat:message', { message, isSystem: true })
}

export default function GameModalDispatcher(props: GameModalDispatcherProps): JSX.Element {
  const {
    activeModal,
    setActiveModal,
    effectiveIsDM,
    isDM: _isDM,
    character,
    playerName,
    campaign,
    isMyTurn,
    handleAction,
    handleRestApply,
    getCampaignCharacterIds,
    setActiveAoE,
    disputeContext,
    setDisputeContext,
    editingToken,
    setEditingToken,
    viewingHandout,
    setViewingHandout,
    setConcCheckPrompt,
    handleCompanionSummon,
    handleWildShapeTransform,
    handleWildShapeRevert,
    handleWildShapeUseAdjust,
    localPeerId
  } = props

  const gameStore = useGameStore()
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId) ?? null

  const close = (): void => setActiveModal(null)
  const broadcast = (message: string): void => broadcastMsg(addChatMessage, sendMessage, message)

  return (
    <>
      <CombatModals
        activeModal={activeModal}
        close={close}
        effectiveIsDM={effectiveIsDM}
        character={character}
        playerName={playerName}
        isMyTurn={isMyTurn}
        handleAction={handleAction}
        activeMap={activeMap}
        broadcast={broadcast}
        addChatMessage={addChatMessage}
        sendMessage={sendMessage}
        setConcCheckPrompt={setConcCheckPrompt}
      />
      <DmModals
        activeModal={activeModal}
        close={close}
        effectiveIsDM={effectiveIsDM}
        character={character}
        activeMap={activeMap}
        campaign={campaign}
        broadcast={broadcast}
        sendMessage={sendMessage}
        handleCompanionSummon={handleCompanionSummon}
        editingToken={editingToken}
        setEditingToken={setEditingToken}
        viewingHandout={viewingHandout}
        setViewingHandout={setViewingHandout}
      />
      <MechanicsModals
        activeModal={activeModal}
        close={close}
        effectiveIsDM={effectiveIsDM}
        character={character}
        activeMap={activeMap}
        campaign={campaign}
        broadcast={broadcast}
        addChatMessage={addChatMessage}
        sendMessage={sendMessage}
        handleRestApply={handleRestApply}
        getCampaignCharacterIds={getCampaignCharacterIds}
        setActiveAoE={setActiveAoE}
        handleCompanionSummon={handleCompanionSummon}
        handleWildShapeTransform={handleWildShapeTransform}
        handleWildShapeRevert={handleWildShapeRevert}
        handleWildShapeUseAdjust={handleWildShapeUseAdjust}
      />
      <UtilityModals
        activeModal={activeModal}
        close={close}
        effectiveIsDM={effectiveIsDM}
        character={character}
        playerName={playerName}
        campaign={campaign}
        activeMap={activeMap}
        broadcast={broadcast}
        sendMessage={sendMessage}
        disputeContext={disputeContext}
        setDisputeContext={setDisputeContext}
        localPeerId={localPeerId}
      />
    </>
  )
}
