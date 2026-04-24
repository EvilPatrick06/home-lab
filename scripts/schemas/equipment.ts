import { z } from "zod";

export const CostSchema = z.object({
  amount: z.number(),
  denomination: z.enum(["CP", "SP", "EP", "GP", "PP"]),
});

export const DamageDiceSchema = z.object({
  count: z.number().int().min(0),
  die: z.number().int().min(0),
  type: z.enum([
    "Bludgeoning",
    "Piercing",
    "Slashing",
    "Fire",
    "Acid",
    "Radiant",
  ]),
  fixedValue: z.number().int().optional(),
});

export const RangeSchema = z.object({
  normal: z.number().int(),
  long: z.number().int(),
});

export const AmmunitionPropertySchema = z.object({
  property: z.literal("Ammunition"),
  range: RangeSchema,
  ammunitionType: z.enum(["Arrow", "Bolt", "Bullet", "Needle"]),
});

export const ThrownPropertySchema = z.object({
  property: z.literal("Thrown"),
  range: RangeSchema,
});

export const VersatilePropertySchema = z.object({
  property: z.literal("Versatile"),
  twoHandedDamage: z.object({
    count: z.number().int().min(1),
    die: z.number().int().min(1),
  }),
});

export const SimplePropertySchema = z.object({
  property: z.enum([
    "Finesse",
    "Heavy",
    "Light",
    "Loading",
    "Reach",
    "Two-Handed",
  ]),
});

export const WeaponPropertySchema = z.discriminatedUnion("property", [
  AmmunitionPropertySchema,
  ThrownPropertySchema,
  VersatilePropertySchema,
  SimplePropertySchema,
]);

export const MasteryTypeSchema = z.enum([
  "Cleave",
  "Graze",
  "Nick",
  "Push",
  "Sap",
  "Slow",
  "Topple",
  "Vex",
]);

export const WeaponSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["Simple", "Martial"]),
  rangeCategory: z.enum(["Melee", "Ranged"]),
  cost: CostSchema,
  damage: DamageDiceSchema,
  weight: z
    .number()
    .nonnegative()
    .describe("Weight in pounds; 0 if no weight listed"),
  properties: z.array(WeaponPropertySchema),
  mastery: MasteryTypeSchema,
});

export const ArmorCategorySchema = z.enum(["Light", "Medium", "Heavy", "Shield"]);

export const ACFormulaSchema = z.object({
  base: z.number().int(),
  addDexModifier: z.boolean(),
  maxDexBonus: z.number().int().nullable().describe("null means no cap on Dex modifier"),
  isShieldBonus: z
    .boolean()
    .describe("true if this is an additive bonus like a Shield (+2)"),
});

export const DonDoffTimeSchema = z.object({
  donMinutes: z.number().int(),
  doffMinutes: z.number().int(),
});

export const ArmorSchema = z.object({
  name: z.string().min(1),
  category: ArmorCategorySchema,
  cost: CostSchema,
  ac: ACFormulaSchema,
  strengthRequirement: z
    .number()
    .int()
    .nullable()
    .describe("Minimum Strength score or null if none"),
  stealthDisadvantage: z.boolean(),
  weight: z.number().nonnegative().describe("Weight in pounds"),
  donDoffTime: DonDoffTimeSchema,
});

export const ToolUtilizeEntrySchema = z.object({
  description: z.string().min(1),
  dc: z.number().int(),
});

export const ToolVariantSchema = z.object({
  name: z.string().min(1),
  cost: CostSchema,
  weight: z.number().nonnegative(),
});

export const ToolSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["Artisan's Tools", "Other Tools"]),
  cost: CostSchema.nullable().describe("null if cost varies by variant"),
  weight: z.number().nonnegative().nullable().describe("null if weight varies by variant"),
  ability: z.enum([
    "Strength",
    "Dexterity",
    "Constitution",
    "Intelligence",
    "Wisdom",
    "Charisma",
  ]),
  utilize: z.array(ToolUtilizeEntrySchema),
  craft: z
    .array(z.string().min(1))
    .describe("Items this tool can craft; empty if none"),
  variants: z
    .array(ToolVariantSchema)
    .nullable()
    .describe("null if tool has no variants"),
});

export const MountSchema = z.object({
  name: z.string().min(1),
  cost: CostSchema,
  carryingCapacityLb: z.number().int().positive(),
});

export const SaddleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["Exotic", "Military", "Riding"]),
  cost: CostSchema,
  weight: z.number().nonnegative(),
});

export const DrawnVehicleSchema = z.object({
  name: z.string().min(1),
  cost: CostSchema,
  weight: z.number().nonnegative().describe("Weight in pounds"),
});

export const LargeVehicleSchema = z.object({
  name: z.string().min(1),
  speedMph: z.number().positive(),
  crew: z.number().int().nonnegative(),
  passengers: z.number().int().nonnegative(),
  cargoTons: z.number().nonnegative(),
  ac: z.number().int(),
  hp: z.number().int().positive(),
  damageThreshold: z
    .number()
    .int()
    .nullable()
    .describe("null if no damage threshold"),
  cost: CostSchema,
});

export const VehicleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("DrawnVehicle"),
    data: DrawnVehicleSchema,
  }),
  z.object({
    type: z.literal("LargeVehicle"),
    data: LargeVehicleSchema,
  }),
  z.object({
    type: z.literal("Saddle"),
    data: SaddleSchema,
  }),
]);

export const GearSchema = z.object({
  name: z.string().min(1),
  cost: CostSchema,
  weight: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Weight in pounds; null if negligible or not listed"),
  description: z.string().min(1),
  isPack: z.boolean().describe("true if item is a pack containing other items"),
  packContents: z
    .array(
      z.object({
        item: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .nullable()
    .describe("List of contents if isPack is true; null otherwise"),
  isMagicItem: z.boolean(),
  actionType: z
    .enum(["Attack", "Utilize", "Bonus Action", "None"])
    .nullable()
    .describe("Primary action type to use this gear, null if passive"),
  savingThrow: z
    .object({
      ability: z.enum([
        "Strength",
        "Dexterity",
        "Constitution",
        "Intelligence",
        "Wisdom",
        "Charisma",
      ]),
      dcFormula: z
        .string()
        .describe(
          "Raw DC formula, e.g. '8 + Dex modifier + Proficiency Bonus' or a fixed number like '10'"
        ),
    })
    .nullable()
    .describe("Saving throw required by target, null if none"),
  damage: DamageDiceSchema.nullable().describe(
    "Damage dealt by this gear if applicable; null otherwise"
  ),
  lightProperties: z
    .object({
      brightRadiusFt: z.number().int().nonnegative(),
      dimAdditionalFt: z.number().int().nonnegative(),
      durationHours: z.number().nonnegative().nullable(),
      shape: z.enum(["Radius", "Cone"]).default("Radius"),
    })
    .nullable()
    .describe("Light emission properties; null if item does not produce light"),
  capacityDescription: z
    .string()
    .nullable()
    .describe("Carrying/holding capacity description; null if none"),
});