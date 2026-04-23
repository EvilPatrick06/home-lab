import { z } from "zod";

// =============================================
// Foundational Enums
// =============================================

const AbilityScoreEnum = z.enum([
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
]);

const DieEnum = z.enum(["D4", "D6", "D8", "D10", "D12"]);

const SkillEnum = z.enum([
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
]);

const ArmorCategoryEnum = z.enum(["Light", "Medium", "Heavy", "Shields"]);

const SpellSchoolEnum = z.enum([
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
]);

const DamageTypeEnum = z.enum([
  "Acid",
  "Bludgeoning",
  "Cold",
  "Fire",
  "Force",
  "Lightning",
  "Necrotic",
  "Piercing",
  "Poison",
  "Psychic",
  "Radiant",
  "Slashing",
  "Thunder",
]);

const ActivationTypeEnum = z.enum([
  "Action",
  "BonusAction",
  "Reaction",
  "MagicAction",
  "Free",
  "Passive",
  "Special",
]);

const RestTypeEnum = z.enum(["Short", "Long", "ShortOrLong"]);

const ConditionEnum = z.enum([
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
]);

const CreatureSizeEnum = z.enum([
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
]);

// =============================================
// Reusable Building Blocks
// =============================================

const WeaponProficiencySchema = z.object({
  category: z.enum(["Simple", "Martial"]),
  restriction: z.string().optional(),
});

const ToolProficiencySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("specific"), name: z.string() }),
  z.object({
    type: z.literal("choice"),
    count: z.number().int().min(1),
    category: z.string(),
  }),
]);

const SkillChoiceSchema = z.object({
  count: z.number().int().min(1),
  from: z.union([z.array(SkillEnum), z.literal("any")]),
});

const EquipmentOptionSchema = z.object({
  label: z.string(),
  items: z.array(z.string()),
  gp: z.number().int().min(0),
});

const UsesPerRestSchema = z.object({
  uses: z.union([z.number().int(), z.string()]),
  restType: RestTypeEnum,
  rechargeAlternative: z.string().optional(),
});

const SaveDCSchema = z.object({
  ability: AbilityScoreEnum,
  formula: z.string(),
});

const ProficiencyGrantsSchema = z.object({
  skills: z.array(SkillEnum).optional(),
  skillChoice: SkillChoiceSchema.optional(),
  expertise: z
    .object({
      count: z.number().int(),
      from: z.union([z.array(SkillEnum), z.literal("proficient")]),
    })
    .optional(),
  weapons: z.array(WeaponProficiencySchema).optional(),
  armor: z.array(ArmorCategoryEnum).optional(),
  savingThrows: z.array(AbilityScoreEnum).optional(),
  tools: z.array(z.string()).optional(),
  languages: z
    .union([
      z.array(z.string()),
      z.object({ count: z.number().int(), from: z.string() }),
    ])
    .optional(),
});

const GrantedSpellSchema = z.object({
  spell: z.string(),
  alwaysPrepared: z.boolean().default(false),
  freeUses: z.union([z.number().int(), z.string()]).optional(),
  freeUseRestType: RestTypeEnum.optional(),
  ritualOnly: z.boolean().default(false),
  spellcastingAbility: AbilityScoreEnum.optional(),
});

const UnarmoredDefenseSchema = z.object({
  baseAC: z.number().int(),
  modifiers: z.array(AbilityScoreEnum),
  allowsShield: z.boolean(),
});

const AbilityScoreIncreaseSchema = z.object({
  abilities: z.array(AbilityScoreEnum),
  increase: z.number().int(),
  maximum: z.number().int(),
});

const ScalingValueEntrySchema = z.object({
  level: z.number().int().min(1).max(20),
  value: z.union([z.number(), z.string()]),
});

// =============================================
// Spell-Related Schemas
// =============================================

const SpellEntrySchema = z.object({
  name: z.string(),
  school: SpellSchoolEnum,
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  materialComponent: z.boolean().default(false),
});

const SpellSlotsSchema = z.object({
  slot1: z.number().int().min(0).default(0),
  slot2: z.number().int().min(0).default(0),
  slot3: z.number().int().min(0).default(0),
  slot4: z.number().int().min(0).default(0),
  slot5: z.number().int().min(0).default(0),
  slot6: z.number().int().min(0).default(0),
  slot7: z.number().int().min(0).default(0),
  slot8: z.number().int().min(0).default(0),
  slot9: z.number().int().min(0).default(0),
});

const SpellListSchema = z.object({
  cantrips: z.array(SpellEntrySchema).optional(),
  level1: z.array(SpellEntrySchema).optional(),
  level2: z.array(SpellEntrySchema).optional(),
  level3: z.array(SpellEntrySchema).optional(),
  level4: z.array(SpellEntrySchema).optional(),
  level5: z.array(SpellEntrySchema).optional(),
  level6: z.array(SpellEntrySchema).optional(),
  level7: z.array(SpellEntrySchema).optional(),
  level8: z.array(SpellEntrySchema).optional(),
  level9: z.array(SpellEntrySchema).optional(),
});

// =============================================
// Feature Option (sub-choice within a feature)
// =============================================

const FeatureOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  cost: z.string().optional(),
  prerequisite: z.string().optional(),
  savingThrow: SaveDCSchema.optional(),
  damageType: z.array(DamageTypeEnum).optional(),
  conditions: z.array(ConditionEnum).optional(),
});

// =============================================
// Random / Roll Tables
// =============================================

const RandomTableSchema = z.object({
  name: z.string(),
  die: z.string(),
  entries: z.array(
    z.object({
      roll: z.string(),
      effect: z.string(),
    })
  ),
});

// =============================================
// Resource Scaling (Psionic Dice, Superiority Dice, etc.)
// =============================================

const ResourceScalingRowSchema = z.object({
  classLevel: z.number().int().min(1).max(20),
  dieSize: DieEnum.optional(),
  count: z.number().int().optional(),
  value: z.union([z.number(), z.string()]).optional(),
});

// =============================================
// Companion Stat Block (Beast Master, etc.)
// =============================================

const CompanionStatBlockSchema = z.object({
  name: z.string(),
  size: CreatureSizeEnum,
  creatureType: z.string(),
  alignment: z.string().optional(),
  acFormula: z.string(),
  hpFormula: z.string(),
  speeds: z.record(z.string(), z.union([z.number().int(), z.string()])),
  abilityScores: z.object({
    strength: z.number().int(),
    dexterity: z.number().int(),
    constitution: z.number().int(),
    intelligence: z.number().int(),
    wisdom: z.number().int(),
    charisma: z.number().int(),
  }),
  senses: z.array(z.string()).optional(),
  languages: z.string().optional(),
  challengeRating: z.string().optional(),
  proficiencyBonus: z.string().optional(),
  traits: z.array(z.object({ name: z.string(), description: z.string() })),
  actions: z.array(z.object({ name: z.string(), description: z.string() })),
});

// =============================================
// Subclass Spell Tables
// =============================================

const SubclassSpellTableSchema = z.object({
  name: z.string().optional(),
  condition: z.string().optional(),
  entries: z.array(
    z.object({
      classLevel: z.number().int().min(1).max(20),
      spells: z.array(z.string()),
    })
  ),
});

// =============================================
// Subclass Spellcasting (Third Casters: EK, AT)
// =============================================

const ThirdCasterSlotRowSchema = z.object({
  classLevel: z.number().int().min(1).max(20),
  preparedSpells: z.number().int().min(0),
  slot1: z.number().int().min(0).default(0),
  slot2: z.number().int().min(0).default(0),
  slot3: z.number().int().min(0).default(0),
  slot4: z.number().int().min(0).default(0),
});

const SubclassSpellcastingSchema = z.object({
  ability: AbilityScoreEnum,
  focus: z.string(),
  spellList: z.string(),
  cantrips: z.object({
    initial: z.number().int().min(0),
    additionalAtLevels: z.array(
      z.object({
        classLevel: z.number().int(),
        count: z.number().int(),
      })
    ),
  }),
  requiredCantrips: z.array(z.string()).optional(),
  spellSlotProgression: z.array(ThirdCasterSlotRowSchema),
  changePreparedSpells: z.enum(["onLevelUp", "onLongRest"]),
});

// =============================================
// Class Feature
// =============================================

const ClassFeatureSchema = z.object({
  name: z.string(),
  level: z.number().int().min(1).max(20),
  description: z.string(),
  activation: ActivationTypeEnum.optional(),
  usesPerRest: UsesPerRestSchema.optional(),
  options: z.array(FeatureOptionSchema).optional(),
  replacesOrImproves: z.string().optional(),
  grantsSpells: z.array(GrantedSpellSchema).optional(),
  grantsProficiencies: ProficiencyGrantsSchema.optional(),
  savingThrow: SaveDCSchema.optional(),
  abilityScoreIncrease: AbilityScoreIncreaseSchema.optional(),
  unarmoredDefense: UnarmoredDefenseSchema.optional(),
  scalingValues: z
    .record(z.string(), z.array(ScalingValueEntrySchema))
    .optional(),
  damageResistances: z.array(DamageTypeEnum).optional(),
  conditionImmunities: z.array(ConditionEnum).optional(),
  randomTables: z.array(RandomTableSchema).optional(),
});

// =============================================
// Subclass Feature
// =============================================

const SubclassFeatureSchema = z.object({
  name: z.string(),
  level: z.number().int().min(1).max(20),
  description: z.string(),
  activation: ActivationTypeEnum.optional(),
  usesPerRest: UsesPerRestSchema.optional(),
  options: z.array(FeatureOptionSchema).optional(),
  replacesOrImproves: z.string().optional(),
  grantsSpells: z.array(GrantedSpellSchema).optional(),
  grantsProficiencies: ProficiencyGrantsSchema.optional(),
  savingThrow: SaveDCSchema.optional(),
  unarmoredDefense: UnarmoredDefenseSchema.optional(),
  resourceScaling: z.array(ResourceScalingRowSchema).optional(),
  companionStatBlocks: z.array(CompanionStatBlockSchema).optional(),
  randomTables: z.array(RandomTableSchema).optional(),
  maneuverOptions: z.array(FeatureOptionSchema).optional(),
  scalingValues: z
    .record(z.string(), z.array(ScalingValueEntrySchema))
    .optional(),
  damageResistances: z.array(DamageTypeEnum).optional(),
  conditionImmunities: z.array(ConditionEnum).optional(),
  bonusHitPoints: z
    .object({
      perLevel: z.number().int().optional(),
      initial: z.number().int().optional(),
      formula: z.string().optional(),
    })
    .optional(),
});

// =============================================
// Subclass
// =============================================

const SubclassSchema = z.object({
  name: z.string(),
  description: z.string(),
  featureLevels: z.array(z.number().int().min(1).max(20)),
  features: z.array(SubclassFeatureSchema),
  subclassSpellTables: z.array(SubclassSpellTableSchema).optional(),
  subclassSpellcasting: SubclassSpellcastingSchema.optional(),
});

// =============================================
// Class Spellcasting Configuration
// =============================================

const ClassSpellcastingSchema = z.object({
  type: z.enum(["full", "half", "pact"]),
  ability: AbilityScoreEnum,
  focus: z.array(z.string()).min(1),
  ritualCasting: z
    .enum(["fromPrepared", "fromSpellbook", "none"])
    .default("none"),
  cantripsKnown: z.boolean().default(false),
  preparedSpellsMechanic: z.enum([
    "anyFromListOnLongRest",
    "oneSwapOnLongRest",
    "oneSwapOnLevelUp",
    "fromSpellbookOnLongRest",
  ]),
  usesSpellbook: z.boolean().default(false),
  spellbookConfig: z
    .object({
      initialSpellCount: z.number().int(),
      spellsGainedPerLevel: z.number().int(),
      copyingCostPerLevelGP: z.number().int(),
      copyingTimePerLevel: z.string(),
    })
    .optional(),
  additionalSpellListSources: z.array(z.string()).optional(),
  pactMagic: z.boolean().default(false),
  initialCantrips: z.number().int().optional(),
  initialPreparedSpells: z.number().int().optional(),
});

// =============================================
// Metamagic Option (Sorcerer)
// =============================================

const MetamagicOptionSchema = z.object({
  name: z.string(),
  sorceryPointCost: z.number().int().min(1),
  description: z.string(),
  stackableWithOthers: z.boolean().default(false),
});

// =============================================
// Eldritch Invocation (Warlock)
// =============================================

const EldritchInvocationSchema = z.object({
  name: z.string(),
  description: z.string(),
  prerequisite: z.string().optional(),
  repeatable: z.boolean().default(false),
  grantsSpell: z
    .object({
      spell: z.string(),
      noSlot: z.boolean().default(false),
      selfOnly: z.boolean().default(false),
    })
    .optional(),
  grantsPactFeature: z.boolean().default(false),
  grantsCantrips: z.array(z.string()).optional(),
  grantsRituals: z.array(z.string()).optional(),
});

// =============================================
// Spell Slot Creation Table (Sorcerer)
// =============================================

const SpellSlotCreationEntrySchema = z.object({
  slotLevel: z.number().int().min(1).max(5),
  sorceryPointCost: z.number().int(),
  minimumSorcererLevel: z.number().int(),
});

// =============================================
// Level Progression Row
// =============================================

const LevelRowSchema = z.object({
  level: z.number().int().min(1).max(20),
  proficiencyBonus: z.number().int().min(2).max(6),
  features: z.array(z.string()),

  // Standard spellcasting columns
  cantrips: z.number().int().min(0).optional(),
  preparedSpells: z.number().int().min(0).optional(),
  spellSlots: SpellSlotsSchema.optional(),

  // Warlock pact magic columns
  pactMagicSlots: z.number().int().min(0).optional(),
  pactMagicSlotLevel: z.number().int().min(1).max(5).optional(),

  // Barbarian columns
  rages: z.number().int().min(0).optional(),
  rageDamage: z.number().int().min(0).optional(),

  // Barbarian & Fighter column
  weaponMastery: z.number().int().min(0).optional(),

  // Bard column
  bardicDie: DieEnum.optional(),

  // Cleric & Paladin column
  channelDivinity: z.number().int().min(0).optional(),

  // Druid column
  wildShape: z.number().int().min(0).optional(),

  // Fighter column
  secondWind: z.number().int().min(0).optional(),

  // Monk columns
  martialArtsDie: DieEnum.optional(),
  focusPoints: z.number().int().min(0).optional(),
  unarmoredMovementBonus: z.number().int().min(0).optional(),

  // Rogue column
  sneakAttackDice: z.number().int().min(0).optional(),

  // Sorcerer column
  sorceryPoints: z.number().int().min(0).optional(),

  // Warlock column
  eldritchInvocations: z.number().int().min(0).optional(),

  // Ranger column
  favoredEnemy: z.number().int().min(0).optional(),
});

// =============================================
// Core Traits
// =============================================

const CoreTraitsSchema = z.object({
  primaryAbility: z.array(AbilityScoreEnum).min(1).max(2),
  hitPointDie: DieEnum,
  savingThrowProficiencies: z.tuple([AbilityScoreEnum, AbilityScoreEnum]),
  skillProficiencies: SkillChoiceSchema,
  weaponProficiencies: z.array(WeaponProficiencySchema),
  toolProficiencies: z.array(ToolProficiencySchema).optional(),
  armorTraining: z.array(ArmorCategoryEnum),
  startingEquipment: z.array(EquipmentOptionSchema).min(1),
});

// =============================================
// Multiclass Gains
// =============================================

const MulticlassGainsSchema = z.object({
  hitPointDie: z.literal(true),
  weaponProficiencies: z.array(WeaponProficiencySchema).optional(),
  armorTraining: z.array(ArmorCategoryEnum).optional(),
  skillProficiencies: SkillChoiceSchema.optional(),
  toolProficiencies: z.array(ToolProficiencySchema).optional(),
  spellcastingNote: z.string().optional(),
});

// =============================================
// TOP-LEVEL CLASS SCHEMA
// =============================================

export const ClassSchema = z.object({
  name: z.string(),
  description: z.string(),

  coreTraits: CoreTraitsSchema,
  multiclassing: MulticlassGainsSchema,

  spellcasting: ClassSpellcastingSchema.nullable(),

  levelProgression: z.array(LevelRowSchema).length(20),

  classFeatures: z.array(ClassFeatureSchema),

  subclassLabel: z.string(),
  subclassFeatureLevels: z.array(z.number().int().min(1).max(20)),
  subclasses: z.array(SubclassSchema).min(1),

  spellList: SpellListSchema.optional(),

  metamagicOptions: z.array(MetamagicOptionSchema).optional(),
  spellSlotCreationTable: z.array(SpellSlotCreationEntrySchema).optional(),

  eldritchInvocationOptions: z.array(EldritchInvocationSchema).optional(),

  classTables: z.array(RandomTableSchema).optional(),
});