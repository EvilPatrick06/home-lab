import { z } from "zod";

// ── Shared Enums ──────────────────────────────────────────────

const AbilityScoreEnum = z.enum([
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
]);

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

const SizeEnum = z.enum(["Small", "Medium"]);

const RestTypeEnum = z.enum(["Short Rest", "Long Rest"]);

// ── Background Helpers ────────────────────────────────────────

const ToolProficiencySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("specific"),
    tool: z.string().min(1),
  }),
  z.object({
    kind: z.literal("choice"),
    category: z.enum(["Artisan's Tools", "Gaming Set", "Musical Instrument"]),
  }),
]);

const EquipmentEntrySchema = z.object({
  item: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  matchesToolProficiency: z
    .boolean()
    .default(false)
    .describe("True when this item is the same tool chosen for Tool Proficiency"),
});

// ── Background Schema ─────────────────────────────────────────

export const BackgroundSchema = z.object({
  name: z.enum([
    "Acolyte",
    "Artisan",
    "Charlatan",
    "Criminal",
    "Entertainer",
    "Farmer",
    "Guard",
    "Guide",
    "Hermit",
    "Merchant",
    "Noble",
    "Sage",
    "Sailor",
    "Scribe",
    "Soldier",
    "Wayfarer",
  ]),

  abilityScores: z
    .tuple([AbilityScoreEnum, AbilityScoreEnum, AbilityScoreEnum])
    .refine(([a, b, c]) => new Set([a, b, c]).size === 3, {
      message: "All three ability scores must be distinct",
    })
    .describe(
      "Three distinct ability scores. Player chooses: +2 to one and +1 to another, or +1 to all three. No score may exceed 20."
    ),

  feat: z
    .string()
    .min(1)
    .describe("Origin feat granted by this background (see chapter 5)"),

  skillProficiencies: z.tuple([SkillEnum, SkillEnum]),

  toolProficiency: ToolProficiencySchema,

  equipment: z.object({
    optionA: z.object({
      items: z.array(EquipmentEntrySchema).min(1),
      gp: z.number().int().nonnegative(),
    }),
    optionB: z.object({
      gp: z.literal(50),
    }),
  }),

  description: z.string().min(1),
});

// ── Species Helpers ───────────────────────────────────────────

const SpellcastingAbilitySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fixed"),
    ability: AbilityScoreEnum,
  }),
  z.object({
    type: z.literal("choice"),
    options: z
      .array(AbilityScoreEnum)
      .min(2)
      .describe("Player selects one of these abilities"),
  }),
]);

const LeveledSpellSchema = z.object({
  spell: z.string().min(1),
  requiredCharacterLevel: z.number().int().min(1),
  oncePerLongRestWithoutSlot: z.boolean().default(true),
});

const UsageLimitSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("perProficiencyBonus"),
    rechargesOn: RestTypeEnum,
  }),
  z.object({
    type: z.literal("fixedPerRest"),
    uses: z.number().int().positive(),
    rechargesOn: RestTypeEnum,
  }),
  z.object({
    type: z.literal("unlimited"),
  }),
]);

const LineageOptionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  damageResistances: z.array(DamageTypeEnum).optional(),
  darkvisionOverride: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Replaces the base species darkvision range in feet"),
  speedOverride: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Replaces the base species walking speed in feet"),
  cantrips: z.array(z.string().min(1)).optional(),
  leveledSpells: z.array(LeveledSpellSchema).optional(),
  damageType: DamageTypeEnum.optional().describe(
    "Associated damage type, e.g. for Draconic Ancestry or Fiendish Legacy"
  ),
  additionalBenefit: z
    .string()
    .optional()
    .describe("Free-text benefit not captured by other structured fields"),
});

const ScalingDamageSchema = z.object({
  baseDice: z.string().min(1).describe("e.g. '1d10'"),
  damageType: z.union([
    DamageTypeEnum,
    z.literal("determined by ancestry"),
  ]),
  scalingTiers: z
    .array(
      z.object({
        characterLevel: z.number().int().min(1),
        dice: z.string().min(1),
      })
    )
    .min(1),
  savingThrow: z
    .object({
      ability: AbilityScoreEnum,
      dcBase: z.number().int(),
      addModifier: AbilityScoreEnum,
      addProficiencyBonus: z.boolean(),
    })
    .optional(),
});

const SpeciesTraitSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),

  requiredCharacterLevel: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Minimum character level to access this trait"),

  usageLimit: UsageLimitSchema.optional(),

  damageResistances: z.array(DamageTypeEnum).optional(),

  savingThrowAdvantage: z
    .object({
      conditions: z
        .array(z.string().min(1))
        .optional()
        .describe("Advantage on saves to avoid or end these conditions"),
      abilityScores: z
        .array(AbilityScoreEnum)
        .optional()
        .describe("Advantage on saving throws using these ability scores"),
    })
    .optional(),

  spellcasting: z
    .object({
      ability: SpellcastingAbilitySchema,
      cantrips: z.array(z.string().min(1)).optional(),
      leveledSpells: z.array(LeveledSpellSchema).optional(),
    })
    .optional(),

  grantsOriginFeat: z
    .object({
      playerChoice: z.boolean(),
      recommended: z.string().optional(),
    })
    .optional()
    .describe("If present, this trait grants an Origin feat"),

  grantsSkillProficiency: z
    .object({
      count: z.number().int().positive(),
      from: z.union([z.array(SkillEnum).min(1), z.literal("any")]),
    })
    .optional(),

  lineageChoices: z
    .object({
      label: z
        .string()
        .min(1)
        .describe(
          "Name of the choice system, e.g. 'Elven Lineage', 'Draconic Ancestry', 'Fiendish Legacy'"
        ),
      spellcastingAbility: SpellcastingAbilitySchema.optional(),
      options: z.array(LineageOptionSchema).min(2),
    })
    .optional(),

  scalingDamage: ScalingDamageSchema.optional(),

  hpModification: z
    .object({
      base: z
        .number()
        .int()
        .optional()
        .describe("Flat HP added once, e.g. Dwarven Toughness +1"),
      perLevel: z
        .number()
        .int()
        .optional()
        .describe("Additional HP gained each level, e.g. Dwarven Toughness +1/level"),
    })
    .optional(),

  grantsFlight: z
    .object({
      speed: z.union([
        z.number().int().positive(),
        z.literal("equal to walking speed"),
      ]),
      durationMinutes: z.number().int().positive().optional(),
      requiredCharacterLevel: z.number().int().min(1).optional(),
    })
    .optional(),

  grantsTemporaryResize: z
    .object({
      toSize: z.enum(["Large"]),
      durationMinutes: z.number().int().positive(),
      requiredCharacterLevel: z.number().int().min(1),
    })
    .optional()
    .describe("E.g. Goliath Large Form"),

  speedIncrease: z
    .number()
    .int()
    .optional()
    .describe("Additional feet of speed added to base, e.g. +10 during Large Form"),
});

// ── Species Schema ────────────────────────────────────────────

export const SpeciesSchema = z.object({
  name: z.enum([
    "Aasimar",
    "Dragonborn",
    "Dwarf",
    "Elf",
    "Gnome",
    "Goliath",
    "Halfling",
    "Human",
    "Orc",
    "Tiefling",
  ]),

  creatureType: z.literal("Humanoid"),

  size: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("fixed"),
      value: SizeEnum,
    }),
    z.object({
      type: z.literal("choice"),
      options: z.array(SizeEnum).min(2),
    }),
  ]),

  speed: z
    .number()
    .int()
    .positive()
    .describe("Base walking speed in feet"),

  darkvision: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Base darkvision range in feet. Omitted when species has no innate darkvision. May be overridden by lineage options."
    ),

  traits: z.array(SpeciesTraitSchema).min(1),

  description: z.string().min(1),

  lifespan: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Approximate lifespan in years. Omitted when close to the default ~80 years."
    ),
});