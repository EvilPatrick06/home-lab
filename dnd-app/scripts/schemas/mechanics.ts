import { z } from 'zod';

// ─── Core Enums ───────────────────────────────────────────────────────────────

const AbilityScoreEnum = z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);

const SkillEnum = z.enum([
  'Acrobatics', 'AnimalHandling', 'Arcana', 'Athletics',
  'Deception', 'History', 'Insight', 'Intimidation',
  'Investigation', 'Medicine', 'Nature', 'Perception',
  'Performance', 'Persuasion', 'Religion', 'SleightOfHand',
  'Stealth', 'Survival',
]);

const D20TestTypeEnum = z.enum([
  'AttackRoll', 'SavingThrow', 'AbilityCheck',
]);

const RollContextEnum = z.enum([
  'AttackRoll', 'SavingThrow', 'AbilityCheck',
  'DamageRoll', 'Initiative', 'DeathSavingThrow',
  'ConcentrationCheck', 'HitPointMaximum', 'SpeedCalculation',
  'Any',
]);

const AttackVectorEnum = z.enum([
  'MeleeWeapon', 'RangedWeapon', 'MeleeSpell', 'RangedSpell',
  'Melee', 'Ranged', 'Spell', 'Weapon', 'Any',
]);

const DamageTypeEnum = z.enum([
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force',
  'Lightning', 'Necrotic', 'Piercing', 'Poison',
  'Psychic', 'Radiant', 'Slashing', 'Thunder',
]);

const ConditionEnum = z.enum([
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion',
  'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
]);

const RuleCategoryEnum = z.enum([
  'Condition', 'Cover', 'VariantRule', 'OptionalRule',
  'CombatRule', 'MovementRule', 'EnvironmentRule',
  'RestRule', 'SpellcastingRule', 'DeathAndDying',
  'SocialInteraction', 'Exploration', 'GeneralRule',
]);

const DurationTypeEnum = z.enum([
  'Instantaneous', 'Rounds', 'Minutes', 'Hours', 'Days',
  'UntilDispelled', 'UntilRemoved', 'UntilLongRest',
  'UntilShortRest', 'Permanent', 'Special', 'EndOfTurn',
  'StartOfTurn', 'UntilConditionMet',
]);

const ModifierTargetEnum = z.enum([
  'AC', 'Speed', 'HP', 'HPMaximum', 'Initiative',
  'SpellSaveDC', 'SpellAttackBonus', 'ProficiencyBonus',
  'AttackRoll', 'DamageRoll', 'SavingThrow', 'AbilityCheck',
  'PassivePerception', 'AllD20Tests', 'SpecificAbilityScore',
  'AllSpeeds', 'WalkingSpeed', 'FlyingSpeed', 'SwimmingSpeed',
  'ClimbingSpeed', 'BurrowingSpeed',
]);

const ModifierOperationEnum = z.enum([
  'Add', 'Subtract', 'Multiply', 'Divide', 'Set',
  'Halve', 'Double', 'ReduceToZero', 'AddPerLevel',
  'SubtractPerLevel', 'Maximum', 'Minimum',
]);

const TriggerEventEnum = z.enum([
  'OnApply', 'OnRemove', 'StartOfTurn', 'EndOfTurn',
  'OnAttackRollMade', 'OnAttackRollReceived',
  'OnSavingThrowMade', 'OnAbilityCheckMade',
  'OnDamageTaken', 'OnDamageDealt',
  'OnMovement', 'OnForcedMovement',
  'OnSpellCast', 'OnConcentrationCheck',
  'OnDeath', 'OnHealingReceived',
  'OnShortRest', 'OnLongRest',
  'OnIncapacitated', 'OnConditionApplied',
  'OnConditionRemoved', 'Passive', 'OnTargeted',
  'WhenAttackedInMelee', 'WhenAttackedAtRange',
  'OnFallProne', 'OnStandFromProne',
]);

const RemovalMethodEnum = z.enum([
  'SpellEffect', 'LongRest', 'ShortRest', 'ShortOrLongRest',
  'GreaterRestoration', 'LesserRestoration', 'HealingMagic',
  'SaveAtEndOfTurn', 'SaveAtStartOfTurn',
  'ConditionEnds', 'TimerExpires', 'SpecialAction',
  'Death', 'ReduceToZeroLevels', 'Manual', 'Other',
]);

const CreatureSizeEnum = z.enum([
  'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan',
]);

const SenseEnum = z.enum([
  'Sight', 'Hearing', 'Blindsight', 'Darkvision',
  'Tremorsense', 'Truesight', 'Smell', 'Any',
]);

const TargetRelationshipEnum = z.enum([
  'Self', 'Ally', 'Enemy', 'Any', 'Source',
]);

const GrantedToEnum = z.enum([
  'Self', 'Attacker', 'Ally', 'Any',
]);

const ImposedOnEnum = z.enum([
  'Self', 'Attacker', 'Target', 'Enemy', 'Any',
]);

const ConditionRelationshipEnum = z.enum([
  'Implies', 'ImpliedBy', 'Supersedes', 'SupersededBy',
  'MutuallyExclusive', 'OftenCombined', 'Prerequisite',
  'CanCause', 'CausedBy', 'Removes', 'RemovedBy',
]);

const RestrictedActionEnum = z.enum([
  'Action', 'BonusAction', 'Reaction', 'Movement',
  'Concentration', 'Spellcasting', 'Attack',
  'MultiAttack', 'VerbalComponent', 'SomaticComponent', 'Any',
]);

const RestrictionTypeEnum = z.enum([
  'Prohibited', 'Limited', 'ConditionallyAllowed',
]);

const LevelStackingBehaviorEnum = z.enum([
  'Cumulative', 'HighestOnly', 'Replace', 'NotApplicable',
]);

const ImmunityTypeEnum = z.enum([
  'DamageType', 'Condition', 'Effect',
]);

const AutomaticOutcomeTypeEnum = z.enum([
  'AutoFail', 'AutoSuccess', 'CriticalHit', 'CriticalFail',
]);

const SaveFrequencyEnum = z.enum([
  'EndOfTurn', 'StartOfTurn', 'Once', 'OnDamageTaken',
]);

const DurationUnitEnum = z.enum([
  'Rounds', 'Minutes', 'Hours', 'Days', 'Special',
]);

const DistanceUnitEnum = z.enum([
  'Feet', 'Miles', 'Touch', 'Unlimited',
]);

// ─── Scope Limiter ────────────────────────────────────────────────────────────

const ScopeLimiterSchema = z.object({
  abilityScores: z.array(AbilityScoreEnum).optional(),
  skills: z.array(SkillEnum).optional(),
  attackVectors: z.array(AttackVectorEnum).optional(),
  damageTypes: z.array(DamageTypeEnum).optional(),
  senses: z.array(SenseEnum).optional(),
  creatureSizes: z.array(CreatureSizeEnum).optional(),
  targetRelationship: TargetRelationshipEnum.optional(),
  rangeConstraint: z.object({
    distance: z.number().nonnegative(),
    unit: DistanceUnitEnum,
  }).strict().optional(),
  requiresLineOfSight: z.boolean().optional(),
  customScope: z.string().optional(),
}).strict();

// ─── Numerical Modifier ──────────────────────────────────────────────────────

const NumericalModifierSchema = z.object({
  id: z.string().uuid(),
  target: ModifierTargetEnum,
  operation: ModifierOperationEnum,
  value: z.number(),
  abilityScore: AbilityScoreEnum.optional(),
  scope: ScopeLimiterSchema.optional(),
  perLevelScaling: z.boolean().default(false),
  levelMultiplier: z.number().optional(),
  minimumResultant: z.number().optional(),
  maximumResultant: z.number().optional(),
  note: z.string().optional(),
}).strict().refine(
  (data) => !data.perLevelScaling || data.levelMultiplier !== undefined,
  { message: 'levelMultiplier is required when perLevelScaling is true' },
);

// ─── Advantage Grant ─────────────────────────────────────────────────────────

const AdvantageGrantSchema = z.object({
  id: z.string().uuid(),
  rollType: D20TestTypeEnum,
  scope: ScopeLimiterSchema.optional(),
  grantedTo: GrantedToEnum,
  condition: z.string().optional(),
  note: z.string().optional(),
}).strict();

// ─── Disadvantage Imposition ─────────────────────────────────────────────────

const DisadvantageImpositionSchema = z.object({
  id: z.string().uuid(),
  rollType: D20TestTypeEnum,
  scope: ScopeLimiterSchema.optional(),
  imposedOn: ImposedOnEnum,
  condition: z.string().optional(),
  note: z.string().optional(),
}).strict();

// ─── Automatic Outcome ───────────────────────────────────────────────────────

const AutomaticOutcomeSchema = z.object({
  id: z.string().uuid(),
  rollType: D20TestTypeEnum,
  outcome: AutomaticOutcomeTypeEnum,
  scope: ScopeLimiterSchema.optional(),
  condition: z.string().optional(),
  note: z.string().optional(),
}).strict();

// ─── Action Restriction ──────────────────────────────────────────────────────

const ActionRestrictionSchema = z.object({
  id: z.string().uuid(),
  restrictedAction: RestrictedActionEnum,
  restrictionType: RestrictionTypeEnum,
  condition: z.string().optional(),
  note: z.string().optional(),
}).strict();

// ─── Condition Imposition ────────────────────────────────────────────────────

const ConditionImpositionSchema = z.object({
  id: z.string().uuid(),
  conditionName: ConditionEnum,
  isAutomatic: z.boolean().default(true),
  savingThrow: z.object({
    ability: AbilityScoreEnum,
    dc: z.union([z.number().int().positive(), z.string()]),
    onSuccess: z.string(),
    onFailure: z.string(),
  }).strict().optional(),
  note: z.string().optional(),
}).strict();

// ─── Immunity, Resistance & Vulnerability ────────────────────────────────────

const ImmunityGrantSchema = z.object({
  id: z.string().uuid(),
  immunityType: ImmunityTypeEnum,
  value: z.string().min(1),
  note: z.string().optional(),
}).strict();

const ResistanceGrantSchema = z.object({
  id: z.string().uuid(),
  damageType: DamageTypeEnum,
  note: z.string().optional(),
}).strict();

const VulnerabilityImpositionSchema = z.object({
  id: z.string().uuid(),
  damageType: DamageTypeEnum,
  note: z.string().optional(),
}).strict();

// ─── Application Effect (Discriminated Union) ────────────────────────────────

const ApplicationEffectSchema = z.discriminatedUnion('effectType', [
  z.object({
    effectType: z.literal('NumericalModifier'),
    modifier: NumericalModifierSchema,
  }).strict(),
  z.object({
    effectType: z.literal('AdvantageGrant'),
    grant: AdvantageGrantSchema,
  }).strict(),
  z.object({
    effectType: z.literal('DisadvantageImposition'),
    imposition: DisadvantageImpositionSchema,
  }).strict(),
  z.object({
    effectType: z.literal('AutomaticOutcome'),
    outcome: AutomaticOutcomeSchema,
  }).strict(),
  z.object({
    effectType: z.literal('ActionRestriction'),
    restriction: ActionRestrictionSchema,
  }).strict(),
  z.object({
    effectType: z.literal('ConditionImposition'),
    imposition: ConditionImpositionSchema,
  }).strict(),
  z.object({
    effectType: z.literal('ImmunityGrant'),
    immunity: ImmunityGrantSchema,
  }).strict(),
  z.object({
    effectType: z.literal('ResistanceGrant'),
    resistance: ResistanceGrantSchema,
  }).strict(),
  z.object({
    effectType: z.literal('VulnerabilityImposition'),
    vulnerability: VulnerabilityImpositionSchema,
  }).strict(),
  z.object({
    effectType: z.literal('CustomEffect'),
    description: z.string().min(1),
    mechanicalNote: z.string().optional(),
  }).strict(),
]);

// ─── Application Trigger ─────────────────────────────────────────────────────

const ApplicationTriggerSchema = z.object({
  event: TriggerEventEnum,
  condition: z.string().optional(),
  scope: ScopeLimiterSchema.optional(),
}).strict();

// ─── Application Logic Entry ─────────────────────────────────────────────────

const ApplicationLogicEntrySchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().nonnegative(),
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: ApplicationTriggerSchema,
  effects: z.array(ApplicationEffectSchema).min(1),
  appliesToSelf: z.boolean().default(false),
  appliesToTarget: z.boolean().default(false),
  appliesToArea: z.boolean().default(false),
  isOptional: z.boolean().default(false),
  requiresDMApproval: z.boolean().default(false),
}).strict();

// ─── Removal Condition ───────────────────────────────────────────────────────

const RemovalConditionSchema = z.object({
  id: z.string().uuid(),
  method: RemovalMethodEnum,
  description: z.string().min(1),
  savingThrow: z.object({
    ability: AbilityScoreEnum,
    dc: z.union([z.number().int().positive(), z.string()]),
    frequency: SaveFrequencyEnum,
  }).strict().optional(),
  automaticAfterDuration: z.boolean().default(false),
  spellsOrEffects: z.array(z.string()).optional(),
}).strict();

// ─── Rule Level (for tiered mechanics like Exhaustion, Cover) ────────────────

const RuleLevelSchema = z.object({
  level: z.number().int().nonnegative(),
  name: z.string().optional(),
  description: z.string().min(1),
  numericalModifiers: z.array(NumericalModifierSchema).default([]),
  advantageGrants: z.array(AdvantageGrantSchema).default([]),
  disadvantageImposes: z.array(DisadvantageImpositionSchema).default([]),
  automaticOutcomes: z.array(AutomaticOutcomeSchema).default([]),
  actionRestrictions: z.array(ActionRestrictionSchema).default([]),
  conditionsImposed: z.array(ConditionImpositionSchema).default([]),
  immunities: z.array(ImmunityGrantSchema).default([]),
  resistances: z.array(ResistanceGrantSchema).default([]),
  vulnerabilities: z.array(VulnerabilityImpositionSchema).default([]),
  specialEffect: z.string().optional(),
  isFatal: z.boolean().default(false),
}).strict();

// ─── Related Condition ───────────────────────────────────────────────────────

const RelatedConditionSchema = z.object({
  conditionName: ConditionEnum,
  relationship: ConditionRelationshipEnum,
  isAutomatic: z.boolean().default(false),
  note: z.string().optional(),
}).strict();

// ─── Source Reference ────────────────────────────────────────────────────────

const SourceReferenceSchema = z.object({
  book: z.string().min(1),
  chapter: z.string().optional(),
  section: z.string().optional(),
  page: z.number().int().positive().optional(),
  url: z.string().url().optional(),
  errata: z.string().optional(),
}).strict();

// ─── Duration ────────────────────────────────────────────────────────────────

const DurationSchema = z.object({
  type: DurationTypeEnum,
  value: z.number().nonnegative().optional(),
  unit: DurationUnitEnum.optional(),
  concentration: z.boolean().default(false),
  extendable: z.boolean().default(false),
}).strict();

// ─── Stacking Rules ──────────────────────────────────────────────────────────

const StackingSchema = z.object({
  stacksWithSelf: z.boolean().default(false),
  stacksWithOthers: z.boolean().default(true),
  maxStacks: z.number().int().positive().optional(),
  stackingNote: z.string().optional(),
}).strict();

// ─── Common Ruling ───────────────────────────────────────────────────────────

const CommonRulingSchema = z.object({
  question: z.string().min(1),
  ruling: z.string().min(1),
  isOfficial: z.boolean().default(false),
}).strict();

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN SCHEMA ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export const MechanicsSchema = z.object({
  // ── Identity ──────────────────────────────────────────────────────────────
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: RuleCategoryEnum,
  subcategory: z.string().optional(),
  tags: z.array(z.string()).default([]),

  // ── Source ────────────────────────────────────────────────────────────────
  source: SourceReferenceSchema,
  gameEdition: z.literal('2024').default('2024'),

  // ── Description ───────────────────────────────────────────────────────────
  description: z.string().min(1),
  shortDescription: z.string().max(280).optional(),
  flavorText: z.string().optional(),
  rulesAsWritten: z.string().optional(),

  // ── Rule Classification ───────────────────────────────────────────────────
  isVariantRule: z.boolean().default(false),
  isOptionalRule: z.boolean().default(false),
  replacesRule: z.string().uuid().nullable().optional(),
  prerequisiteRules: z.array(z.string().uuid()).default([]),
  incompatibleWith: z.array(z.string().uuid()).default([]),

  // ── Leveled / Tiered Mechanics ────────────────────────────────────────────
  hasLevels: z.boolean().default(false),
  maxLevel: z.number().int().positive().optional(),
  levels: z.array(RuleLevelSchema).optional(),
  levelStackingBehavior: LevelStackingBehaviorEnum.default('NotApplicable'),

  // ── Core Mechanical Effects (flat, non‑leveled) ───────────────────────────
  numericalModifiers: z.array(NumericalModifierSchema).default([]),
  advantageGrants: z.array(AdvantageGrantSchema).default([]),
  disadvantageImposes: z.array(DisadvantageImpositionSchema).default([]),
  automaticOutcomes: z.array(AutomaticOutcomeSchema).default([]),
  actionRestrictions: z.array(ActionRestrictionSchema).default([]),
  conditionsImposed: z.array(ConditionImpositionSchema).default([]),
  immunities: z.array(ImmunityGrantSchema).default([]),
  resistances: z.array(ResistanceGrantSchema).default([]),
  vulnerabilities: z.array(VulnerabilityImpositionSchema).default([]),

  // ── Related Conditions ────────────────────────────────────────────────────
  relatedConditions: z.array(RelatedConditionSchema).default([]),

  // ── Application Logic ─────────────────────────────────────────────────────
  applicationLogic: z.array(ApplicationLogicEntrySchema).default([]),

  // ── Duration & Removal ────────────────────────────────────────────────────
  duration: DurationSchema.nullable().optional(),
  removalConditions: z.array(RemovalConditionSchema).default([]),

  // ── Interaction Rules ─────────────────────────────────────────────────────
  stacking: StackingSchema.default({
    stacksWithSelf: false,
    stacksWithOthers: true,
  }),

  // ── DM Guidance ───────────────────────────────────────────────────────────
  dmNotes: z.string().optional(),
  commonRulings: z.array(CommonRulingSchema).default([]),

  // ── Metadata ──────────────────────────────────────────────────────────────
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.string().default('1.0.0'),
}).strict().refine(
  (data) => !data.hasLevels || (data.levels !== undefined && data.levels.length > 0),
  { message: 'levels array must be non-empty when hasLevels is true' },
).refine(
  (data) => !data.hasLevels || data.maxLevel !== undefined,
  { message: 'maxLevel is required when hasLevels is true' },
);

export type MechanicsNode = z.infer<typeof MechanicsSchema>;