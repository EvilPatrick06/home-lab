import { z } from 'zod';

// ─── Core Enums ───

const DamageTypeEnum = z.enum([
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force',
  'Lightning', 'Necrotic', 'Piercing', 'Poison',
  'Psychic', 'Radiant', 'Slashing', 'Thunder',
]);

const ConditionEnum = z.enum([
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion',
  'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious', 'Stable',
]);

const AbilityEnum = z.enum([
  'Strength', 'Dexterity', 'Constitution',
  'Intelligence', 'Wisdom', 'Charisma',
]);

const SchoolEnum = z.enum([
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
]);

const ClassEnum = z.enum([
  'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger',
  'Sorcerer', 'Warlock', 'Wizard',
]);

const AttackTypeEnum = z.enum([
  'MeleeSpellAttack',
  'RangedSpellAttack',
]);

const AoEShapeEnum = z.enum([
  'Sphere', 'Cone', 'Cube', 'Cylinder',
  'Emanation', 'Line', 'Square', 'Wall',
  'Hemisphere', 'Globe',
]);

const CreatureTypeEnum = z.enum([
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon',
  'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid',
  'Monstrosity', 'Ooze', 'Plant', 'Undead',
]);

const TimeUnitEnum = z.enum([
  'rounds', 'minutes', 'hours', 'days', 'years',
]);

const ActionTypeEnum = z.enum([
  'Action', 'BonusAction', 'Reaction', 'MagicAction', 'Free',
]);

// ─── Dice Expression ───

const DiceExpressionSchema = z.object({
  diceCount: z.number().int().nonnegative().optional(),
  diceValue: z.number().int().nonnegative().optional(),
  fixedBonus: z.number().int().optional(),
  addCasterMod: z.boolean().optional(),
});

// ─── Casting Time ───

const CastingTimeSchema = z.object({
  type: z.enum(['Action', 'BonusAction', 'Reaction', 'Time']),
  timeAmount: z.number().positive().optional(),
  timeUnit: z.enum(['minutes', 'hours']).optional(),
  ritual: z.boolean(),
  trigger: z.string().optional(),
  alternativeCastingTime: z.object({
    type: z.enum(['Action', 'BonusAction', 'Reaction', 'Time']),
    timeAmount: z.number().positive().optional(),
    timeUnit: z.enum(['minutes', 'hours']).optional(),
    label: z.string().optional(),
  }).optional(),
});

// ─── Range ───

const RangeSchema = z.object({
  type: z.enum(['Self', 'Touch', 'Ranged', 'Sight', 'Unlimited', 'Special']),
  distance: z.number().nonnegative().optional(),
  unit: z.enum(['feet', 'miles']).optional(),
});

// ─── Components ───

const MaterialComponentSchema = z.object({
  description: z.string(),
  cost: z.number().nonnegative().optional(),
  currency: z.enum(['GP', 'SP', 'CP']).optional(),
  consumed: z.boolean(),
});

const ComponentsSchema = z.object({
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: MaterialComponentSchema.optional(),
});

// ─── Duration ───

const DurationSchema = z.object({
  type: z.enum([
    'Instantaneous', 'Timed', 'UntilDispelled',
    'UntilDispelledOrTriggered', 'Special', 'Permanent',
  ]),
  concentration: z.boolean(),
  amount: z.number().positive().optional(),
  unit: TimeUnitEnum.optional(),
  special: z.string().optional(),
});

// ─── Area of Effect ───

const AreaOfEffectSchema = z.object({
  shape: AoEShapeEnum,
  radiusFeet: z.number().positive().optional(),
  lengthFeet: z.number().positive().optional(),
  widthFeet: z.number().positive().optional(),
  heightFeet: z.number().positive().optional(),
  sizeFeet: z.number().positive().optional(),
  thicknessFeet: z.number().positive().optional(),
  diameterFeet: z.number().positive().optional(),
  originatesFromCaster: z.boolean().optional(),
  movablePerTurn: z.boolean().optional(),
  movementFeet: z.number().positive().optional(),
});

// ─── Damage Instance ───

const DamageInstanceSchema = z.object({
  dice: DiceExpressionSchema.optional(),
  type: z.union([
    DamageTypeEnum,
    z.array(DamageTypeEnum).min(2),
  ]),
  halfOnSave: z.boolean().optional(),
  halfOnMiss: z.boolean().optional(),
  applicationType: z.enum([
    'onHit',
    'onFailedSave',
    'onEntry',
    'onTurnStart',
    'onTurnEnd',
    'automatic',
    'onCast',
    'perAttack',
    'onContactMelee',
    'onConcentrationEnd',
    'recurring',
  ]).optional(),
  condition: z.string().optional(),
});

// ─── Healing Instance ───

const HealingInstanceSchema = z.object({
  dice: DiceExpressionSchema.optional(),
  flat: z.number().int().nonnegative().optional(),
  addCasterMod: z.boolean().optional(),
  applicationType: z.enum([
    'onCast', 'onTurnStart', 'onTurnEnd', 'onAction', 'perBerry',
  ]).optional(),
});

// ─── Temporary Hit Points ───

const TemporaryHitPointsSchema = z.object({
  dice: DiceExpressionSchema.optional(),
  flat: z.number().int().nonnegative().optional(),
  divisible: z.boolean().optional(),
});

// ─── Saving Throw ───

const SavingThrowSchema = z.object({
  ability: AbilityEnum,
  halfDamageOnSuccess: z.boolean().optional(),
  noDamageOnSuccess: z.boolean().optional(),
  noEffectOnSuccess: z.boolean().optional(),
  effectOnSuccess: z.string().optional(),
  effectOnFailure: z.string().optional(),
  repeatSave: z.object({
    timing: z.enum([
      'endOfTurn', 'startOfTurn', 'endOf30Days',
      'onDamage', 'custom',
    ]),
    endsEffectOnSuccess: z.boolean(),
    customTiming: z.string().optional(),
    threeSuccessesRequired: z.boolean().optional(),
    threeFailuresEffect: z.string().optional(),
  }).optional(),
  advantageCondition: z.string().optional(),
  disadvantageCondition: z.string().optional(),
  autoFailCondition: z.string().optional(),
  autoSucceedCondition: z.string().optional(),
});

// ─── Condition Application ───

const ConditionApplicationSchema = z.object({
  condition: ConditionEnum,
  trigger: z.enum([
    'onFailedSave', 'onHit', 'automatic', 'onEntry',
    'whileInArea', 'onCast', 'custom',
  ]).optional(),
  duration: z.string().optional(),
  savingThrowToEnd: z.object({
    ability: AbilityEnum,
    timing: z.enum(['endOfTurn', 'startOfTurn', 'custom']),
    customTiming: z.string().optional(),
  }).optional(),
});

// ─── AC / Defense Modifiers ───

const ACModifierSchema = z.object({
  type: z.enum(['bonus', 'setBase', 'setMinimum']),
  value: z.number().int(),
  includesDexMod: z.boolean().optional(),
});

// ─── Speed Modifier ───

const SpeedModifierSchema = z.object({
  type: z.enum(['bonus', 'reduce', 'set', 'multiply', 'halve', 'double']),
  value: z.number().optional(),
  speedType: z.enum([
    'walk', 'fly', 'swim', 'climb', 'burrow', 'all',
  ]).optional(),
  canHover: z.boolean().optional(),
  equalToSpeed: z.boolean().optional(),
});

// ─── D20 Roll Modifier (Bless / Bane / Guidance) ───

const D20ModifierSchema = z.object({
  appliesTo: z.enum([
    'attackRolls', 'savingThrows', 'abilityChecks',
    'attackRollsAndSaves', 'allD20', 'deathSaves',
    'concentrationSaves', 'attackRollsAgainstTarget',
  ]),
  dice: DiceExpressionSchema.optional(),
  fixedBonus: z.number().int().optional(),
  isBonus: z.boolean(),
  ability: AbilityEnum.optional(),
  skill: z.string().optional(),
});

// ─── Resistance / Immunity Grants ───

const ResistanceGrantSchema = z.object({
  damageTypes: z.array(DamageTypeEnum).min(1),
  conditions: z.array(ConditionEnum).optional(),
  permanent: z.boolean().optional(),
});

// ─── Advantage / Disadvantage Grants ───

const AdvantageGrantSchema = z.object({
  on: z.enum([
    'savingThrows', 'attackRolls', 'abilityChecks',
    'deathSaves', 'allD20', 'stealthChecks',
    'attackRollsAgainstTarget',
  ]),
  ability: AbilityEnum.optional(),
  againstMagic: z.boolean().optional(),
  condition: z.string().optional(),
});

// ─── Movement / Forced Movement ───

const ForcedMovementSchema = z.object({
  type: z.enum(['push', 'pull', 'teleport', 'fall']),
  distanceFeet: z.number().int().nonnegative(),
  direction: z.enum([
    'away', 'toward', 'choice', 'up', 'down', 'any',
  ]).optional(),
  onFailedSave: z.boolean().optional(),
});

// ─── Light Effect ───

const LightSchema = z.object({
  brightRadiusFeet: z.number().nonnegative().optional(),
  dimRadiusFeet: z.number().nonnegative().optional(),
  isSunlight: z.boolean().optional(),
  isDarkness: z.boolean().optional(),
});

// ─── Summoned Creature ───

const SummonSchema = z.object({
  statBlockName: z.string(),
  creatureType: z.union([
    CreatureTypeEnum,
    z.array(CreatureTypeEnum).min(2),
  ]),
  variantChoices: z.array(z.string()).optional(),
  count: z.number().int().positive().optional(),
  scalesWithSpellLevel: z.boolean().optional(),
  baseHP: z.number().int().nonnegative().optional(),
  hpPerLevelAbove: z.number().int().nonnegative().optional(),
  baseAC: z.number().int().nonnegative().optional(),
  acPerSpellLevel: z.boolean().optional(),
  attacksEqualHalfSpellLevel: z.boolean().optional(),
  description: z.string().optional(),
});

// ─── Spell Option / Mode ───

const SpellOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  damage: z.array(DamageInstanceSchema).optional(),
  healing: HealingInstanceSchema.optional(),
  conditionsApplied: z.array(ConditionApplicationSchema).optional(),
  areaOfEffect: AreaOfEffectSchema.optional(),
  speedModifier: SpeedModifierSchema.optional(),
  savingThrow: SavingThrowSchema.optional(),
});

// ─── Subsequent Turn Action ───

const SubsequentTurnActionSchema = z.object({
  actionType: ActionTypeEnum,
  description: z.string(),
  damage: DamageInstanceSchema.optional(),
  healing: HealingInstanceSchema.optional(),
  movementFeet: z.number().int().nonnegative().optional(),
});

// ─── Higher Level Scaling ───

const ScalingEntrySchema = z.object({
  type: z.enum([
    'damageIncrease',
    'healingIncrease',
    'additionalTargets',
    'radiusIncrease',
    'durationIncrease',
    'tempHPIncrease',
    'additionalProjectiles',
    'additionalDice',
    'bonusIncrease',
    'cubeSizeIncrease',
    'additionalObjects',
    'flatDamageIncrease',
    'flatHealingIncrease',
    'flatTempHPIncrease',
    'additionalCreatures',
    'spellLevelBlock',
    'custom',
  ]),
  diceCountPerLevel: z.number().int().optional(),
  diceValue: z.number().int().optional(),
  flatPerLevel: z.number().optional(),
  feetPerLevel: z.number().optional(),
  baseSpellLevel: z.number().int(),
  description: z.string().optional(),
});

const LevelOverrideSchema = z.object({
  minSlotLevel: z.number().int().min(1).max(9),
  maxSlotLevel: z.number().int().min(1).max(9).optional(),
  description: z.string(),
  durationOverride: DurationSchema.optional(),
  concentrationOverride: z.boolean().optional(),
});

const HigherLevelCastingSchema = z.object({
  scaling: z.array(ScalingEntrySchema).optional(),
  overrides: z.array(LevelOverrideSchema).optional(),
});

// ─── Cantrip Upgrade ───

const CantripUpgradeLevelSchema = z.object({
  level: z.number().int(),
  diceCount: z.number().int().optional(),
  diceValue: z.number().int().optional(),
  beamCount: z.number().int().optional(),
  rangeFeet: z.number().optional(),
  extraDamage: DiceExpressionSchema.optional(),
  description: z.string().optional(),
});

const CantripUpgradeSchema = z.object({
  upgrades: z.array(CantripUpgradeLevelSchema).min(1),
});

// ─── Bonus Damage Against Types ───

const BonusDamageAgainstTypesSchema = z.object({
  creatureTypes: z.array(CreatureTypeEnum).min(1),
  dice: DiceExpressionSchema,
  damageType: DamageTypeEnum,
});

// ─── Hit Point Maximum Modifier ───

const HPMaxModifierSchema = z.object({
  type: z.enum(['increase', 'decrease', 'reduce', 'cannotReduce']),
  value: z.number().int().optional(),
  dice: DiceExpressionSchema.optional(),
  equalToDamageDealt: z.boolean().optional(),
});

// ─── Main Spell Schema ───

const SpellSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: SchoolEnum,
  classes: z.array(ClassEnum).min(1),
  ritual: z.boolean(),

  castingTime: CastingTimeSchema,
  range: RangeSchema,
  components: ComponentsSchema,
  duration: DurationSchema,

  description: z.string(),

  // ── Targeting ──
  areaOfEffect: z.array(AreaOfEffectSchema).optional(),
  targetCount: z.number().int().positive().optional(),
  targetCreatureTypes: z.array(CreatureTypeEnum).optional(),
  targetType: z.enum([
    'creature', 'object', 'creatureOrObject', 'point',
    'self', 'corpse', 'surface', 'special',
  ]).optional(),
  mustSeeTarget: z.boolean().optional(),
  targetMustBeWilling: z.boolean().optional(),

  // ── Attack ──
  attackType: AttackTypeEnum.optional(),

  // ── Saving Throw ──
  savingThrow: SavingThrowSchema.optional(),

  // ── Damage ──
  damage: z.array(DamageInstanceSchema).optional(),
  bonusDamageAgainstTypes: z.array(BonusDamageAgainstTypesSchema).optional(),

  // ── Healing ──
  healing: z.array(HealingInstanceSchema).optional(),

  // ── Temporary Hit Points ──
  temporaryHitPoints: TemporaryHitPointsSchema.optional(),

  // ── Hit Point Maximum ──
  hpMaxModifier: HPMaxModifierSchema.optional(),

  // ── Conditions ──
  conditionsApplied: z.array(ConditionApplicationSchema).optional(),
  conditionsRemoved: z.array(ConditionEnum).optional(),

  // ── Defense / Buffs ──
  acModifier: ACModifierSchema.optional(),
  d20Modifiers: z.array(D20ModifierSchema).optional(),
  speedModifiers: z.array(SpeedModifierSchema).optional(),
  resistancesGranted: ResistanceGrantSchema.optional(),
  immunitiesGranted: z.object({
    damageTypes: z.array(DamageTypeEnum).optional(),
    conditions: z.array(ConditionEnum).optional(),
  }).optional(),
  vulnerabilitiesGranted: z.array(DamageTypeEnum).optional(),
  advantagesGranted: z.array(AdvantageGrantSchema).optional(),
  disadvantagesImposed: z.array(AdvantageGrantSchema).optional(),

  // ── Forced Movement ──
  forcedMovement: z.array(ForcedMovementSchema).optional(),

  // ── Environmental ──
  light: LightSchema.optional(),
  obscurement: z.enum(['Lightly', 'Heavily']).optional(),
  createsDifficultTerrain: z.boolean().optional(),
  coverProvided: z.enum(['Half', 'ThreeQuarters', 'Total']).optional(),

  // ── Scaling ──
  higherLevelCasting: HigherLevelCastingSchema.optional(),
  cantripUpgrade: CantripUpgradeSchema.optional(),

  // ── Spell Options / Modes ──
  spellOptions: z.array(SpellOptionSchema).optional(),

  // ── Subsequent Turn Actions ──
  subsequentTurnAction: SubsequentTurnActionSchema.optional(),

  // ── Summoning ──
  summonsCreature: SummonSchema.optional(),

  // ── Wall-specific ──
  createsWall: z.boolean().optional(),

  // ── Teleportation ──
  teleportation: z.object({
    distanceFeet: z.number().nonnegative().optional(),
    selfOnly: z.boolean().optional(),
    additionalCreatures: z.number().int().nonnegative().optional(),
    description: z.string().optional(),
  }).optional(),

  // ── Banishment / Planar ──
  banishment: z.object({
    savingThrowAbility: AbilityEnum,
    hpThreshold: z.number().int().nonnegative().optional(),
    permanentIfDuration: z.boolean().optional(),
    affectsCreatureTypes: z.array(CreatureTypeEnum).optional(),
    description: z.string().optional(),
  }).optional(),

  // ── Counter / Dispel ──
  countersOrDispels: z.object({
    maxSpellLevel: z.number().int().optional(),
    abilityCheckRequired: z.boolean().optional(),
    checkDC: z.string().optional(),
    description: z.string().optional(),
  }).optional(),

  // ── Resurrection ──
  resurrection: z.object({
    maxDeadTime: z.string().optional(),
    hpRestored: z.union([z.number().int(), z.literal('all')]).optional(),
    penalty: z.string().optional(),
    restrictions: z.string().optional(),
  }).optional(),

  // ── Hit Point Threshold Effects (Power Word spells, Divine Word) ──
  hpThresholdEffects: z.array(z.object({
    minHP: z.number().int().nonnegative(),
    maxHP: z.number().int().nonnegative(),
    effect: z.string(),
    conditionsApplied: z.array(ConditionEnum).optional(),
    damage: DamageInstanceSchema.optional(),
    kills: z.boolean().optional(),
    duration: z.string().optional(),
  })).optional(),

  // ── Prevents Healing ──
  preventsHealing: z.boolean().optional(),

  // ── Prevents Spellcasting ──
  preventsSpellcasting: z.boolean().optional(),

  // ── Shape-shifting / Polymorph ──
  shapeshift: z.object({
    targetBecomesType: CreatureTypeEnum.optional(),
    maxCR: z.string().optional(),
    retains: z.array(z.string()).optional(),
    replaces: z.array(z.string()).optional(),
    gainsTempHP: z.boolean().optional(),
    description: z.string().optional(),
  }).optional(),

  // ── Tags for filtering ──
  tags: z.array(z.string()).optional(),
});

// ─── Export ───

export const SpellsSchema = z.object({
  spells: z.array(SpellSchema),
});