import { lazy, Suspense } from 'react'
import type { MessageType } from '../../../network'
import { useGameStore } from '../../../stores/use-game-store'
import type { Campaign } from '../../../types/campaign'
import type { Character } from '../../../types/character'
import type { LibraryCategory } from '../../../types/library'
import type { GameMap } from '../../../types/map'
import type { ActiveModal } from '../active-modal-types'

const WhisperModal = lazy(() => import('../modals/utility/WhisperModal'))
const HelpModal = lazy(() => import('../modals/utility/HelpModal'))
const TravelPaceModal = lazy(() => import('../modals/utility/TravelPaceModal'))
const TimeEditModal = lazy(() => import('../modals/utility/TimeEditModal'))
const CommandReferenceModal = lazy(() => import('../modals/utility/CommandReferenceModal'))
const ShortcutReferenceModal = lazy(() => import('../modals/utility/ShortcutReferenceModal'))
const DisputeModal = lazy(() => import('../modals/utility/DisputeModal'))
const InGameCalendarModal = lazy(() => import('../modals/utility/InGameCalendarModal'))
const ThemeSelector = lazy(() => import('../overlays/ThemeSelector'))
const ItemTradeModal = lazy(() => import('../modals/utility/ItemTradeModal'))
const SharedJournalModal = lazy(() => import('../modals/utility/SharedJournalModal'))
const CompendiumModal = lazy(() => import('../modals/utility/CompendiumModal'))
const PartyInventoryModal = lazy(() => import('../modals/utility/PartyInventoryModal'))
const EndOfSessionModal = lazy(() => import('../modals/utility/EndOfSessionModal'))
const SessionStartRecapModal = lazy(() => import('../modals/utility/SessionStartRecapModal'))
const CampaignQaModal = lazy(() => import('../modals/utility/CampaignQaModal'))
const DiceRoller = lazy(() => import('../dice3d/DiceRoller'))

interface UtilityModalsProps {
  activeModal: ActiveModal
  close: () => void
  effectiveIsDM: boolean
  character: Character | null
  playerName: string
  campaign: Campaign
  activeMap: GameMap | null
  broadcast: (message: string) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  disputeContext: { ruling: string; citation: string } | null
  setDisputeContext: (ctx: { ruling: string; citation: string } | null) => void
  localPeerId: string
  // PHASE-13 13H — deep-link targets for the compendium + shared journal.
  compendiumTarget?: { category: string; name: string } | null
  journalFocusEntryId?: string | null
}

export default function UtilityModals({
  activeModal,
  close,
  effectiveIsDM,
  character,
  playerName,
  campaign,
  activeMap,
  broadcast,
  sendMessage,
  disputeContext,
  setDisputeContext,
  localPeerId,
  compendiumTarget,
  journalFocusEntryId
}: UtilityModalsProps): JSX.Element {
  const gameStore = useGameStore()

  return (
    <Suspense fallback={null}>
      {activeModal === 'whisper' && <WhisperModal isDM={effectiveIsDM} senderName={playerName} onClose={close} />}

      {activeModal === 'help' && character && (
        <HelpModal
          character={character}
          tokens={activeMap?.tokens ?? []}
          attackerToken={character ? (activeMap?.tokens.find((t) => t.entityId === character.id) ?? null) : null}
          onClose={() => {
            close()
            if (character && gameStore.initiative) {
              gameStore.useAction(character.id)
            }
          }}
          onBroadcastResult={broadcast}
        />
      )}

      {activeModal === 'travelPace' && <TravelPaceModal onClose={close} />}

      {activeModal === 'timeEdit' && effectiveIsDM && campaign.calendar && (
        <TimeEditModal
          calendar={campaign.calendar}
          campaignId={campaign.id}
          onClose={close}
          onBroadcastTimeSync={(totalSeconds) => {
            sendMessage('dm:time-sync', { totalSeconds })
            const expired = gameStore.checkExpiredSources()
            for (const ls of expired) {
              broadcast(`${ls.entityName}'s ${ls.sourceName} goes out.`)
            }
          }}
        />
      )}

      {activeModal === 'commandRef' && <CommandReferenceModal isDM={effectiveIsDM} onClose={close} />}
      {activeModal === 'shortcutRef' && <ShortcutReferenceModal onClose={close} />}

      {activeModal === 'dispute' && disputeContext && (
        <DisputeModal
          ruling={disputeContext.ruling}
          citation={disputeContext.citation}
          onClose={() => {
            close()
            setDisputeContext(null)
          }}
          onUphold={() => {
            broadcast('DM upheld the AI ruling.')
            close()
            setDisputeContext(null)
          }}
          onOverride={(dmNote) => {
            const msg = dmNote ? `DM overrode AI ruling: ${dmNote}` : 'DM overrode the AI ruling.'
            broadcast(msg)
            close()
            setDisputeContext(null)
          }}
        />
      )}

      {activeModal === 'calendar' && campaign.calendar && (
        <InGameCalendarModal calendar={campaign.calendar} onClose={close} isDM={effectiveIsDM} />
      )}

      {activeModal === 'themeSelector' && <ThemeSelector onClose={close} />}

      {activeModal === 'itemTrade' && character && (
        <ItemTradeModal character={character} playerName={playerName} onClose={close} />
      )}

      {activeModal === 'sharedJournal' && (
        <SharedJournalModal
          isDM={effectiveIsDM}
          playerName={playerName}
          localPeerId={localPeerId}
          onClose={close}
          initialEntryId={journalFocusEntryId ?? undefined}
        />
      )}

      {activeModal === 'compendium' && (
        <CompendiumModal
          onClose={close}
          initialCategory={compendiumTarget?.category as LibraryCategory | undefined}
          initialQuery={compendiumTarget?.name}
        />
      )}

      {activeModal === 'partyInventory' && <PartyInventoryModal isDM={effectiveIsDM} onClose={close} />}

      {activeModal === 'recaps' && effectiveIsDM && <EndOfSessionModal open={true} onClose={close} onSkip={close} />}
      {activeModal === 'previouslyOn' && effectiveIsDM && <SessionStartRecapModal open={true} onClose={close} />}
      {activeModal === 'campaignQa' && effectiveIsDM && <CampaignQaModal open={true} onClose={close} />}

      {activeModal === 'diceRoller' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-border rounded-lg p-4 w-96 max-h-[80vh] overflow-y-auto relative">
            <button
              onClick={close}
              className="absolute top-2 end-2 text-muted hover:text-gray-200 cursor-pointer text-sm"
            >
              Close
            </button>
            <h2 className="text-lg font-bold text-accent mb-3">Dice Roller</h2>
            <DiceRoller system="dnd5e" rollerName={playerName} />
          </div>
        </div>
      )}
    </Suspense>
  )
}
