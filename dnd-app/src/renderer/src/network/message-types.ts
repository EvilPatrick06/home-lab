export const MESSAGE_TYPES = [
  'player:join',
  'player:ready',
  'player:leave',
  'player:character-select',
  'player:buy-item',
  'player:sell-item',
  'player:haggle-request',
  'dm:haggle-response',
  'game:state-update',
  'game:state-full',
  'game:dice-roll',
  'game:dice-result',
  'game:turn-advance',
  'game:opportunity-attack',
  'game:concentration-check',
  'game:map-ping',
  'game:dice-roll-3d',
  'game:dice-roll-hidden',
  'game:dice-reveal',
  'dm:map-change',
  'dm:fog-reveal',
  'dm:token-move',
  'dm:initiative-update',
  'dm:condition-update',
  'dm:kick-player',
  'dm:ban-player',
  'dm:unban-player',
  'dm:chat-timeout',
  'dm:promote-codm',
  'dm:demote-codm',
  'dm:game-start',
  'dm:game-end',
  'dm:character-update',
  'dm:shop-update',
  'dm:slow-mode',
  'dm:file-sharing',
  'dm:timer-start',
  'dm:timer-stop',
  'dm:whisper-player',
  'dm:time-share',
  'dm:time-sync',
  'dm:roll-request',
  'dm:loot-award',
  'dm:xp-award',
  'dm:handout',
  'dm:share-handout',
  'dm:narration',
  'dm:play-sound',
  'dm:play-ambient',
  'dm:stop-ambient',
  'dm:vision-update',
  'dm:drawing-add',
  'dm:drawing-remove',
  'dm:drawings-clear',
  'dm:region-add',
  'dm:region-remove',
  'dm:region-update',
  'chat:message',
  'chat:file',
  'chat:whisper',
  'chat:whisper-received',
  'chat:announcement',
  'player:color-change',
  'player:time-request',
  'player:turn-end',
  'player:roll-result',
  'player:move-declare',
  'player:typing',
  'ai:typing',
  'combat:reaction-prompt',
  'combat:reaction-response',
  'player:trade-request',
  'player:trade-response',
  'player:trade-cancel',
  'dm:trade-result',
  'player:journal-add',
  'player:journal-update',
  'player:journal-delete',
  'dm:journal-sync',
  'player:inspect-request',
  'dm:inspect-response',
  'dm:push-macros',
  'dm:light-source-update',
  'ping',
  'pong'
] as const

export type MessageType = (typeof MESSAGE_TYPES)[number]

export const KNOWN_MESSAGE_TYPES: ReadonlySet<string> = new Set<string>(MESSAGE_TYPES)

export interface NetworkMessage<T = unknown> {
  type: MessageType
  payload: T
  senderId: string
  senderName: string
  timestamp: number
  sequence: number
}

// Payload types for specific messages
export interface JoinPayload {
  displayName: string
  characterId: string | null
  characterName: string | null
  color?: string
  /** Game system ID the client supports (e.g. 'dnd5e'). Host rejects mismatches. */
  gameSystem?: string
}

export interface ChatPayload {
  message: string
  isSystem?: boolean
  isDiceRoll?: boolean
  diceResult?: { formula: string; total: number; rolls: number[] }
  /** When set, identifies the sender as a specific entity (e.g. 'ai-dm') instead of the host peer. */
  senderId?: string
  /** Display name override for the sender (e.g. 'AI Dungeon Master'). */
  senderName?: string
}

export interface WhisperPayload {
  message: string
  targetPeerId: string
  /** Filled by host when forwarding if the client omitted it. */
  targetName?: string
}

export interface DiceRollPayload {
  formula: string
  reason?: string
}

export interface DiceResultPayload {
  formula: string
  rolls: number[]
  total: number
  isCritical: boolean
  isFumble: boolean
  reason?: string
  rollerName: string
}

export interface StateUpdatePayload {
  path: string
  value: unknown
}

export interface TokenMovePayload {
  mapId: string
  tokenId: string
  gridX: number
  gridY: number
}

export interface FogRevealPayload {
  mapId: string
  cells: Array<{ x: number; y: number }>
  reveal: boolean
}

export interface MapChangePayload {
  mapId: string
  mapData?: import('./state-types').NetworkMap
}

export interface CharacterSelectPayload {
  characterId: string | null
  characterName: string | null
  characterData?: unknown
}

export interface InitiativeUpdatePayload {
  order: Array<{ id: string; name: string; initiative: number }>
  currentTurnIndex: number
}

export interface ConditionUpdatePayload {
  targetId: string
  condition: string
  active: boolean
}

export interface KickPayload {
  peerId: string
  reason?: string
}

export interface CharacterUpdatePayload {
  characterId: string
  characterData: unknown
  targetPeerId?: string
}

export interface ShopUpdatePayload {
  shopInventory: import('./state-types').ShopItem[]
  shopName?: string
}

export interface BuyItemPayload {
  itemId: string
  itemName: string
  price: { cp?: number; sp?: number; gp?: number; pp?: number }
}

export interface SellItemPayload {
  itemName: string
  price: { cp?: number; sp?: number; gp?: number; pp?: number }
}

export interface BanPayload {
  peerId: string
  reason?: string
}

export interface ChatTimeoutPayload {
  peerId: string
  duration: number // duration in seconds
}

export interface CoDMPayload {
  peerId: string
  isCoDM: boolean
}

export interface ColorChangePayload {
  color: string
}

export interface ChatFilePayload {
  fileName: string
  fileType: string
  fileData: string
  mimeType: string
  senderId: string
  senderName: string
}

export interface SlowModePayload {
  seconds: number
}

export interface FileSharingPayload {
  enabled: boolean
}

export interface TimerStartPayload {
  seconds: number
  targetName: string
}

export interface WhisperPlayerPayload {
  targetPeerId: string
  targetName: string
  message: string
}

export interface WhisperReceivedPayload {
  messageId: string
  originalSenderId: string
}

export interface TimeRequestPayload {
  requesterId: string
  requesterName: string
}

export interface TimeSharePayload {
  formattedTime: string
  targetPeerId?: string
  targetName?: string
}

export interface TimeSyncPayload {
  totalSeconds: number
}

export interface RollRequestPayload {
  id: string
  type: 'ability' | 'save' | 'skill'
  ability?: string
  skill?: string
  dc: number
  isSecret: boolean
  requesterId: string
  requesterName: string
}

export interface RollResultPayload {
  requestId: string
  entityId: string
  entityName: string
  roll: number
  modifier: number
  total: number
  success: boolean
}

export interface LootAwardPayload {
  targetPeerIds?: string[]
  items: Array<{ name: string; quantity: number }>
  currency?: { cp?: number; sp?: number; gp?: number; pp?: number }
}

export interface XpAwardPayload {
  targetPeerIds?: string[]
  xp: number
  reason?: string
}

export interface HandoutPayload {
  id: string
  title: string
  content: string
  imagePath?: string
  targetPeerIds?: string[]
}

export interface HandoutSharePayload {
  handout: import('../types/game-state').Handout
}

export interface AnnouncementPayload {
  message: string
  style?: 'info' | 'warning' | 'success' | 'dramatic'
}

export interface NarrationPayload {
  text: string
  style: 'chat' | 'dramatic'
}

export interface MapPingPayload {
  gridX: number
  gridY: number
  color?: string
  label?: string
}

export interface DiceRoll3dPayload {
  dice: Array<{ type: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'; count: number }>
  results: number[]
  total: number
  formula: string
  reason?: string
  rollerName: string
  isSecret?: boolean
}

export interface DiceRollHiddenPayload {
  formula: string
  diceCount: number
  dieSides: number[]
  rollerName: string
}

export interface DiceRevealPayload {
  formula: string
  rolls: number[]
  total: number
  rollerName: string
  label?: string
}

export interface TurnEndPayload {
  entityId: string
}

export interface MoveDeclarePayload {
  entityId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  path?: Array<{ x: number; y: number }>
}

export interface TypingPayload {
  isTyping: boolean
}

export interface HaggleRequestPayload {
  itemId: string
  itemName: string
  originalPrice: { cp?: number; sp?: number; gp?: number; pp?: number }
  persuasionRoll: number
  persuasionModifier: number
  persuasionTotal: number
}

export interface HaggleResponsePayload {
  itemId: string
  accepted: boolean
  discountPercent: number // 0-20
  newPrice?: { cp?: number; sp?: number; gp?: number; pp?: number }
  targetPeerId: string
}

export interface PlaySoundPayload {
  event: string
}

export interface PlayAmbientPayload {
  ambient: string
  volume?: number
}

export type StopAmbientPayload = Record<string, never>

export interface ReactionPromptPayload {
  promptId: string
  targetEntityId: string
  targetPeerId: string
  triggerType: 'shield' | 'counterspell' | 'absorb-elements' | 'silvery-barbs'
  triggerContext: {
    attackRoll?: number
    attackerName?: string
    spellName?: string
    spellLevel?: number
    damageType?: string
  }
}

export interface ReactionResponsePayload {
  promptId: string
  accepted: boolean
  spellSlotLevel?: number
}

export interface TradeRequestPayload {
  tradeId: string
  fromPeerId: string
  fromPlayerName: string
  toPeerId: string
  offeredItems: Array<{ name: string; quantity: number; description?: string }>
  offeredGold: number
  requestedItems: Array<{ name: string; quantity: number }>
  requestedGold: number
}

export interface TradeResponsePayload {
  tradeId: string
  accepted: boolean
  fromPeerId: string
}

export interface TradeCancelPayload {
  tradeId: string
  reason?: string
}

export interface TradeResultPayload {
  tradeId: string
  accepted: boolean
  fromPlayerName: string
  toPlayerName: string
  summary: string
}

export interface JournalAddPayload {
  entry: import('../types/game-state').SharedJournalEntry
}

export interface JournalUpdatePayload {
  entryId: string
  title?: string
  content?: string
  visibility?: 'public' | 'private'
  updatedAt: number
}

export interface JournalDeletePayload {
  entryId: string
}

export interface JournalSyncPayload {
  entries: import('../types/game-state').SharedJournalEntry[]
}

export interface InspectRequestPayload {
  characterId: string
  requesterPeerId: string
}

export interface InspectResponsePayload {
  characterId: string
  characterData: unknown
  targetPeerId: string
}

export interface MacroPushPayload {
  macros: Array<{ id: string; name: string; command: string; icon?: string; color?: string }>
}

export interface DrawingAddPayload {
  mapId: string
  drawing: {
    id: string
    type: string
    points: Array<{ x: number; y: number }>
    color: string
    strokeWidth: number
    text?: string
    visibleToPlayers?: boolean
    floor?: number
  }
}

export interface DrawingRemovePayload {
  mapId: string
  drawingId: string
}

export interface DrawingsClearPayload {
  mapId: string
}
