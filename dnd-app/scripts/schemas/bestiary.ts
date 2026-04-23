import { z } from 'zod';

// ────────────────────────────────────────────
// Enumerations
// ────────────────────────────────────────────

const SizeEnum = z.enum([
  'Tiny',
  'Small',
  'Medium',
  'Large',
  'Huge',
  'Gargantuan',
]);

const CreatureTypeEnum = z.enum([
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead',
]);

const AlignmentEnum = z.enum([
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
  'Unaligned',
]);

const AbilityEnum = z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);

const DamageTypeEnum = z.enum([
  'Acid',
  'Bludgeoning',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Radiant',
  'Slashing',
  'Thunder',
]);

const ConditionEnum = z.enum([
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
]);

const SkillEnum = z.enum([
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
]);

const DieTypeEnum = z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);

const SpeedTypeEnum = z.enum(['Walk', 'Burrow', 'Climb', 'Fly', 'Swim']);

const SenseTypeEnum = z.enum([
  'Blindsight',
  'Darkvision',
  'Tremorsense',
  'Truesight',
]);

const ChallengeRatingEnum = z.enum([
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
]);

const TreasureTypeEnum = z.enum([
  'Any',
  'Individual',
  'Arcana',
  'Armaments',
  'Implements',
  'Relics',
  'None',
]);

const AttackTypeEnum = z.enum(['Melee', 'Ranged', 'MeleeOrRanged']);

const AoeShapeEnum = z.enum([
  'Cone',
  'Cube',
  'Cylinder',
  'Line',
  'Sphere',
  'Emanation',
]);

// ────────────────────────────────────────────
// Reusable Building Blocks
// ────────────────────────────────────────────

const DiceExpressionSchema = z.object({
  count: z.number().int().min(1).describe('Number of dice'),
  die: DieTypeEnum.describe('Die type, determined by creature size for Hit Dice'),
  modifier: z.number().int().describe('Flat modifier added after rolling all dice'),
});

const LimitedUsageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('perDay'),
    times: z.number().int().min(1).describe('Number of uses before a Long Rest is required'),
  }),
  z.object({
    type: z.literal('recharge'),
    minRoll: z
      .number()
      .int()
      .min(2)
      .max(6)
      .describe('Minimum d6 roll to regain the use'),
    maxRoll: z.literal(6).describe('Always 6'),
  }),
  z.object({
    type: z.literal('rechargeAfterRest'),
    restType: z.enum(['Short', 'Long', 'ShortOrLong']),
  }),
]);

const DamageInstanceSchema = z.object({
  average: z.number().int().min(0).describe('Pre-computed average damage used if not rolling'),
  dice: DiceExpressionSchema.optional().describe('Dice expression for rolled damage; omit for fixed-value damage'),
  type: DamageTypeEnum.describe('Damage type for resistance / immunity / vulnerability adjudication'),
  notes: z
    .string()
    .optional()
    .describe('Conditional or contextual notes, e.g. "only against Undead"'),
});

const DamageModifierGroupSchema = z.object({
  damageTypes: z
    .array(DamageTypeEnum)
    .min(1)
    .describe('One or more damage types sharing the same condition'),
  condition: z
    .string()
    .optional()
    .describe('Qualifying condition, e.g. "from Nonmagical Attacks"'),
});

const ConditionImmunityEntrySchema = z.object({
  condition: ConditionEnum,
  exception: z
    .string()
    .optional()
    .describe('Exception clause, e.g. "except from its vampire master"'),
});

const SpeedEntrySchema = z.object({
  type: SpeedTypeEnum,
  distance: z.number().int().min(0).describe('Speed in feet'),
  hover: z
    .boolean()
    .optional()
    .describe('True if the creature can hover; only relevant when type is Fly'),
});

const SenseEntrySchema = z.object({
  type: SenseTypeEnum,
  range: z.number().int().min(0).describe('Range in feet'),
  notes: z
    .string()
    .optional()
    .describe('Additional note, e.g. "blind beyond this radius"'),
});

const AbilityScoreBlockSchema = z.object({
  score: z.number().int().min(1).max(30),
  modifier: z.number().int().min(-5).max(10),
  save: z.number().int().min(-5).describe('Saving throw modifier (may include PB)'),
});

const SkillBonusSchema = z.object({
  skill: SkillEnum,
  bonus: z.number().int().describe('Total skill check bonus'),
});

const GearEntrySchema = z.object({
  name: z.string(),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().optional().describe('Extra information about the item'),
});

const AreaOfEffectSchema = z.object({
  shape: AoeShapeEnum,
  size: z
    .number()
    .int()
    .min(1)
    .describe('Primary dimension in feet (radius, length, side, etc.)'),
  width: z
    .number()
    .int()
    .optional()
    .describe('Width in feet for Line shapes'),
  height: z
    .number()
    .int()
    .optional()
    .describe('Height in feet for Cylinder / Wall shapes'),
  centered: z
    .boolean()
    .optional()
    .describe('Whether the area is centered on the creature'),
});

const ConditionApplicationSchema = z.object({
  condition: ConditionEnum,
  duration: z
    .string()
    .optional()
    .describe('Natural-language duration, e.g. "1 minute" or "until the end of its next turn"'),
  savingThrow: z
    .lazy(() => SavingThrowEffectSchema)
    .optional()
    .describe('Saving throw to end the condition on subsequent turns'),
  escapeDC: z
    .number()
    .int()
    .optional()
    .describe('DC for an ability check to escape, e.g. Grapple escape DC'),
});

const SavingThrowEffectSchema: z.ZodType = z.object({
  ability: AbilityEnum,
  dc: z.number().int().min(1),
  targets: z
    .string()
    .optional()
    .describe('Which creatures must save, e.g. "each creature in the area"'),
  onFailure: z
    .object({
      damage: z.array(DamageInstanceSchema).optional(),
      conditions: z.array(ConditionApplicationSchema).optional(),
      effects: z
        .string()
        .optional()
        .describe('Additional narrative effects on a failed save'),
    })
    .optional(),
  onSuccess: z
    .object({
      halfDamage: z
        .boolean()
        .optional()
        .describe('True means "half damage only" — halve damage, ignore all other fail effects'),
      damage: z
        .array(DamageInstanceSchema)
        .optional()
        .describe('Specific damage on a success if not simply halved'),
      effects: z
        .string()
        .optional()
        .describe('Additional narrative effects on a successful save'),
    })
    .optional(),
});

const AttackRangeSchema = z.object({
  normal: z.number().int().min(1).describe('Normal range in feet'),
  long: z.number().int().min(1).describe('Long range in feet'),
});

const AttackSchema = z.object({
  type: AttackTypeEnum.describe('Melee, Ranged, or MeleeOrRanged'),
  attackBonus: z.number().int().describe('Modifier added to the d20 attack roll'),
  reach: z
    .number()
    .int()
    .optional()
    .describe('Melee reach in feet'),
  range: AttackRangeSchema.optional().describe('Ranged normal/long distances in feet'),
  targets: z.string().default('one target').describe('Target clause'),
  hit: z
    .object({
      damage: z
        .array(DamageInstanceSchema)
        .describe('All damage instances dealt on a hit; VTT iterates and sums'),
      additionalEffects: z
        .string()
        .optional()
        .describe('Non-damage hit effects in natural language'),
      conditions: z
        .array(ConditionApplicationSchema)
        .optional()
        .describe('Conditions imposed on hit'),
      savingThrow: SavingThrowEffectSchema.optional().describe('Saving throw triggered on hit'),
    })
    .optional(),
  miss: z
    .object({
      damage: z.array(DamageInstanceSchema).optional(),
      effects: z.string().optional(),
    })
    .optional(),
  hitOrMiss: z
    .object({
      damage: z.array(DamageInstanceSchema).optional(),
      effects: z.string().optional(),
      conditions: z.array(ConditionApplicationSchema).optional(),
    })
    .optional(),
});

// ────────────────────────────────────────────
// Spellcasting
// ────────────────────────────────────────────

const SpellReferenceSchema = z.object({
  name: z.string().describe('Spell name exactly as printed'),
  level: z
    .number()
    .int()
    .min(0)
    .max(9)
    .describe('Spell level; 0 = cantrip'),
  castAtLevel: z
    .number()
    .int()
    .min(1)
    .max(9)
    .optional()
    .describe('Override cast level if not lowest'),
  restriction: z
    .string()
    .optional()
    .describe('Usage restriction, e.g. "self only"'),
  notes: z
    .string()
    .optional()
    .describe('Any stat-block-specific modification to the spell'),
});

const SpellGroupSchema = z.object({
  frequency: z
    .enum(['atWill', 'perDay'])
    .describe('"atWill" for at-will spells; "perDay" for limited daily uses'),
  uses: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Daily uses (only when frequency is "perDay")'),
  each: z
    .boolean()
    .optional()
    .describe('True = each spell gets its own use count; false = shared pool'),
  spells: z.array(SpellReferenceSchema).min(1),
});

const SpellcastingSchema = z.object({
  name: z
    .string()
    .default('Spellcasting')
    .describe('Feature name, e.g. "Spellcasting" or "Innate Spellcasting"'),
  ability: AbilityEnum.describe('Spellcasting ability'),
  spellSaveDC: z
    .number()
    .int()
    .optional()
    .describe('Spell save DC; omit if no spells require saves'),
  spellAttackBonus: z
    .number()
    .int()
    .optional()
    .describe('Spell attack roll modifier; omit if no spells require attacks'),
  componentOverrides: z
    .object({
      ignoresVerbal: z.boolean().optional(),
      ignoresSomatic: z.boolean().optional(),
      ignoresMaterial: z.boolean().optional(),
      ignoresMaterialWithCost: z.boolean().optional(),
    })
    .optional()
    .describe('Which spell components the monster can omit'),
  spellGroups: z
    .array(SpellGroupSchema)
    .min(1)
    .describe('Spells organised by usage frequency'),
  notes: z
    .string()
    .optional()
    .describe('Additional spellcasting narrative text'),
});

// ────────────────────────────────────────────
// Stat Block Entry Types
// ────────────────────────────────────────────

const TraitEntrySchema = z.object({
  name: z.string(),
  description: z.string().describe('Full rules text of the trait'),
  limitedUsage: LimitedUsageSchema.optional(),
});

const ActionEntrySchema = z.object({
  name: z.string(),
  description: z.string().describe('Full rules text of the action'),
  limitedUsage: LimitedUsageSchema.optional(),
  attack: AttackSchema.optional().describe('Structured attack data for VTT automation'),
  savingThrow: SavingThrowEffectSchema.optional().describe('Saving throw this action forces'),
  areaOfEffect: AreaOfEffectSchema.optional(),
  damage: z
    .array(DamageInstanceSchema)
    .optional()
    .describe('Direct damage not tied to an attack roll or save (e.g., automatic damage auras)'),
  conditions: z
    .array(ConditionApplicationSchema)
    .optional()
    .describe('Conditions this action can impose'),
  healing: z
    .object({
      average: z.number().int().min(0),
      dice: DiceExpressionSchema.optional(),
    })
    .optional()
    .describe('Hit Points restored if this is a healing action'),
  teleport: z
    .object({
      distance: z.number().int().min(1).describe('Teleport distance in feet'),
      notes: z.string().optional(),
    })
    .optional(),
  summon: z
    .object({
      creatureName: z.string(),
      count: DiceExpressionSchema.optional().describe('Dice expression for number summoned'),
      fixedCount: z.number().int().min(1).optional(),
      notes: z.string().optional(),
    })
    .optional()
    .describe('Summoning effects'),
});

const MultiattackEntrySchema = z.object({
  description: z.string().describe('Full rules text of the Multiattack'),
  attacks: z
    .array(
      z.object({
        actionName: z
          .string()
          .describe('Name of the referenced action in the actions array'),
        count: z.number().int().min(1).describe('Times this attack is made'),
      }),
    )
    .min(1)
    .describe('Ordered list of attacks the VTT should execute'),
  substitutions: z
    .array(
      z.object({
        replace: z.string().describe('Name of the attack that may be swapped out'),
        replaceCount: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe('How many of the named attack can be replaced'),
        with: z.string().describe('Name of the action to substitute in'),
      }),
    )
    .optional()
    .describe('Optional replacements, e.g. "can replace one Bite with Constrict"'),
  additionalEffects: z
    .string()
    .optional()
    .describe('Any extra effects that occur as part of multiattack'),
});

const BonusActionEntrySchema = ActionEntrySchema;

const ReactionEntrySchema = ActionEntrySchema.extend({
  trigger: z.string().describe('The event that allows this Reaction to be taken'),
});

const LegendaryActionEntrySchema = ActionEntrySchema.extend({
  cost: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('Number of legendary action uses expended'),
});

// ────────────────────────────────────────────
// Lair
// ────────────────────────────────────────────

const LairActionSchema = z.object({
  name: z.string().optional(),
  description: z.string(),
  limitedUsage: LimitedUsageSchema.optional(),
  savingThrow: SavingThrowEffectSchema.optional(),
  damage: z.array(DamageInstanceSchema).optional(),
  areaOfEffect: AreaOfEffectSchema.optional(),
  conditions: z.array(ConditionApplicationSchema).optional(),
});

const RegionalEffectSchema = z.object({
  description: z.string(),
  radius: z
    .number()
    .optional()
    .describe('Radius of the regional effect in miles'),
  endCondition: z
    .string()
    .optional()
    .describe('What causes this regional effect to end'),
});

const LairSchema = z.object({
  description: z.string().optional().describe('Narrative description of the lair'),
  initiativeCount: z
    .number()
    .int()
    .optional()
    .describe('Initiative count on which lair actions trigger (typically 20)'),
  loseInitiativeTies: z
    .boolean()
    .optional()
    .describe('Whether the lair loses initiative ties'),
  actions: z
    .array(LairActionSchema)
    .optional()
    .describe('Lair actions available on the lair initiative count'),
  regionalEffects: z.array(RegionalEffectSchema).optional(),
  inLairModifications: z
    .object({
      additionalTraits: z.array(TraitEntrySchema).optional(),
      additionalActions: z.array(ActionEntrySchema).optional(),
      additionalBonusActions: z.array(BonusActionEntrySchema).optional(),
      additionalReactions: z.array(ReactionEntrySchema).optional(),
      additionalLegendaryActions: z
        .object({
          perRound: z.number().int().min(1).optional(),
          actions: z.array(LegendaryActionEntrySchema),
        })
        .optional(),
      armorClassOverride: z.number().int().optional(),
      hitPointsOverride: z.number().int().optional(),
      additionalSpeeds: z.array(SpeedEntrySchema).optional(),
      additionalImmunities: z
        .object({
          damage: z.array(DamageModifierGroupSchema).optional(),
          conditions: z.array(ConditionImmunityEntrySchema).optional(),
        })
        .optional(),
      additionalResistances: z.array(DamageModifierGroupSchema).optional(),
      notes: z.string().optional(),
    })
    .optional()
    .describe('Stat block modifications while the creature is in its lair'),
});

// ────────────────────────────────────────────
// Main Bestiary Schema
// ────────────────────────────────────────────

export const BestiarySchema = z.object({
  // ── 1. Name & General Details ──

  name: z.string().describe('Monster name'),

  sizes: z
    .array(SizeEnum)
    .min(1)
    .describe('Allowed sizes; if multiple, DM chooses when placing the creature'),

  creatureType: CreatureTypeEnum.describe('Primary creature type'),

  descriptiveTags: z
    .array(z.string())
    .optional()
    .describe('Parenthetical tags after creature type, e.g. "Shapechanger", "Devil", class names'),

  alignment: AlignmentEnum.describe('Default alignment suggestion'),

  // ── Metadata (from monster entry, outside the stat block proper) ──

  habitat: z
    .array(z.string())
    .optional()
    .describe('Typical habitats, e.g. "Forest", "Underdark"'),

  treasure: z
    .array(TreasureTypeEnum)
    .optional()
    .describe('Treasure preferences'),

  lore: z.string().optional().describe('Narrative description / flavor text'),

  // ── 2. Combat Highlights ──

  armorClass: z.object({
    value: z.number().int().min(1).describe('Final AC value'),
    sources: z
      .array(z.string())
      .optional()
      .describe('What contributes, e.g. ["Natural Armor"], ["Studded Leather", "Shield"]'),
  }),

  hitPoints: z.object({
    average: z.number().int().min(1).describe('Pre-computed average HP'),
    dice: DiceExpressionSchema.describe(
      'Hit Dice expression. count = number of HD, die = HD type (size-based), modifier = CON contribution (Con mod × count)',
    ),
  }),

  speeds: z
    .array(SpeedEntrySchema)
    .min(1)
    .describe('All movement modes; at least Walk is expected'),

  initiative: z.object({
    modifier: z.number().int().describe('Added to d20 when rolling Initiative'),
    score: z
      .number()
      .int()
      .describe('Static Initiative score when not rolling (8 + modifier)'),
  }),

  // ── 3. Ability Scores ──

  abilityScores: z.object({
    STR: AbilityScoreBlockSchema,
    DEX: AbilityScoreBlockSchema,
    CON: AbilityScoreBlockSchema,
    INT: AbilityScoreBlockSchema,
    WIS: AbilityScoreBlockSchema,
    CHA: AbilityScoreBlockSchema,
  }),

  // ── 4. Other Details ──

  skills: z
    .array(SkillBonusSchema)
    .optional()
    .describe('Skill proficiency bonuses'),

  resistances: z
    .array(DamageModifierGroupSchema)
    .optional()
    .describe('Damage resistances grouped by shared condition'),

  vulnerabilities: z
    .array(DamageModifierGroupSchema)
    .optional()
    .describe('Damage vulnerabilities grouped by shared condition'),

  damageImmunities: z
    .array(DamageModifierGroupSchema)
    .optional()
    .describe('Damage immunities grouped by shared condition'),

  conditionImmunities: z
    .array(ConditionImmunityEntrySchema)
    .optional()
    .describe('Condition immunities with optional exception clauses'),

  gear: z
    .array(GearEntrySchema)
    .optional()
    .describe('Retrievable equipment listed in the Gear entry'),

  senses: z.object({
    specialSenses: z
      .array(SenseEntrySchema)
      .optional()
      .describe('Blindsight, Darkvision, Tremorsense, Truesight'),
    passivePerception: z.number().int().min(1),
  }),

  languages: z.object({
    spoken: z
      .array(z.string())
      .optional()
      .describe('Languages the monster can speak'),
    understood: z
      .array(z.string())
      .optional()
      .describe('Languages understood but not spoken'),
    telepathy: z
      .number()
      .int()
      .optional()
      .describe('Telepathy range in feet'),
    notes: z
      .string()
      .optional()
      .describe('Additional notes, e.g. "plus one other language"'),
  }),

  challengeRating: ChallengeRatingEnum.describe('Challenge Rating string'),

  experiencePoints: z
    .number()
    .int()
    .min(0)
    .describe('XP awarded for defeating this monster, derived from CR'),

  proficiencyBonus: z
    .number()
    .int()
    .min(2)
    .max(9)
    .describe('Proficiency Bonus, derived from CR'),

  // ── 5. Traits ──

  traits: z.array(TraitEntrySchema).optional(),

  // ── Spellcasting (may appear among traits or actions; stored top-level for VTT access) ──

  spellcasting: z
    .array(SpellcastingSchema)
    .optional()
    .describe(
      'One or more spellcasting features; array to support separate innate/prepared sources',
    ),

  // ── 6. Actions ──

  multiattack: MultiattackEntrySchema.optional().describe(
    'Multiattack definition; references actions by name',
  ),

  actions: z
    .array(ActionEntrySchema)
    .optional()
    .describe('All non-Multiattack actions'),

  // ── 7. Bonus Actions ──

  bonusActions: z.array(BonusActionEntrySchema).optional(),

  // ── 8. Reactions ──

  reactions: z.array(ReactionEntrySchema).optional(),

  // ── 8. Legendary Actions ──

  legendaryActions: z
    .object({
      perRound: z
        .number()
        .int()
        .min(1)
        .describe(
          'Total legendary action uses available per round; regained at start of creature turn',
        ),
      actions: z
        .array(LegendaryActionEntrySchema)
        .min(1)
        .describe('Available legendary action options'),
    })
    .optional(),

  // ── Lair ──

  lair: LairSchema.optional(),
});