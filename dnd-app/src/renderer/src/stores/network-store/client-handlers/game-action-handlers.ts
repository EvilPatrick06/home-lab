import type {
  CharacterUpdatePayload,
  ChatTimeoutPayload,
  FileSharingPayload,
  HandoutPayload,
  HandoutSharePayload,
  JournalAddPayload,
  JournalDeletePayload,
  JournalSyncPayload,
  JournalUpdatePayload,
  NetworkMessage,
  ReactionPromptPayload,
  RollRequestPayload,
  SceneModePayload,
  ShopUpdatePayload,
  SlowModePayload,
  TimeSyncPayload,
  TradeCancelPayload,
  TradeRequestPayload,
  TradeResultPayload
} from '../../../network'
import type { SceneModeState } from '../../game/types'
import { useCharacterStore } from '../../use-character-store'
import { useGameStore } from '../../use-game-store'
import { useLobbyStore } from '../../use-lobby-store'
import { applyGameState } from './shared'

/** Self-contained DM action / game-action handlers (host -> client). Each reads
 *  only its message payload and drives a store directly — no get/set closure. */

export function handleSlowMode(message: NetworkMessage): void {
  const payload = message.payload as SlowModePayload
  useLobbyStore.getState().setSlowMode(payload.seconds)
}

export function handleFileSharing(message: NetworkMessage): void {
  const payload = message.payload as FileSharingPayload
  useLobbyStore.getState().setFileSharingEnabled(payload.enabled)
}

export function handleReactionPrompt(message: NetworkMessage): void {
  const payload = message.payload as ReactionPromptPayload
  useGameStore.getState().setPendingReactionPrompt({
    promptId: payload.promptId,
    targetEntityId: payload.targetEntityId,
    triggerType: payload.triggerType,
    triggerContext: payload.triggerContext
  })
}

export function handleTradeRequest(message: NetworkMessage): void {
  const payload = message.payload as TradeRequestPayload
  useGameStore.getState().setPendingTradeOffer(payload)
}

/** Phase 35 — host enters/updates/exits a cinematic scene; `scene: null` returns to the grid. */
export function handleSceneMode(message: NetworkMessage): void {
  const payload = message.payload as SceneModePayload
  useGameStore.getState().setSceneMode(payload.scene as SceneModeState | null)
}

export function handleTradeCancel(message: NetworkMessage): void {
  const _payload = message.payload as TradeCancelPayload
  useGameStore.getState().clearPendingTradeOffer()
}

export function handleTradeResult(message: NetworkMessage): void {
  const payload = message.payload as TradeResultPayload
  useGameStore.getState().setPendingTradeResult({
    tradeId: payload.tradeId,
    accepted: payload.accepted,
    summary: payload.summary
  })
  useGameStore.getState().clearPendingTradeOffer()
}

export function handleJournalAdd(message: NetworkMessage): void {
  const payload = message.payload as JournalAddPayload
  useGameStore.getState().addJournalEntry(payload.entry)
}

export function handleJournalUpdate(message: NetworkMessage): void {
  const payload = message.payload as JournalUpdatePayload
  const updates: Record<string, unknown> = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.content !== undefined) updates.content = payload.content
  if (payload.visibility !== undefined) updates.visibility = payload.visibility
  useGameStore
    .getState()
    .updateJournalEntry(
      payload.entryId,
      updates as Partial<
        Pick<import('../../../types/game-state').SharedJournalEntry, 'title' | 'content' | 'visibility'>
      >
    )
}

export function handleJournalDelete(message: NetworkMessage): void {
  const payload = message.payload as JournalDeletePayload
  useGameStore.getState().deleteJournalEntry(payload.entryId)
}

export function handleJournalSync(message: NetworkMessage): void {
  const payload = message.payload as JournalSyncPayload
  useGameStore.getState().setSharedJournal(payload.entries)
}

export function handleRollRequest(message: NetworkMessage): void {
  const payload = message.payload as RollRequestPayload
  useGameStore.getState().setPendingGroupRoll({
    id: payload.id ?? `roll-${Date.now()}`,
    type: payload.type,
    ability: payload.ability,
    skill: payload.skill,
    dc: payload.dc,
    isSecret: payload.isSecret,
    scope: 'all',
    targetEntityIds: []
  })
}

export function handleChatTimeout(message: NetworkMessage): void {
  const payload = message.payload as ChatTimeoutPayload
  useLobbyStore.getState().setChatMutedUntil(Date.now() + payload.duration * 1000)
}

export function handleTimeSync(message: NetworkMessage): void {
  const payload = message.payload as TimeSyncPayload
  applyGameState({ inGameTime: { totalSeconds: payload.totalSeconds } })
}

export function handleHandout(message: NetworkMessage): void {
  const payload = message.payload as HandoutPayload
  useGameStore.getState().addHandout({
    id: payload.id,
    title: payload.title,
    contentType: payload.imagePath ? 'image' : 'text',
    content: payload.imagePath || payload.content,
    visibility: 'all',
    createdAt: Date.now()
  })
}

export function handleShareHandout(message: NetworkMessage): void {
  const payload = message.payload as HandoutSharePayload
  useGameStore.getState().addHandout(payload.handout)
}

export function handleLightSourceUpdate(message: NetworkMessage): void {
  const payload = message.payload as Record<string, unknown>
  applyGameState(payload)
}

export function handleShopUpdate(message: NetworkMessage): void {
  const payload = message.payload as ShopUpdatePayload
  useGameStore.getState().setShopInventory(payload.shopInventory)
  if (payload.shopName) {
    useGameStore.getState().openShop(payload.shopName)
  }
}

export function handleCharacterUpdate(message: NetworkMessage): void {
  const payload = message.payload as CharacterUpdatePayload
  if (payload.characterData) {
    // Phase 23c — DUAL-WRITE CONTRACT (transitional until 23c-full removes
    // the lobby mirror):
    //   1. canonical: useCharacterStore.updateCharacterInState — the sheet
    //      reads this, so it's what makes DM edits show up live.
    //   2. legacy mirror: useLobbyStore.setRemoteCharacter — still read by
    //      ~29 call sites that haven't migrated off remoteCharacters yet.
    // Both MUST receive the same payload every time, or the two stores
    // diverge and a consumer reading the stale mirror shows wrong data.
    // The client-handlers spec asserts this invariant.
    const character = payload.characterData as import('../../../types/character-5e').Character5e
    useCharacterStore.getState().updateCharacterInState(payload.characterId, character)
    useLobbyStore.getState().setRemoteCharacter(payload.characterId, character)
  }
}
