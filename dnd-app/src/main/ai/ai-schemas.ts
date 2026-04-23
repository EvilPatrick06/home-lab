// ── Zod schemas for AI DM structured output ──
// Provides runtime validation for [STAT_CHANGES] and [DM_ACTIONS] JSON blocks.

import { z } from 'zod'

// ── JSON Repair ──

/**
 * Attempt to repair common JSON malformations from LLM output:
 * - Markdown code fences wrapping JSON
 * - Trailing commas before closing brackets/braces
 * - JavaScript-style comments
 */
export function repairJson(raw: string): string {
  let s = raw

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')

  // Remove single-line JS comments (// ...) that aren't inside strings.
  // Heuristic: only strip lines that are *entirely* a comment or where the
  // comment follows a comma/bracket (common LLM mistake).
  s = s.replace(/,\s*\/\/[^\n]*/g, ',')
  s = s.replace(/^\s*\/\/[^\n]*$/gm, '')

  // Trailing commas: ,] or ,}
  s = s.replace(/,\s*([\]}])/g, '$1')

  return s.trim()
}

// ── Shared enums ──

const EntityTypeSchema = z.enum(['player', 'npc', 'enemy'])
const AmbientLightSchema = z.enum(['bright', 'dim', 'darkness'])
const AbilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const DenominationSchema = z.enum(['cp', 'sp', 'gp', 'pp', 'ep'])
const AttitudeSchema = z.enum(['friendly', 'indifferent', 'hostile'])
const NpcDispositionSchema = z.enum(['friendly', 'neutral', 'hostile'])
const SidebarCategorySchema = z.enum(['allies', 'enemies', 'places'])
const AreaShapeSchema = z.enum(['sphere', 'cone', 'line', 'cube', 'cylinder', 'emanation'])
const TravelPaceSchema = z.enum(['fast', 'normal', 'slow']).nullable()

// ── Stat Change Schemas ──

const BaseCharacterChange = { characterName: z.string().optional(), reason: z.string() }

const DamageSchema = z.object({
  type: z.literal('damage'),
  ...BaseCharacterChange,
  value: z.number(),
  damageType: z.string().optional()
})

const HealSchema = z.object({
  type: z.literal('heal'),
  ...BaseCharacterChange,
  value: z.number()
})

const TempHpSchema = z.object({
  type: z.literal('temp_hp'),
  ...BaseCharacterChange,
  value: z.number()
})

const AddConditionSchema = z.object({
  type: z.literal('add_condition'),
  ...BaseCharacterChange,
  name: z.string()
})

const RemoveConditionSchema = z.object({
  type: z.literal('remove_condition'),
  ...BaseCharacterChange,
  name: z.string()
})

const DeathSaveSchema = z.object({
  type: z.literal('death_save'),
  ...BaseCharacterChange,
  success: z.boolean()
})

const ResetDeathSavesSchema = z.object({
  type: z.literal('reset_death_saves'),
  ...BaseCharacterChange
})

const ExpendSpellSlotSchema = z.object({
  type: z.literal('expend_spell_slot'),
  ...BaseCharacterChange,
  level: z.number()
})

const RestoreSpellSlotSchema = z.object({
  type: z.literal('restore_spell_slot'),
  ...BaseCharacterChange,
  level: z.number(),
  count: z.number().optional()
})

const AddItemSchema = z.object({
  type: z.literal('add_item'),
  ...BaseCharacterChange,
  name: z.string(),
  quantity: z.number().optional(),
  description: z.string().optional()
})

const RemoveItemSchema = z.object({
  type: z.literal('remove_item'),
  ...BaseCharacterChange,
  name: z.string(),
  quantity: z.number().optional()
})

const GoldSchema = z.object({
  type: z.literal('gold'),
  ...BaseCharacterChange,
  value: z.number(),
  denomination: DenominationSchema.optional()
})

const XpSchema = z.object({
  type: z.literal('xp'),
  ...BaseCharacterChange,
  value: z.number()
})

const UseClassResourceSchema = z.object({
  type: z.literal('use_class_resource'),
  ...BaseCharacterChange,
  name: z.string(),
  amount: z.number().optional()
})

const RestoreClassResourceSchema = z.object({
  type: z.literal('restore_class_resource'),
  ...BaseCharacterChange,
  name: z.string(),
  amount: z.number().optional()
})

const HeroicInspirationSchema = z.object({
  type: z.literal('heroic_inspiration'),
  ...BaseCharacterChange,
  grant: z.boolean()
})

const HitDiceSchema = z.object({
  type: z.literal('hit_dice'),
  ...BaseCharacterChange,
  value: z.number()
})

const NpcAttitudeSchema = z.object({
  type: z.literal('npc_attitude'),
  name: z.string(),
  attitude: AttitudeSchema,
  reason: z.string()
})

const SetAbilityScoreSchema = z.object({
  type: z.literal('set_ability_score'),
  ...BaseCharacterChange,
  ability: AbilitySchema,
  value: z.number()
})

const GrantFeatureSchema = z.object({
  type: z.literal('grant_feature'),
  ...BaseCharacterChange,
  name: z.string(),
  description: z.string().optional()
})

const RevokeFeatureSchema = z.object({
  type: z.literal('revoke_feature'),
  ...BaseCharacterChange,
  name: z.string()
})

const CreatureDamageSchema = z.object({
  type: z.literal('creature_damage'),
  targetLabel: z.string(),
  value: z.number(),
  damageType: z.string().optional(),
  reason: z.string()
})

const CreatureHealSchema = z.object({
  type: z.literal('creature_heal'),
  targetLabel: z.string(),
  value: z.number(),
  reason: z.string()
})

const CreatureAddConditionSchema = z.object({
  type: z.literal('creature_add_condition'),
  targetLabel: z.string(),
  name: z.string(),
  reason: z.string()
})

const CreatureRemoveConditionSchema = z.object({
  type: z.literal('creature_remove_condition'),
  targetLabel: z.string(),
  name: z.string(),
  reason: z.string()
})

const CreatureKillSchema = z.object({
  type: z.literal('creature_kill'),
  targetLabel: z.string(),
  reason: z.string()
})

const ReduceExhaustionSchema = z.object({
  type: z.literal('reduce_exhaustion'),
  characterName: z.string().optional(),
  reason: z.string()
})

export const StatChangeSchema = z.discriminatedUnion('type', [
  DamageSchema,
  HealSchema,
  TempHpSchema,
  AddConditionSchema,
  RemoveConditionSchema,
  DeathSaveSchema,
  ResetDeathSavesSchema,
  ExpendSpellSlotSchema,
  RestoreSpellSlotSchema,
  AddItemSchema,
  RemoveItemSchema,
  GoldSchema,
  XpSchema,
  UseClassResourceSchema,
  RestoreClassResourceSchema,
  HeroicInspirationSchema,
  HitDiceSchema,
  NpcAttitudeSchema,
  SetAbilityScoreSchema,
  GrantFeatureSchema,
  RevokeFeatureSchema,
  CreatureDamageSchema,
  CreatureHealSchema,
  CreatureAddConditionSchema,
  CreatureRemoveConditionSchema,
  CreatureKillSchema,
  ReduceExhaustionSchema
])

export const StatChangesBlockSchema = z.object({
  changes: z.array(z.unknown())
})

// ── DM Action Schemas ──

const PlaceTokenSchema = z.object({
  action: z.literal('place_token'),
  label: z.string(),
  entityType: EntityTypeSchema,
  gridX: z.number(),
  gridY: z.number(),
  sizeX: z.number().optional(),
  sizeY: z.number().optional(),
  hp: z.number().optional(),
  ac: z.number().optional(),
  speed: z.number().optional(),
  conditions: z.array(z.string()).optional(),
  visibleToPlayers: z.boolean().optional()
})

const MoveTokenSchema = z.object({
  action: z.literal('move_token'),
  label: z.string(),
  gridX: z.number(),
  gridY: z.number()
})

const RemoveTokenSchema = z.object({
  action: z.literal('remove_token'),
  label: z.string()
})

const UpdateTokenSchema = z.object({
  action: z.literal('update_token'),
  label: z.string(),
  hp: z.number().optional(),
  ac: z.number().optional(),
  conditions: z.array(z.string()).optional(),
  visibleToPlayers: z.boolean().optional(),
  label_new: z.string().optional()
})

const PlaceCreatureSchema = z.object({
  action: z.literal('place_creature'),
  creatureName: z.string().optional(),
  creatureId: z.string().optional(),
  label: z.string().optional(),
  entityType: EntityTypeSchema.optional(),
  gridX: z.number(),
  gridY: z.number(),
  visibleToPlayers: z.boolean().optional()
})

const InitiativeEntrySchema = z.object({
  label: z.string(),
  roll: z.number(),
  modifier: z.number(),
  entityType: EntityTypeSchema
})

const StartInitiativeSchema = z.object({
  action: z.literal('start_initiative'),
  entries: z.array(InitiativeEntrySchema)
})

const AddToInitiativeSchema = z.object({
  action: z.literal('add_to_initiative'),
  label: z.string(),
  roll: z.number(),
  modifier: z.number(),
  entityType: EntityTypeSchema
})

const NextTurnSchema = z.object({ action: z.literal('next_turn') })
const EndInitiativeSchema = z.object({ action: z.literal('end_initiative') })

const RemoveFromInitiativeSchema = z.object({
  action: z.literal('remove_from_initiative'),
  label: z.string()
})

const RevealFogSchema = z.object({
  action: z.literal('reveal_fog'),
  cells: z.array(z.object({ x: z.number(), y: z.number() }))
})

const HideFogSchema = z.object({
  action: z.literal('hide_fog'),
  cells: z.array(z.object({ x: z.number(), y: z.number() }))
})

const SetAmbientLightDmSchema = z.object({
  action: z.literal('set_ambient_light'),
  level: AmbientLightSchema
})

const SetUnderwaterCombatSchema = z.object({
  action: z.literal('set_underwater_combat'),
  enabled: z.boolean()
})

const SetTravelPaceSchema = z.object({
  action: z.literal('set_travel_pace'),
  pace: TravelPaceSchema
})

const ShopPriceSchema = z.object({
  gp: z.number().optional(),
  sp: z.number().optional(),
  cp: z.number().optional()
})

const ShopItemSchema = z.object({
  name: z.string(),
  category: z.string(),
  price: ShopPriceSchema,
  quantity: z.number(),
  description: z.string().optional()
})

const OpenShopSchema = z.object({
  action: z.literal('open_shop'),
  name: z.string().optional(),
  items: z.array(ShopItemSchema).optional()
})

const CloseShopSchema = z.object({ action: z.literal('close_shop') })

const AddShopItemSchema = z.object({
  action: z.literal('add_shop_item'),
  name: z.string(),
  category: z.string(),
  price: ShopPriceSchema,
  quantity: z.number(),
  description: z.string().optional()
})

const RemoveShopItemSchema = z.object({
  action: z.literal('remove_shop_item'),
  name: z.string()
})

const SwitchMapSchema = z.object({
  action: z.literal('switch_map'),
  mapName: z.string()
})

const AddSidebarEntrySchema = z.object({
  action: z.literal('add_sidebar_entry'),
  category: SidebarCategorySchema,
  name: z.string(),
  description: z.string().optional(),
  visibleToPlayers: z.boolean().optional()
})

const RemoveSidebarEntrySchema = z.object({
  action: z.literal('remove_sidebar_entry'),
  category: SidebarCategorySchema,
  name: z.string()
})

const StartTimerSchema = z.object({
  action: z.literal('start_timer'),
  seconds: z.number(),
  targetName: z.string()
})

const StopTimerSchema = z.object({ action: z.literal('stop_timer') })

const HiddenDiceRollSchema = z.object({
  action: z.literal('hidden_dice_roll'),
  formula: z.string(),
  reason: z.string()
})

const WhisperPlayerSchema = z.object({
  action: z.literal('whisper_player'),
  playerName: z.string(),
  message: z.string()
})

const SystemMessageSchema = z.object({
  action: z.literal('system_message'),
  message: z.string()
})

const AddEntityConditionSchema = z.object({
  action: z.literal('add_entity_condition'),
  entityLabel: z.string(),
  condition: z.string(),
  duration: z.union([z.number(), z.literal('permanent')]).optional(),
  source: z.string().optional(),
  value: z.number().optional()
})

const RemoveEntityConditionSchema = z.object({
  action: z.literal('remove_entity_condition'),
  entityLabel: z.string(),
  condition: z.string()
})

const ShortRestSchema = z.object({
  action: z.literal('short_rest'),
  characterNames: z.array(z.string())
})

const LongRestSchema = z.object({
  action: z.literal('long_rest'),
  characterNames: z.array(z.string())
})

const ApplyAreaEffectSchema = z.object({
  action: z.literal('apply_area_effect'),
  shape: AreaShapeSchema,
  originX: z.number(),
  originY: z.number(),
  radiusOrLength: z.number(),
  widthOrHeight: z.number().optional(),
  damageFormula: z.string().optional(),
  damageType: z.string().optional(),
  saveType: AbilitySchema.optional(),
  saveDC: z.number().optional(),
  halfOnSave: z.boolean().optional(),
  condition: z.string().optional(),
  conditionDuration: z.union([z.number(), z.literal('permanent')]).optional()
})

const UseLegendaryActionSchema = z.object({
  action: z.literal('use_legendary_action'),
  entityLabel: z.string(),
  actionName: z.string(),
  cost: z.number().optional()
})

const UseLegendaryResistanceSchema = z.object({
  action: z.literal('use_legendary_resistance'),
  entityLabel: z.string()
})

const RechargeRollSchema = z.object({
  action: z.literal('recharge_roll'),
  entityLabel: z.string(),
  abilityName: z.string(),
  rechargeOn: z.number()
})

const AdvanceTimeSchema = z.object({
  action: z.literal('advance_time'),
  seconds: z.number().optional(),
  minutes: z.number().optional(),
  hours: z.number().optional(),
  days: z.number().optional()
})

const SetTimeSchema = z.object({
  action: z.literal('set_time'),
  hour: z.number().optional(),
  minute: z.number().optional(),
  totalSeconds: z.number().optional()
})

const ShareTimeSchema = z.object({
  action: z.literal('share_time'),
  target: z.enum(['all', 'requester']).optional(),
  message: z.string().optional()
})

const SoundEffectSchema = z.object({
  action: z.literal('sound_effect'),
  sound: z.string()
})

const PlayAmbientSchema = z.object({
  action: z.literal('play_ambient'),
  loop: z.string()
})

const StopAmbientSchema = z.object({ action: z.literal('stop_ambient') })

const AddJournalEntrySchema = z.object({
  action: z.literal('add_journal_entry'),
  content: z.string(),
  label: z.string().optional()
})

const SetWeatherSchema = z.object({
  action: z.literal('set_weather'),
  description: z.string(),
  temperature: z.number().optional(),
  temperatureUnit: z.enum(['F', 'C']).optional(),
  windSpeed: z.string().optional(),
  mechanicalEffects: z.array(z.string()).optional()
})

const ClearWeatherSchema = z.object({ action: z.literal('clear_weather') })
const SetMoonSchema = z.object({ action: z.literal('set_moon'), phase: z.string() })

const AwardXpSchema = z.object({
  action: z.literal('award_xp'),
  characterNames: z.array(z.string()),
  amount: z.number(),
  reason: z.string().optional()
})

const TriggerLevelUpSchema = z.object({
  action: z.literal('trigger_level_up'),
  characterName: z.string()
})

const BastionAdvanceTimeSchema = z.object({
  action: z.literal('bastion_advance_time'),
  bastionOwner: z.string(),
  days: z.number()
})

const BastionIssueOrderSchema = z.object({
  action: z.literal('bastion_issue_order'),
  bastionOwner: z.string(),
  facilityName: z.string(),
  orderType: z.string(),
  details: z.string().optional()
})

const BastionDepositGoldSchema = z.object({
  action: z.literal('bastion_deposit_gold'),
  bastionOwner: z.string(),
  amount: z.number()
})

const BastionWithdrawGoldSchema = z.object({
  action: z.literal('bastion_withdraw_gold'),
  bastionOwner: z.string(),
  amount: z.number()
})

const BastionResolveEventSchema = z.object({
  action: z.literal('bastion_resolve_event'),
  bastionOwner: z.string(),
  eventType: z.string()
})

const BastionRecruitSchema = z.object({
  action: z.literal('bastion_recruit'),
  bastionOwner: z.string(),
  facilityName: z.string(),
  names: z.array(z.string())
})

const BastionAddCreatureSchema = z.object({
  action: z.literal('bastion_add_creature'),
  bastionOwner: z.string(),
  facilityName: z.string(),
  creatureName: z.string()
})

const LoadEncounterSchema = z.object({
  action: z.literal('load_encounter'),
  encounterName: z.string()
})

const SetNpcAttitudeActionSchema = z.object({
  action: z.literal('set_npc_attitude'),
  npcName: z.string(),
  attitude: z.enum(['friendly', 'indifferent', 'hostile']),
  reason: z.string().optional()
})

const LogNpcInteractionSchema = z.object({
  action: z.literal('log_npc_interaction'),
  npcName: z.string(),
  summary: z.string(),
  attitudeAfter: NpcDispositionSchema
})

const SetNpcRelationshipSchema = z.object({
  action: z.literal('set_npc_relationship'),
  npcName: z.string(),
  targetNpcName: z.string(),
  relationship: z.string(),
  disposition: NpcDispositionSchema
})

const ShareHandoutSchema = z.object({
  action: z.literal('share_handout'),
  title: z.string(),
  content: z.string(),
  contentType: z.enum(['text', 'image']).optional()
})

/**
 * All known DM action schemas keyed by action name.
 * Used for individual validation when discriminatedUnion can't match.
 */
const DM_ACTION_SCHEMAS: Record<string, z.ZodType> = {
  place_token: PlaceTokenSchema,
  move_token: MoveTokenSchema,
  remove_token: RemoveTokenSchema,
  update_token: UpdateTokenSchema,
  place_creature: PlaceCreatureSchema,
  start_initiative: StartInitiativeSchema,
  add_to_initiative: AddToInitiativeSchema,
  next_turn: NextTurnSchema,
  end_initiative: EndInitiativeSchema,
  remove_from_initiative: RemoveFromInitiativeSchema,
  reveal_fog: RevealFogSchema,
  hide_fog: HideFogSchema,
  set_ambient_light: SetAmbientLightDmSchema,
  set_underwater_combat: SetUnderwaterCombatSchema,
  set_travel_pace: SetTravelPaceSchema,
  open_shop: OpenShopSchema,
  close_shop: CloseShopSchema,
  add_shop_item: AddShopItemSchema,
  remove_shop_item: RemoveShopItemSchema,
  switch_map: SwitchMapSchema,
  add_sidebar_entry: AddSidebarEntrySchema,
  remove_sidebar_entry: RemoveSidebarEntrySchema,
  start_timer: StartTimerSchema,
  stop_timer: StopTimerSchema,
  hidden_dice_roll: HiddenDiceRollSchema,
  whisper_player: WhisperPlayerSchema,
  system_message: SystemMessageSchema,
  add_entity_condition: AddEntityConditionSchema,
  remove_entity_condition: RemoveEntityConditionSchema,
  short_rest: ShortRestSchema,
  long_rest: LongRestSchema,
  apply_area_effect: ApplyAreaEffectSchema,
  use_legendary_action: UseLegendaryActionSchema,
  use_legendary_resistance: UseLegendaryResistanceSchema,
  recharge_roll: RechargeRollSchema,
  advance_time: AdvanceTimeSchema,
  set_time: SetTimeSchema,
  share_time: ShareTimeSchema,
  sound_effect: SoundEffectSchema,
  play_ambient: PlayAmbientSchema,
  stop_ambient: StopAmbientSchema,
  add_journal_entry: AddJournalEntrySchema,
  set_weather: SetWeatherSchema,
  clear_weather: ClearWeatherSchema,
  set_moon: SetMoonSchema,
  award_xp: AwardXpSchema,
  trigger_level_up: TriggerLevelUpSchema,
  bastion_advance_time: BastionAdvanceTimeSchema,
  bastion_issue_order: BastionIssueOrderSchema,
  bastion_deposit_gold: BastionDepositGoldSchema,
  bastion_withdraw_gold: BastionWithdrawGoldSchema,
  bastion_resolve_event: BastionResolveEventSchema,
  bastion_recruit: BastionRecruitSchema,
  bastion_add_creature: BastionAddCreatureSchema,
  load_encounter: LoadEncounterSchema,
  set_npc_attitude: SetNpcAttitudeActionSchema,
  log_npc_interaction: LogNpcInteractionSchema,
  set_npc_relationship: SetNpcRelationshipSchema,
  share_handout: ShareHandoutSchema
}

export const DmActionsBlockSchema = z.object({
  actions: z.array(z.unknown())
})

// ── Validation Results ──

export interface ValidationIssue {
  index: number
  input: unknown
  errors: string[]
}

/**
 * Validate an array of raw stat-change objects, returning valid items and issues.
 * Invalid items are rejected with error details rather than silently dropped.
 */
export function validateStatChanges(items: unknown[]): {
  valid: z.infer<typeof StatChangeSchema>[]
  issues: ValidationIssue[]
} {
  const valid: z.infer<typeof StatChangeSchema>[] = []
  const issues: ValidationIssue[] = []

  for (let i = 0; i < items.length; i++) {
    const result = StatChangeSchema.safeParse(items[i])
    if (result.success) {
      valid.push(result.data)
    } else {
      issues.push({
        index: i,
        input: items[i],
        errors: result.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`)
      })
    }
  }

  return { valid, issues }
}

/**
 * Validate a single DM action using the schema for its action type.
 * Falls back to a minimal check (has string `action` field) for
 * plugin-prefixed actions or truly unknown types.
 */
export function validateDmAction(item: unknown): z.SafeParseReturnType<unknown, unknown> {
  if (!item || typeof item !== 'object' || !('action' in item)) {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['action'], message: 'Missing action field' }])
    } as z.SafeParseError<unknown>
  }

  const actionName = (item as { action: unknown }).action
  if (typeof actionName !== 'string') {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['action'], message: 'action must be a string' }])
    } as z.SafeParseError<unknown>
  }

  // Plugin actions bypass schema validation
  if (actionName.startsWith('plugin:')) {
    return { success: true, data: item } as z.SafeParseSuccess<unknown>
  }

  const schema = DM_ACTION_SCHEMAS[actionName]
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['action'], message: `Unknown action type: ${actionName}` }])
    } as z.SafeParseError<unknown>
  }

  return schema.safeParse(item)
}

/**
 * Validate an array of raw DM action objects, returning valid items and issues.
 */
export function validateDmActions(items: unknown[]): {
  valid: Array<{ action: string; [key: string]: unknown }>
  issues: ValidationIssue[]
} {
  const valid: Array<{ action: string; [key: string]: unknown }> = []
  const issues: ValidationIssue[] = []

  for (let i = 0; i < items.length; i++) {
    const result = validateDmAction(items[i])
    if (result.success) {
      valid.push(result.data as { action: string; [key: string]: unknown })
    } else {
      issues.push({
        index: i,
        input: items[i],
        errors:
          'error' in result
            ? result.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`)
            : ['Unknown validation error']
      })
    }
  }

  return { valid, issues }
}
