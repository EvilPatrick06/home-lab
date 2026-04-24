import { z } from 'zod'
import {
  type AnnouncementPayload,
  type DiceRoll3dPayload,
  type DiceRollPayload,
  type HandoutPayload,
  type InitiativeUpdatePayload,
  type LootAwardPayload,
  type MapPingPayload,
  MESSAGE_TYPES,
  type MoveDeclarePayload,
  type ReactionResponsePayload,
  type StateUpdatePayload,
  type XpAwardPayload
} from './types'

// ── Envelope Schema ──

const MessageTypeSchema = z.enum(MESSAGE_TYPES)

const NetworkMessageEnvelopeSchema = z.object({
  type: MessageTypeSchema,
  payload: z.unknown(),
  senderId: z.string().max(100),
  senderName: z.string().max(100),
  timestamp: z.number(),
  sequence: z.number()
})

// ── Payload Schemas ──

const JoinPayloadSchema = z.object({
  displayName: z.string(),
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  color: z.string().optional()
})

const ChatPayloadSchema = z.object({
  message: z.string(),
  isSystem: z.boolean().optional(),
  isDiceRoll: z.boolean().optional(),
  diceResult: z
    .object({
      formula: z.string(),
      total: z.number(),
      rolls: z.array(z.number())
    })
    .optional(),
  // Optional overrides so AI DM messages arrive as "AI Dungeon Master" on all clients
  senderId: z.string().max(100).optional(),
  senderName: z.string().max(100).optional()
})

const WhisperPayloadSchema = z.object({
  message: z.string(),
  targetPeerId: z.string(),
  targetName: z.string()
})

const DiceRollPayloadSchema = z.object({
  formula: z.string(),
  reason: z.string().optional()
})

const DiceResultPayloadSchema = z.object({
  formula: z.string(),
  rolls: z.array(z.number()),
  total: z.number(),
  isCritical: z.boolean(),
  isFumble: z.boolean(),
  reason: z.string().optional(),
  rollerName: z.string()
})

const StateUpdatePayloadSchema = z.object({
  path: z.string(),
  value: z.unknown()
})

const TokenMovePayloadSchema = z.object({
  tokenId: z.string(),
  gridX: z.number(),
  gridY: z.number()
})

const FogRevealPayloadSchema = z.object({
  cells: z.array(z.object({ x: z.number(), y: z.number() })),
  reveal: z.boolean()
})

const MapChangePayloadSchema = z.object({
  mapId: z.string()
})

const CharacterSelectPayloadSchema = z.object({
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  characterData: z.unknown().optional()
})

const InitiativeUpdatePayloadSchema = z.object({
  order: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      initiative: z.number()
    })
  ),
  currentTurnIndex: z.number()
})

const ConditionUpdatePayloadSchema = z.object({
  targetId: z.string(),
  condition: z.string(),
  active: z.boolean()
})

const KickPayloadSchema = z.object({
  peerId: z.string(),
  reason: z.string().optional()
})

const BanPayloadSchema = z.object({
  peerId: z.string(),
  reason: z.string().optional()
})

const CharacterUpdatePayloadSchema = z.object({
  characterId: z.string(),
  characterData: z.unknown(),
  targetPeerId: z.string().optional()
})

const PriceSchema = z.object({
  cp: z.number().optional(),
  sp: z.number().optional(),
  gp: z.number().optional(),
  pp: z.number().optional()
})

const ShopItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  price: PriceSchema,
  quantity: z.number(),
  description: z.string().optional(),
  weight: z.number().optional(),
  bulk: z.number().optional(),
  shopCategory: z
    .enum(['weapon', 'armor', 'potion', 'scroll', 'wondrous', 'tool', 'adventuring', 'trade', 'other'])
    .optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']).optional(),
  stockLimit: z.number().optional(),
  stockRemaining: z.number().optional(),
  dmNotes: z.string().optional(),
  hiddenFromPlayerIds: z.array(z.string()).optional(),
  isHidden: z.boolean().optional()
})

const ShopUpdatePayloadSchema = z.object({
  shopInventory: z.array(ShopItemSchema),
  shopName: z.string().optional()
})

const BuyItemPayloadSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  price: PriceSchema
})

const SellItemPayloadSchema = z.object({
  itemName: z.string(),
  price: PriceSchema
})

const GameStateFullPayloadSchema = z.object({
  peers: z.array(
    z.object({
      peerId: z.string(),
      displayName: z.string(),
      characterId: z.string().nullable(),
      characterName: z.string().nullable(),
      isReady: z.boolean(),
      isHost: z.boolean(),
      color: z.string().optional(),
      isCoDM: z.boolean().optional()
    })
  ),
  campaignId: z.string().optional()
})

const ChatTimeoutPayloadSchema = z.object({
  peerId: z.string(),
  duration: z.number()
})

const CoDMPayloadSchema = z.object({
  peerId: z.string(),
  isCoDM: z.boolean()
})

const ColorChangePayloadSchema = z.object({
  color: z.string()
})

const ChatFilePayloadSchema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileData: z.string(),
  mimeType: z.string(),
  senderId: z.string(),
  senderName: z.string()
})

const SlowModePayloadSchema = z.object({
  seconds: z.number()
})

const FileSharingPayloadSchema = z.object({
  enabled: z.boolean()
})

const TimerStartPayloadSchema = z.object({
  seconds: z.number(),
  targetName: z.string()
})

const WhisperPlayerPayloadSchema = z.object({
  targetPeerId: z.string(),
  targetName: z.string(),
  message: z.string()
})

const TimeRequestPayloadSchema = z.object({
  requesterId: z.string(),
  requesterName: z.string()
})

const TimeSharePayloadSchema = z.object({
  formattedTime: z.string(),
  targetPeerId: z.string().optional(),
  targetName: z.string().optional()
})

const TimeSyncPayloadSchema = z.object({
  totalSeconds: z.number()
})

const RollRequestPayloadSchema = z.object({
  id: z.string(),
  type: z.enum(['ability', 'save', 'skill']),
  ability: z.string().optional(),
  skill: z.string().optional(),
  dc: z.number(),
  isSecret: z.boolean(),
  requesterId: z.string(),
  requesterName: z.string()
})

const RollResultPayloadSchema = z.object({
  requestId: z.string(),
  entityId: z.string(),
  entityName: z.string(),
  roll: z.number(),
  modifier: z.number(),
  total: z.number(),
  success: z.boolean()
})

const LootAwardPayloadSchema = z.object({
  targetPeerIds: z.array(z.string()).optional(),
  items: z.array(z.object({ name: z.string(), quantity: z.number() })),
  currency: PriceSchema.optional()
})

const XpAwardPayloadSchema = z.object({
  targetPeerIds: z.array(z.string()).optional(),
  xp: z.number(),
  reason: z.string().optional()
})

const HandoutPayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  imagePath: z.string().optional(),
  targetPeerIds: z.array(z.string()).optional()
})

const AnnouncementPayloadSchema = z.object({
  message: z.string(),
  style: z.enum(['info', 'warning', 'success', 'dramatic']).optional()
})

const MapPingPayloadSchema = z.object({
  gridX: z.number(),
  gridY: z.number(),
  color: z.string().optional(),
  label: z.string().optional()
})

const DiceRoll3dPayloadSchema = z.object({
  dice: z.array(
    z.object({
      type: z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']),
      count: z.number()
    })
  ),
  results: z.array(z.number()),
  total: z.number(),
  formula: z.string(),
  reason: z.string().optional(),
  rollerName: z.string(),
  isSecret: z.boolean().optional()
})

const TurnEndPayloadSchema = z.object({
  entityId: z.string()
})

const MoveDeclarePayloadSchema = z.object({
  entityId: z.string(),
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
  path: z.array(z.object({ x: z.number(), y: z.number() })).optional()
})

const TypingPayloadSchema = z.object({
  isTyping: z.boolean()
})

const NarrationPayloadSchema = z.object({
  text: z.string(),
  style: z.enum(['chat', 'dramatic'])
})

const PlaySoundPayloadSchema = z.object({
  event: z.string()
})

const PlayAmbientPayloadSchema = z.object({
  ambient: z.string(),
  volume: z.number().optional()
})

const StopAmbientPayloadSchema = z.object({})

const ReactionPromptPayloadSchema = z.object({
  promptId: z.string(),
  targetEntityId: z.string(),
  targetPeerId: z.string(),
  triggerType: z.enum(['shield', 'counterspell', 'absorb-elements', 'silvery-barbs']),
  triggerContext: z.object({
    attackRoll: z.number().optional(),
    attackerName: z.string().optional(),
    spellName: z.string().optional(),
    spellLevel: z.number().optional(),
    damageType: z.string().optional()
  })
})

const ReactionResponsePayloadSchema = z.object({
  promptId: z.string(),
  accepted: z.boolean(),
  spellSlotLevel: z.number().optional()
})

const TradeItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  description: z.string().optional()
})

const TradeRequestPayloadSchema = z.object({
  tradeId: z.string(),
  fromPeerId: z.string(),
  fromPlayerName: z.string(),
  toPeerId: z.string(),
  offeredItems: z.array(TradeItemSchema),
  offeredGold: z.number(),
  requestedItems: z.array(z.object({ name: z.string(), quantity: z.number() })),
  requestedGold: z.number()
})

const TradeResponsePayloadSchema = z.object({
  tradeId: z.string(),
  accepted: z.boolean(),
  fromPeerId: z.string()
})

const TradeCancelPayloadSchema = z.object({
  tradeId: z.string(),
  reason: z.string().optional()
})

const TradeResultPayloadSchema = z.object({
  tradeId: z.string(),
  accepted: z.boolean(),
  fromPlayerName: z.string(),
  toPlayerName: z.string(),
  summary: z.string()
})

const SharedJournalEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorPeerId: z.string(),
  authorName: z.string(),
  visibility: z.enum(['public', 'private']),
  createdAt: z.number(),
  updatedAt: z.number()
})

const JournalAddPayloadSchema = z.object({
  entry: SharedJournalEntrySchema
})

const JournalUpdatePayloadSchema = z.object({
  entryId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  updatedAt: z.number()
})

const JournalDeletePayloadSchema = z.object({
  entryId: z.string()
})

const JournalSyncPayloadSchema = z.object({
  entries: z.array(SharedJournalEntrySchema)
})

const InspectRequestPayloadSchema = z.object({
  characterId: z.string(),
  requesterPeerId: z.string()
})

const InspectResponsePayloadSchema = z.object({
  characterId: z.string(),
  characterData: z.unknown(),
  targetPeerId: z.string()
})

// Generic passthrough for messages with no specific payload structure
const AnyPayloadSchema = z.unknown()

// ── Payload Registry ──

type MessageTypeString = (typeof MESSAGE_TYPES)[number]

const PAYLOAD_SCHEMAS: Partial<Record<MessageTypeString, z.ZodType>> = {
  'player:join': JoinPayloadSchema,
  'player:character-select': CharacterSelectPayloadSchema,
  'player:buy-item': BuyItemPayloadSchema,
  'player:sell-item': SellItemPayloadSchema,
  'player:color-change': ColorChangePayloadSchema,
  'player:time-request': TimeRequestPayloadSchema,
  'player:turn-end': TurnEndPayloadSchema,
  'player:roll-result': RollResultPayloadSchema,
  'player:move-declare': MoveDeclarePayloadSchema,
  'player:typing': TypingPayloadSchema,
  'game:state-update': StateUpdatePayloadSchema,
  'game:state-full': GameStateFullPayloadSchema,
  'game:dice-roll': DiceRollPayloadSchema,
  'game:dice-result': DiceResultPayloadSchema,
  'game:map-ping': MapPingPayloadSchema,
  'game:dice-roll-3d': DiceRoll3dPayloadSchema,
  'dm:map-change': MapChangePayloadSchema,
  'dm:fog-reveal': FogRevealPayloadSchema,
  'dm:token-move': TokenMovePayloadSchema,
  'dm:initiative-update': InitiativeUpdatePayloadSchema,
  'dm:condition-update': ConditionUpdatePayloadSchema,
  'dm:kick-player': KickPayloadSchema,
  'dm:ban-player': BanPayloadSchema,
  'dm:chat-timeout': ChatTimeoutPayloadSchema,
  'dm:promote-codm': CoDMPayloadSchema,
  'dm:demote-codm': CoDMPayloadSchema,
  'dm:character-update': CharacterUpdatePayloadSchema,
  'dm:shop-update': ShopUpdatePayloadSchema,
  'dm:slow-mode': SlowModePayloadSchema,
  'dm:file-sharing': FileSharingPayloadSchema,
  'dm:timer-start': TimerStartPayloadSchema,
  'dm:whisper-player': WhisperPlayerPayloadSchema,
  'dm:time-share': TimeSharePayloadSchema,
  'dm:time-sync': TimeSyncPayloadSchema,
  'dm:roll-request': RollRequestPayloadSchema,
  'dm:loot-award': LootAwardPayloadSchema,
  'dm:xp-award': XpAwardPayloadSchema,
  'dm:handout': HandoutPayloadSchema,
  'dm:narration': NarrationPayloadSchema,
  'dm:play-sound': PlaySoundPayloadSchema,
  'dm:play-ambient': PlayAmbientPayloadSchema,
  'dm:stop-ambient': StopAmbientPayloadSchema,
  'chat:message': ChatPayloadSchema,
  'chat:file': ChatFilePayloadSchema,
  'chat:whisper': WhisperPayloadSchema,
  'chat:announcement': AnnouncementPayloadSchema,
  'combat:reaction-prompt': ReactionPromptPayloadSchema,
  'combat:reaction-response': ReactionResponsePayloadSchema,
  'player:trade-request': TradeRequestPayloadSchema,
  'player:trade-response': TradeResponsePayloadSchema,
  'player:trade-cancel': TradeCancelPayloadSchema,
  'dm:trade-result': TradeResultPayloadSchema,
  'player:journal-add': JournalAddPayloadSchema,
  'player:journal-update': JournalUpdatePayloadSchema,
  'player:journal-delete': JournalDeletePayloadSchema,
  'dm:journal-sync': JournalSyncPayloadSchema,
  'player:inspect-request': InspectRequestPayloadSchema,
  'dm:inspect-response': InspectResponsePayloadSchema
}

// ── Validation Function ──

export type ValidationResult =
  | { success: true; message: z.infer<typeof NetworkMessageEnvelopeSchema> }
  | { success: false; error: string }

/**
 * Validate an incoming network message.
 * Returns the validated message envelope if valid, or an error string.
 */
export function validateNetworkMessage(raw: unknown): ValidationResult {
  // Step 1: Validate envelope structure
  const envelopeResult = NetworkMessageEnvelopeSchema.safeParse(raw)
  if (!envelopeResult.success) {
    return {
      success: false,
      error: `Invalid message envelope: ${envelopeResult.error.issues[0]?.message ?? 'unknown'}`
    }
  }

  const msg = envelopeResult.data

  // Step 2: Validate payload if schema exists for this message type
  const payloadSchema = PAYLOAD_SCHEMAS[msg.type as MessageTypeString]
  if (payloadSchema) {
    const payloadResult = payloadSchema.safeParse(msg.payload)
    if (!payloadResult.success) {
      return {
        success: false,
        error: `Invalid ${msg.type} payload: ${payloadResult.error.issues[0]?.message ?? 'unknown'}`
      }
    }
  }

  return { success: true, message: msg }
}

// ── Type compatibility checks ──
// Ensure Zod schemas produce types assignable to the TS payload interfaces.
// These are compile-time only assertions, no runtime cost.
type AssertAssignable<_Target, Source extends _Target> = Source

type _CheckDiceRoll = AssertAssignable<DiceRollPayload, z.infer<typeof DiceRollPayloadSchema>>
type _CheckStateUpdate = AssertAssignable<StateUpdatePayload, z.infer<typeof StateUpdatePayloadSchema>>
type _CheckInitiativeUpdate = AssertAssignable<InitiativeUpdatePayload, z.infer<typeof InitiativeUpdatePayloadSchema>>
type _CheckLootAward = AssertAssignable<LootAwardPayload, z.infer<typeof LootAwardPayloadSchema>>
type _CheckXpAward = AssertAssignable<XpAwardPayload, z.infer<typeof XpAwardPayloadSchema>>
type _CheckHandout = AssertAssignable<HandoutPayload, z.infer<typeof HandoutPayloadSchema>>
type _CheckAnnouncement = AssertAssignable<AnnouncementPayload, z.infer<typeof AnnouncementPayloadSchema>>
type _CheckMapPing = AssertAssignable<MapPingPayload, z.infer<typeof MapPingPayloadSchema>>
type _CheckDiceRoll3d = AssertAssignable<DiceRoll3dPayload, z.infer<typeof DiceRoll3dPayloadSchema>>
type _CheckMoveDeclare = AssertAssignable<MoveDeclarePayload, z.infer<typeof MoveDeclarePayloadSchema>>
type _CheckReactionResponse = AssertAssignable<ReactionResponsePayload, z.infer<typeof ReactionResponsePayloadSchema>>

// Export for testing
export { NetworkMessageEnvelopeSchema, PAYLOAD_SCHEMAS, AnyPayloadSchema }
