// ── Zod schemas for AI DM structured output ──
// Provides runtime validation for [STAT_CHANGES] and [DM_ACTIONS] JSON blocks.

import { z } from 'zod'

// ── JSON Repair ──

// PHASE-23 23F: usage telemetry so repairJson retirement is measurable, not
// speculative. repairJson is deletable once (a) structuredExtraction:'always' is
// the default, (b) the narration prompt no longer instructs tag emission, and
// (c) `modified` stays at zero across releases. The structured path NEVER calls it
// (structured-extraction.ts rule); this serves the legacy tag path only.
let repairInvocations = 0
let repairModifications = 0

/** Telemetry counters for repairJson usage (PHASE-23 23F). */
export function getRepairJsonStats(): { invocations: number; modified: number } {
  return { invocations: repairInvocations, modified: repairModifications }
}

/**
 * Attempt to repair common JSON malformations from LLM output, reporting whether
 * anything changed (PHASE-23 23F — the measurable signal that the tag path still
 * needs repair):
 * - Markdown code fences wrapping JSON
 * - Trailing commas before closing brackets/braces
 * - JavaScript-style comments
 */
export function repairJsonDetailed(raw: string): { repaired: string; modified: boolean } {
  repairInvocations++
  let s = raw

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')

  // Remove `//` line comments that are NOT inside a JSON string. The previous
  // regexes weren't string-aware and corrupted legitimate values containing `//`
  // (e.g. an item named "Scroll, // ancient" or a URL), truncating mid-string and
  // dropping the whole block. Walk each line tracking string state.
  s = s
    .split('\n')
    .map((line) => {
      let inStr = false
      let esc = false
      for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i]
        if (esc) {
          esc = false
          continue
        }
        if (ch === '\\') {
          esc = true
          continue
        }
        if (ch === '"') {
          inStr = !inStr
          continue
        }
        if (!inStr && ch === '/' && line[i + 1] === '/') return line.slice(0, i)
      }
      return line
    })
    .join('\n')

  // Trailing commas: ,] or ,}
  s = s.replace(/,\s*([\]}])/g, '$1')

  const repaired = s.trim()
  const modified = repaired !== raw.trim()
  if (modified) repairModifications++
  return { repaired, modified }
}

/** Thin wrapper preserving the original signature for existing tag-path callers. */
export function repairJson(raw: string): string {
  return repairJsonDetailed(raw).repaired
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
  name: z.string(),
  duration: z.union([z.number(), z.literal('permanent')]).optional()
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
  level: z.number(),
  pool: z.enum(['regular', 'pact']).optional()
})

const RestoreSpellSlotSchema = z.object({
  type: z.literal('restore_spell_slot'),
  ...BaseCharacterChange,
  level: z.number(),
  count: z.number().optional(),
  pool: z.enum(['regular', 'pact']).optional()
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

const CreatureSetResistanceSchema = z.object({
  type: z.literal('creature_set_resistance'),
  targetLabel: z.string(),
  damageTypes: z.array(z.string()),
  replace: z.boolean().optional(),
  reason: z.string()
})

const CreatureSetVulnerabilitySchema = z.object({
  type: z.literal('creature_set_vulnerability'),
  targetLabel: z.string(),
  damageTypes: z.array(z.string()),
  replace: z.boolean().optional(),
  reason: z.string()
})

const CreatureSetImmunitySchema = z.object({
  type: z.literal('creature_set_immunity'),
  targetLabel: z.string(),
  damageTypes: z.array(z.string()),
  replace: z.boolean().optional(),
  reason: z.string()
})

const CreatureExpendSpellSlotSchema = z.object({
  type: z.literal('creature_expend_spell_slot'),
  targetLabel: z.string(),
  level: z.number(),
  count: z.number().optional(),
  reason: z.string()
})

const CreatureRestoreSpellSlotSchema = z.object({
  type: z.literal('creature_restore_spell_slot'),
  targetLabel: z.string(),
  level: z.number(),
  count: z.number().optional(),
  reason: z.string()
})

const ReduceExhaustionSchema = z.object({
  type: z.literal('reduce_exhaustion'),
  characterName: z.string().optional(),
  reason: z.string()
})

const AddExhaustionSchema = z.object({
  type: z.literal('add_exhaustion'),
  characterName: z.string().optional(),
  levels: z.number(),
  reason: z.string()
})

const SetEquippedSchema = z.object({
  type: z.literal('set_equipped'),
  ...BaseCharacterChange,
  name: z.string(),
  equipped: z.boolean()
})

const SetProficiencySchema = z.object({
  type: z.literal('set_proficiency'),
  ...BaseCharacterChange,
  category: z.enum(['weapon', 'armor', 'tool', 'language']),
  name: z.string(),
  proficient: z.boolean()
})

const SetSkillProficiencySchema = z.object({
  type: z.literal('set_skill_proficiency'),
  ...BaseCharacterChange,
  skill: z.string(),
  proficient: z.boolean(),
  expertise: z.boolean().optional()
})

const SetSaveProficiencySchema = z.object({
  type: z.literal('set_save_proficiency'),
  ...BaseCharacterChange,
  ability: AbilitySchema,
  proficient: z.boolean()
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
  CreatureSetResistanceSchema,
  CreatureSetVulnerabilitySchema,
  CreatureSetImmunitySchema,
  CreatureExpendSpellSlotSchema,
  CreatureRestoreSpellSlotSchema,
  ReduceExhaustionSchema,
  AddExhaustionSchema,
  SetEquippedSchema,
  SetProficiencySchema,
  SetSkillProficiencySchema,
  SetSaveProficiencySchema
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

const PlaceCreatureSchema = z
  .object({
    action: z.literal('place_creature'),
    creatureName: z.string().optional(),
    creatureId: z.string().optional(),
    label: z.string().optional(),
    entityType: EntityTypeSchema.optional(),
    gridX: z.number(),
    gridY: z.number(),
    visibleToPlayers: z.boolean().optional()
  })
  // The executor can't place a creature it can't identify — require at least one of
  // a name (library lookup) or an id. Without this both were optional, so a creature
  // with neither silently validated and then no-op'd at execution.
  .refine((v) => Boolean(v.creatureName || v.creatureId), {
    message: 'place_creature requires creatureName or creatureId',
    path: ['creatureName']
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

const RollDiceSchema = z.object({
  action: z.literal('roll_dice'),
  formula: z.string(),
  reason: z.string().optional(),
  visibility: z.enum(['public', 'hidden']).optional()
})

const RequestRollSchema = z.object({
  action: z.literal('request_roll'),
  rollType: z.enum(['ability', 'save', 'skill']),
  ability: z.string().optional(),
  skill: z.string().optional(),
  dc: z.number(),
  secret: z.boolean().optional(),
  reason: z.string().optional()
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

// ── Combat action economy (drive a creature's turn-state during initiative) ──
const SetEntityDashSchema = z.object({
  action: z.literal('set_entity_dash'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const SetEntityDisengageSchema = z.object({
  action: z.literal('set_entity_disengage'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const SetEntityDodgeSchema = z.object({
  action: z.literal('set_entity_dodge'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const SetEntityHiddenSchema = z.object({
  action: z.literal('set_entity_hidden'),
  entityLabel: z.string(),
  hidden: z.boolean().optional(),
  reason: z.string().optional()
})

const SpendActionSchema = z.object({
  action: z.literal('spend_action'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const SpendBonusActionSchema = z.object({
  action: z.literal('spend_bonus_action'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const SpendReactionSchema = z.object({
  action: z.literal('spend_reaction'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const SpendMovementSchema = z.object({
  action: z.literal('spend_movement'),
  entityLabel: z.string(),
  feet: z.number(),
  reason: z.string().optional()
})

const OpportunityAttackSchema = z.object({
  action: z.literal('opportunity_attack'),
  attackerLabel: z.string(),
  targetLabel: z.string(),
  toHit: z.number(),
  damage: z.string(),
  damageType: z.string().optional(),
  reason: z.string().optional()
})

// PHASE-30 — delegate a creature's whole turn to the deterministic engine.
const RunMonsterTurnSchema = z.object({
  action: z.literal('run_monster_turn'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const KnockUnconsciousSchema = z.object({
  action: z.literal('knock_unconscious'),
  entityLabel: z.string(),
  reason: z.string().optional()
})

const MountTokenSchema = z.object({
  action: z.literal('mount_token'),
  riderLabel: z.string(),
  mountLabel: z.string(),
  mountType: z.enum(['controlled', 'independent']).optional(),
  reason: z.string().optional()
})

const DismountTokenSchema = z.object({
  action: z.literal('dismount_token'),
  riderLabel: z.string(),
  reason: z.string().optional()
})

const SetConcentrationSchema = z.object({
  action: z.literal('set_concentration'),
  entityLabel: z.string(),
  spell: z.string().optional(), // omit/empty to clear (break) concentration
  reason: z.string().optional()
})

const ConcentrationCheckSchema = z.object({
  action: z.literal('concentration_check'),
  entityLabel: z.string(),
  damageTaken: z.number(),
  conSaveModifier: z.number().optional(),
  hasWarCaster: z.boolean().optional(),
  reason: z.string().optional()
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
  // 08I — degrees (0 = +x/east, 90 = down-grid/south). Without this field zod v4 strips it on
  // parse, so cones AND lines via apply_area_effect always faced +x.
  direction: z.number().optional(),
  damageFormula: z.string().optional(),
  damageType: z.string().optional(),
  saveType: AbilitySchema.optional(),
  saveDC: z.number().optional(),
  halfOnSave: z.boolean().optional(),
  condition: z.string().optional(),
  conditionDuration: z.union([z.number(), z.literal('permanent')]).optional()
})

// ── Spell effects & AoE preview (P6.10) ──

const QueryAoeSchema = z.object({
  action: z.literal('query_aoe'),
  shape: AreaShapeSchema,
  originX: z.number(),
  originY: z.number(),
  radiusOrLength: z.number(),
  widthOrHeight: z.number().optional(),
  direction: z.number().optional(),
  excludeLabel: z.string().optional(),
  reason: z.string().optional()
})

const CastSpellSchema = z.object({
  action: z.literal('cast_spell'),
  spellName: z.string(),
  caster: z.string(),
  targetX: z.number().optional(),
  targetY: z.number().optional(),
  shape: AreaShapeSchema.optional(),
  radiusOrLength: z.number().optional(),
  direction: z.number().optional(),
  saveDC: z.number().optional(),
  saveType: AbilitySchema.optional(),
  conditionIfFail: z.string().optional(),
  damageFormula: z.string().optional(),
  damageType: z.string().optional(),
  halfOnSave: z.boolean().optional(),
  duration: z.union([z.number(), z.literal('concentration'), z.literal('permanent')]).optional(),
  concentration: z.boolean().optional(),
  summonLabels: z.array(z.string()).optional(),
  reason: z.string().optional()
})

const EndSpellSchema = z.object({
  action: z.literal('end_spell'),
  spellEffectId: z.string().optional(),
  spellName: z.string().optional(),
  caster: z.string().optional(),
  reason: z.string().optional()
})

// ── Environment: darkness zones & terrain (P6.11) ──

const MagicLevelSchema = z.enum(['nonmagical', 'darkness', 'deeper-darkness'])

const AddDarknessZoneSchema = z.object({
  action: z.literal('add_darkness_zone'),
  x: z.number(),
  y: z.number(),
  radius: z.number(),
  magicLevel: MagicLevelSchema.optional(),
  floor: z.number().optional()
})

const UpdateDarknessZoneSchema = z.object({
  action: z.literal('update_darkness_zone'),
  zoneId: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  radius: z.number().optional(),
  magicLevel: MagicLevelSchema.optional(),
  floor: z.number().optional()
})

const RemoveDarknessZoneSchema = z.object({
  action: z.literal('remove_darkness_zone'),
  zoneId: z.string()
})

const TerrainTypeSchema = z.enum(['difficult', 'hazard', 'water', 'climbing', 'portal'])
const HazardTypeSchema = z.enum(['fire', 'acid', 'pit', 'spikes'])

const PlaceTerrainSchema = z.object({
  action: z.literal('place_terrain'),
  gridX: z.number(),
  gridY: z.number(),
  type: TerrainTypeSchema,
  movementCost: z.number().optional(),
  hazardType: HazardTypeSchema.optional(),
  hazardDamage: z.number().optional(),
  portalTarget: z.object({ mapId: z.string(), gridX: z.number(), gridY: z.number() }).optional(),
  floor: z.number().optional()
})

const RemoveTerrainSchema = z.object({
  action: z.literal('remove_terrain'),
  gridX: z.number(),
  gridY: z.number(),
  floor: z.number().optional()
})

const UpdateTerrainCellSchema = z.object({
  action: z.literal('update_terrain_cell'),
  gridX: z.number(),
  gridY: z.number(),
  type: TerrainTypeSchema.optional(),
  movementCost: z.number().optional(),
  hazardType: HazardTypeSchema.optional(),
  hazardDamage: z.number().optional(),
  floor: z.number().optional()
})

// ── Token customization: elevation/floor/visuals/mobility/senses (P6.22) ──

const SpecialSenseSchema = z.object({
  type: z.enum(['blindsight', 'tremorsense', 'truesight']),
  range: z.number()
})

const CustomizeTokenSchema = z.object({
  action: z.literal('customize_token'),
  label: z.string(),
  elevation: z.number().optional(),
  floor: z.number().optional(),
  color: z.string().optional(),
  borderColor: z.string().optional(),
  borderStyle: z.enum(['solid', 'dashed', 'double']).optional(),
  labelFontSize: z.number().optional(),
  aura: z
    .object({
      radius: z.number(),
      color: z.string(),
      opacity: z.number(),
      visibility: z.enum(['all', 'dm-only'])
    })
    .optional(),
  swimSpeed: z.number().optional(),
  climbSpeed: z.number().optional(),
  flySpeed: z.number().optional(),
  specialSenses: z.array(SpecialSenseSchema).optional()
})

// ── Drawings (P6.21 / G42) ──

const PointSchema = z.object({ x: z.number(), y: z.number() })

const AddDrawingSchema = z.object({
  action: z.literal('add_drawing'),
  type: z.enum(['draw-free', 'draw-line', 'draw-rect', 'draw-circle', 'draw-text']),
  points: z.array(PointSchema),
  color: z.string(),
  strokeWidth: z.number(),
  text: z.string().optional(),
  visibleToPlayers: z.boolean().optional(),
  floor: z.number().optional()
})

const RemoveDrawingSchema = z.object({ action: z.literal('remove_drawing'), drawingId: z.string() })
const ClearDrawingsSchema = z.object({ action: z.literal('clear_drawings') })

// ── Scene regions / trigger zones (P6.21 / G43) ──

const RegionShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('circle'), centerX: z.number(), centerY: z.number(), radius: z.number() }),
  z.object({ type: z.literal('polygon'), points: z.array(PointSchema) }),
  z.object({ type: z.literal('rectangle'), x: z.number(), y: z.number(), width: z.number(), height: z.number() })
])

const RegionTriggerSchema = z.enum(['enter', 'leave', 'start-turn', 'end-turn'])

const RegionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('alert-dm'), message: z.string() }),
  z.object({
    type: z.literal('teleport'),
    targetMapId: z.string(),
    targetGridX: z.number(),
    targetGridY: z.number()
  }),
  z.object({
    type: z.literal('apply-condition'),
    condition: z.string(),
    duration: z.union([z.number(), z.literal('permanent')]).optional()
  })
])

const AddRegionSchema = z.object({
  action: z.literal('add_region'),
  name: z.string(),
  shape: RegionShapeSchema,
  trigger: RegionTriggerSchema,
  regionAction: RegionActionSchema,
  enabled: z.boolean().optional(),
  visibleToPlayers: z.boolean().optional(),
  oneShot: z.boolean().optional(),
  color: z.string().optional(),
  floor: z.number().optional()
})

const UpdateRegionSchema = z.object({
  action: z.literal('update_region'),
  regionId: z.string(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  visibleToPlayers: z.boolean().optional(),
  oneShot: z.boolean().optional(),
  trigger: RegionTriggerSchema.optional(),
  regionAction: RegionActionSchema.optional()
})

const RemoveRegionSchema = z.object({ action: z.literal('remove_region'), regionId: z.string() })

const WallTypeSchema = z.enum(['solid', 'door', 'window', 'one-way', 'transparent'])

const AddWallSegmentSchema = z.object({
  action: z.literal('add_wall_segment'),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  type: WallTypeSchema,
  isOpen: z.boolean().optional(),
  oneWayDirection: z.number().optional(),
  floor: z.number().optional()
})

const RemoveWallSegmentSchema = z.object({
  action: z.literal('remove_wall_segment'),
  wallId: z.string()
})

const UpdateWallSegmentSchema = z.object({
  action: z.literal('update_wall_segment'),
  wallId: z.string(),
  type: WallTypeSchema.optional(),
  isOpen: z.boolean().optional(),
  oneWayDirection: z.number().optional(),
  floor: z.number().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional()
})

// ── Environment effects, diseases/curses, traps (P6.12) ──

const AddEnvironmentalEffectSchema = z.object({
  action: z.literal('add_environmental_effect'),
  name: z.string(),
  mechanicalEffect: z.string().optional(),
  saveDC: z.number().optional(),
  category: z.enum(['weather', 'terrain', 'magical', 'planar']).optional(),
  effectId: z.string().optional()
})

const RemoveEnvironmentalEffectSchema = z.object({
  action: z.literal('remove_environmental_effect'),
  name: z.string().optional(),
  effectId: z.string().optional()
})

const ApplyDiseaseSchema = z.object({
  action: z.literal('apply_disease'),
  targetLabel: z.string(),
  name: z.string(),
  diseaseId: z.string().optional(),
  notes: z.string().optional()
})

const RemoveDiseaseSchema = z.object({
  action: z.literal('remove_disease'),
  targetLabel: z.string(),
  name: z.string().optional()
})

const RecordDiseaseSaveSchema = z.object({
  action: z.literal('record_disease_save'),
  targetLabel: z.string(),
  name: z.string().optional(),
  success: z.boolean()
})

const ApplyCurseSchema = z.object({
  action: z.literal('apply_curse'),
  targetLabel: z.string(),
  name: z.string(),
  curseId: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional()
})

const RemoveCurseSchema = z.object({
  action: z.literal('remove_curse'),
  targetLabel: z.string(),
  name: z.string().optional()
})

const PlaceTrapSchema = z.object({
  action: z.literal('place_trap'),
  name: z.string(),
  gridX: z.number(),
  gridY: z.number(),
  trapId: z.string().optional()
})

const TrapRefSchema = {
  name: z.string().optional(),
  gridX: z.number().optional(),
  gridY: z.number().optional()
}

const TriggerTrapSchema = z.object({ action: z.literal('trigger_trap'), ...TrapRefSchema })
const RevealTrapSchema = z.object({ action: z.literal('reveal_trap'), ...TrapRefSchema })
const RemoveTrapSchema = z.object({ action: z.literal('remove_trap'), ...TrapRefSchema })

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

const StartDowntimeSchema = z.object({
  action: z.literal('start_downtime'),
  characterName: z.string(),
  activityId: z.string(),
  activityName: z.string(),
  daysRequired: z.number(),
  goldRequired: z.number().optional(),
  details: z.string().optional()
})

const AdvanceDowntimeSchema = z.object({
  action: z.literal('advance_downtime'),
  characterName: z.string(),
  activityName: z.string().optional(),
  days: z.number()
})

const AwardTreasureSchema = z.object({
  action: z.literal('award_treasure'),
  characterNames: z.array(z.string()),
  type: z.enum(['individual', 'hoard']),
  crTier: z.enum(['0-4', '5-10', '11-16', '17+']),
  reason: z.string().optional()
})

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
  // 08J — the engine rolls its own event on the DMG table; eventType is advisory only.
  eventType: z.string().optional()
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
  creatureName: z.string(),
  // 08J — optional MenagerieCreature fields (default beast/medium/non-defender).
  creatureType: z.string().optional(),
  size: z.enum(['tiny', 'small', 'medium', 'large', 'huge']).optional(),
  isDefender: z.boolean().optional()
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

const UpdateQuestLogSchema = z.object({
  action: z.literal('update_quest_log'),
  operation: z.enum(['add', 'update', 'complete', 'remove']),
  name: z.string(),
  description: z.string().optional(),
  chapterQuest: z.boolean().optional() // PHASE-28 — counts toward chapter advancement
})

// PHASE-28 28B — structured quest objectives + chapter advancement.
const UpdateQuestObjectiveSchema = z.object({
  action: z.literal('update_quest_objective'),
  questName: z.string(),
  operation: z.enum(['add', 'complete', 'fail', 'reopen']),
  objective: z.string()
})
const AdvanceChapterSchema = z.object({
  action: z.literal('advance_chapter'),
  title: z.string().optional(),
  goal: z.string().optional(),
  reason: z.string().optional()
})

const AdjustFactionStandingSchema = z.object({
  action: z.literal('adjust_faction_standing'),
  factionName: z.string(),
  delta: z.number(),
  reason: z.string().optional()
})

// PHASE-25 25B — record a durable, editable entity record (npc/location/item/faction).
// Flat schema (small-model discipline); upsert semantics make a separate update verb
// unnecessary. Registered unconditionally so it validates even when the feature is off
// (records written while disabled are inert until enabled — see ai-handlers note).
const RecordEntitySchema = z.object({
  action: z.literal('record_entity'),
  kind: z.enum(['npc', 'location', 'item', 'faction']),
  name: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()).optional()
})

const AttuneItemSchema = z.object({
  action: z.literal('attune_item'),
  characterName: z.string(),
  itemName: z.string(),
  reason: z.string().optional()
})

const UnattuneItemSchema = z.object({
  action: z.literal('unattune_item'),
  characterName: z.string(),
  itemName: z.string(),
  reason: z.string().optional()
})

const SetNpcFactionSchema = z.object({
  action: z.literal('set_npc_faction'),
  npcName: z.string(),
  faction: z.string()
})

const SetNpcLocationSchema = z.object({
  action: z.literal('set_npc_location'),
  npcName: z.string(),
  location: z.string()
})

const SetNpcSecretMotivationSchema = z.object({
  action: z.literal('set_npc_secret_motivation'),
  npcName: z.string(),
  secretMotivation: z.string()
})

// PHASE-27 27E — world-state delta verbs (flat; engine clamps/resolves/dedupes the values).
const DiscoverLocationSchema = z.object({
  action: z.literal('discover_location'),
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  connectsTo: z.string().optional(),
  exitLabel: z.string().optional()
})
const MovePartySchema = z.object({
  action: z.literal('move_party'),
  locationName: z.string()
})
const LinkLocationsSchema = z.object({
  action: z.literal('link_locations'),
  fromName: z.string(),
  toName: z.string(),
  label: z.string().optional()
})
const SetNpcOpinionSchema = z.object({
  action: z.literal('set_npc_opinion'),
  npcName: z.string(),
  characterName: z.string(),
  delta: z.number().optional(),
  score: z.number().optional(),
  summary: z.string().optional()
})
const RecordFactSchema = z.object({
  action: z.literal('record_fact'),
  text: z.string(),
  tags: z.array(z.string()).optional()
})

const ShareHandoutSchema = z.object({
  action: z.literal('share_handout'),
  title: z.string(),
  content: z.string(),
  contentType: z.enum(['text', 'image']).optional()
})

// Both prompts advertise these and the renderer fully implements them
// (game-actions/visibility-actions.ts), but they were missing from the schema map
// so validateDmAction silently dropped them — lighting a torch via the AI never worked.
const LightSourceSchema = z.object({
  action: z.literal('light_source'),
  entityName: z.string(),
  sourceName: z.string(),
  reason: z.string().optional()
})

const ExtinguishSourceSchema = z.object({
  action: z.literal('extinguish_source'),
  entityName: z.string(),
  sourceName: z.string().optional(),
  reason: z.string().optional()
})

/**
 * All known DM action schemas keyed by action name.
 * Used for individual validation when discriminatedUnion can't match.
 */
export const DM_ACTION_SCHEMAS: Record<string, z.ZodType> = {
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
  roll_dice: RollDiceSchema,
  request_roll: RequestRollSchema,
  add_entity_condition: AddEntityConditionSchema,
  remove_entity_condition: RemoveEntityConditionSchema,
  set_entity_dash: SetEntityDashSchema,
  set_entity_disengage: SetEntityDisengageSchema,
  set_entity_dodge: SetEntityDodgeSchema,
  set_entity_hidden: SetEntityHiddenSchema,
  spend_action: SpendActionSchema,
  spend_bonus_action: SpendBonusActionSchema,
  spend_reaction: SpendReactionSchema,
  spend_movement: SpendMovementSchema,
  opportunity_attack: OpportunityAttackSchema,
  run_monster_turn: RunMonsterTurnSchema,
  knock_unconscious: KnockUnconsciousSchema,
  mount_token: MountTokenSchema,
  dismount_token: DismountTokenSchema,
  set_concentration: SetConcentrationSchema,
  concentration_check: ConcentrationCheckSchema,
  short_rest: ShortRestSchema,
  long_rest: LongRestSchema,
  apply_area_effect: ApplyAreaEffectSchema,
  query_aoe: QueryAoeSchema,
  cast_spell: CastSpellSchema,
  end_spell: EndSpellSchema,
  add_darkness_zone: AddDarknessZoneSchema,
  update_darkness_zone: UpdateDarknessZoneSchema,
  remove_darkness_zone: RemoveDarknessZoneSchema,
  place_terrain: PlaceTerrainSchema,
  remove_terrain: RemoveTerrainSchema,
  update_terrain_cell: UpdateTerrainCellSchema,
  add_wall_segment: AddWallSegmentSchema,
  remove_wall_segment: RemoveWallSegmentSchema,
  update_wall_segment: UpdateWallSegmentSchema,
  add_drawing: AddDrawingSchema,
  remove_drawing: RemoveDrawingSchema,
  clear_drawings: ClearDrawingsSchema,
  customize_token: CustomizeTokenSchema,
  add_region: AddRegionSchema,
  update_region: UpdateRegionSchema,
  remove_region: RemoveRegionSchema,
  add_environmental_effect: AddEnvironmentalEffectSchema,
  remove_environmental_effect: RemoveEnvironmentalEffectSchema,
  apply_disease: ApplyDiseaseSchema,
  remove_disease: RemoveDiseaseSchema,
  record_disease_save: RecordDiseaseSaveSchema,
  apply_curse: ApplyCurseSchema,
  remove_curse: RemoveCurseSchema,
  place_trap: PlaceTrapSchema,
  trigger_trap: TriggerTrapSchema,
  reveal_trap: RevealTrapSchema,
  remove_trap: RemoveTrapSchema,
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
  award_treasure: AwardTreasureSchema,
  start_downtime: StartDowntimeSchema,
  advance_downtime: AdvanceDowntimeSchema,
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
  set_npc_faction: SetNpcFactionSchema,
  set_npc_location: SetNpcLocationSchema,
  set_npc_secret_motivation: SetNpcSecretMotivationSchema,
  update_quest_log: UpdateQuestLogSchema,
  update_quest_objective: UpdateQuestObjectiveSchema,
  advance_chapter: AdvanceChapterSchema,
  adjust_faction_standing: AdjustFactionStandingSchema,
  record_entity: RecordEntitySchema,
  // PHASE-27 27E — world-state delta verbs
  discover_location: DiscoverLocationSchema,
  move_party: MovePartySchema,
  link_locations: LinkLocationsSchema,
  set_npc_opinion: SetNpcOpinionSchema,
  record_fact: RecordFactSchema,
  attune_item: AttuneItemSchema,
  unattune_item: UnattuneItemSchema,
  share_handout: ShareHandoutSchema,
  light_source: LightSourceSchema,
  extinguish_source: ExtinguishSourceSchema
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
export function validateDmAction(item: unknown): z.ZodSafeParseResult<unknown> {
  if (!item || typeof item !== 'object' || !('action' in item)) {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['action'], message: 'Missing action field' }])
    } as z.ZodSafeParseError<unknown>
  }

  const actionName = (item as { action: unknown }).action
  if (typeof actionName !== 'string') {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['action'], message: 'action must be a string' }])
    } as z.ZodSafeParseError<unknown>
  }

  // Plugin actions bypass schema validation
  if (actionName.startsWith('plugin:')) {
    return { success: true, data: item } as z.ZodSafeParseSuccess<unknown>
  }

  const schema = DM_ACTION_SCHEMAS[actionName]
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['action'], message: `Unknown action type: ${actionName}` }])
    } as z.ZodSafeParseError<unknown>
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
            ? result.error.issues.map((iss: z.ZodIssue) => `${iss.path.join('.')}: ${iss.message}`)
            : ['Unknown validation error']
      })
    }
  }

  return { valid, issues }
}
