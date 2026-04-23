import { lazy, Suspense } from 'react'
import type { MessageType } from '../../../network'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import type { ChatMessage } from '../../../stores/use-lobby-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import type { Companion5e } from '../../../types/companion'
import type { GameMap } from '../../../types/map'
import type { MonsterStatBlock } from '../../../types/monster'
import type { ActiveModal } from '../active-modal-types'
import type { AoEConfig } from '../map/aoe-overlay'

const ItemModal = lazy(() => import('../modals/mechanics/ItemModal'))
const InfluenceModal = lazy(() => import('../modals/mechanics/InfluenceModal'))
const AoETemplateModal = lazy(() => import('../modals/mechanics/AoETemplateModal'))
const MountModal = lazy(() => import('../modals/mechanics/MountModal'))
const FamiliarSelectorModal = lazy(() => import('../modals/mechanics/FamiliarSelectorModal'))
const WildShapeBrowserModal = lazy(() => import('../modals/mechanics/WildShapeBrowserModal'))
const SteedSelectorModal = lazy(() => import('../modals/mechanics/SteedSelectorModal'))
const LightSourceModal = lazy(() => import('../modals/mechanics/LightSourceModal'))
const RestModal = lazy(() => import('../modals/mechanics/RestModal'))
const StudyActionModal = lazy(() => import('../modals/mechanics/StudyActionModal'))
const DowntimeModal = lazy(() => import('../modals/mechanics/DowntimeModal'))
const SpellReferenceModal = lazy(() => import('../modals/mechanics/SpellReferenceModal'))
const MagicItemTrackerModal = lazy(() => import('../modals/mechanics/MagicItemTrackerModal'))

interface MechanicsModalsProps {
  activeModal: ActiveModal
  close: () => void
  effectiveIsDM: boolean
  character: Character | null
  activeMap: GameMap | null
  campaign: Campaign
  broadcast: (message: string) => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  handleRestApply: (restType: 'shortRest' | 'longRest', restoredIds: string[]) => void
  getCampaignCharacterIds: () => string[]
  setActiveAoE: (config: AoEConfig | null) => void
  handleCompanionSummon: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => Promise<void>
  handleWildShapeTransform: (monster: MonsterStatBlock) => void
  handleWildShapeRevert: () => void
  handleWildShapeUseAdjust: (delta: number) => void
}

function setCompanionDismissed(characterId: string, companionType: string, dismissed: boolean): void {
  const latest = useCharacterStore.getState().characters.find((c) => c.id === characterId)
  if (!latest || !is5eCharacter(latest)) return
  const companion = (latest.companions ?? []).find((c) => c.type === companionType)
  if (!companion) return
  const updated = {
    ...latest,
    companions: (latest.companions ?? []).map((c) => (c.id === companion.id ? { ...c, dismissed } : c)),
    updatedAt: new Date().toISOString()
  }
  useCharacterStore.getState().saveCharacter(updated)
}

export default function MechanicsModals({
  activeModal,
  close,
  effectiveIsDM,
  character,
  activeMap,
  campaign,
  broadcast,
  addChatMessage,
  sendMessage,
  handleRestApply,
  getCampaignCharacterIds,
  setActiveAoE,
  handleCompanionSummon,
  handleWildShapeTransform,
  handleWildShapeRevert,
  handleWildShapeUseAdjust
}: MechanicsModalsProps): JSX.Element {
  const gameStore = useGameStore()

  return (
    <Suspense fallback={null}>
      {activeModal === 'item' && (
        <ItemModal character={character} onClose={close} onUseItem={(_, message) => broadcast(message)} />
      )}

      {activeModal === 'influence' && character && (
        <InfluenceModal
          character={character}
          onClose={() => {
            close()
            if (character && gameStore.initiative) {
              gameStore.useAction(character.id)
            }
          }}
          onBroadcastResult={broadcast}
        />
      )}

      {activeModal === 'aoe' && (
        <AoETemplateModal
          tokens={activeMap?.tokens ?? []}
          gridWidth={activeMap ? Math.ceil(activeMap.width / (activeMap.grid.cellSize || 40)) : 30}
          gridHeight={activeMap ? Math.ceil(activeMap.height / (activeMap.grid.cellSize || 40)) : 30}
          onPlace={(config) => {
            setActiveAoE(config)
            close()
          }}
          onClose={close}
        />
      )}

      {activeModal === 'mount' && (
        <MountModal
          character={character}
          tokens={activeMap?.tokens ?? []}
          attackerToken={activeMap?.tokens.find((t) => t.entityId === character?.id) ?? null}
          onClose={close}
          onBroadcastResult={broadcast}
        />
      )}

      {activeModal === 'familiar' && character && is5eCharacter(character) && (
        <FamiliarSelectorModal
          onClose={close}
          onSummon={handleCompanionSummon}
          characterId={character.id}
          hasChainPact={character.invocationsKnown?.some((i) => i === 'pact-of-the-chain') ?? false}
          existingFamiliar={(character.companions ?? []).find((c) => c.type === 'familiar') ?? null}
          onDismiss={() => setCompanionDismissed(character.id, 'familiar', true)}
          onResummon={() => setCompanionDismissed(character.id, 'familiar', false)}
        />
      )}

      {activeModal === 'wildShape' && character && is5eCharacter(character) && (
        <WildShapeBrowserModal
          onClose={close}
          druidLevel={character.classes.find((c) => c.name.toLowerCase() === 'druid')?.level ?? character.level}
          wildShapeUses={character.wildShapeUses ?? { current: 0, max: 0 }}
          activeFormId={character.activeWildShapeFormId}
          onTransform={handleWildShapeTransform}
          onRevert={handleWildShapeRevert}
          onUseAdjust={handleWildShapeUseAdjust}
        />
      )}

      {activeModal === 'steed' && character && is5eCharacter(character) && (
        <SteedSelectorModal
          onClose={close}
          onSummon={handleCompanionSummon}
          characterId={character.id}
          existingSteed={(character.companions ?? []).find((c) => c.type === 'steed') ?? null}
          onDismiss={() => setCompanionDismissed(character.id, 'steed', true)}
          onResummon={() => setCompanionDismissed(character.id, 'steed', false)}
        />
      )}

      {activeModal === 'lightSource' && <LightSourceModal onClose={close} />}

      {(activeModal === 'shortRest' || activeModal === 'longRest') && effectiveIsDM && (
        <RestModal
          mode={activeModal}
          campaignCharacterIds={getCampaignCharacterIds()}
          onClose={close}
          onApply={(restoredIds) => handleRestApply(activeModal, restoredIds)}
        />
      )}

      {activeModal === 'study' && character && (
        <StudyActionModal character={character} onClose={close} onBroadcastResult={broadcast} />
      )}

      {activeModal === 'downtime' && (
        <DowntimeModal
          characterName={character?.name}
          characterId={character?.id}
          character={character && is5eCharacter(character) ? character : undefined}
          campaign={campaign}
          onClose={close}
          onApply={(activity, days, gold, details) => {
            const msg = `**Downtime Activity:** ${activity}${details ? ` (${details})` : ''} \u2014 ${days} day${days !== 1 ? 's' : ''}, ${gold.toLocaleString()} GP`
            addChatMessage({
              id: `system-downtime-${Date.now()}`,
              senderId: 'system',
              senderName: 'System',
              content: msg,
              timestamp: Date.now(),
              isSystem: true
            })
          }}
          onSaveCampaign={(updated) => {
            sendMessage('game:state-update', { campaign: updated })
          }}
          onBroadcastResult={broadcast}
        />
      )}

      {activeModal === 'spellRef' && <SpellReferenceModal onClose={close} />}
      {activeModal === 'magic-item-tracker' && effectiveIsDM && (
        <MagicItemTrackerModal campaign={campaign} onClose={close} />
      )}
    </Suspense>
  )
}
