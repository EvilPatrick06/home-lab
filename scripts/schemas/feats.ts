import { z } from "zod";

const AbilityScore = z.enum([
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma",
]);

const FeatCategory = z.enum([
  "Origin",
  "General",
  "Fighting Style",
  "Epic Boon",
]);

const PrerequisiteAbilityScoreRequirement = z.object({
  abilities: z.array(AbilityScore).min(1).describe(
    "One or more ability scores of which the character must meet the minimum in at least one (OR logic)"
  ),
  minimum: z.number().int().min(1).describe("Minimum score required in at least one of the listed abilities"),
}).strict();

const PrerequisitesSchema = z.object({
  level: z.number().int().min(1).optional().describe("Minimum character level required, e.g. 4 or 19"),
  abilityScores: z.array(PrerequisiteAbilityScoreRequirement).min(1).optional().describe(
    "Each entry is an OR-group: character needs at least one listed ability at the minimum. Multiple entries are AND-ed together."
  ),
  features: z.array(z.string().min(1)).min(1).optional().describe(
    "Required features or training, e.g. 'Fighting Style Feature', 'Spellcasting or Pact Magic Feature', 'Medium Armor Training', 'Shield Training'"
  ),
}).strict();

const AbilityScoreIncreaseOptionSchema = z.object({
  abilities: z.union([
    z.array(AbilityScore).min(1),
    z.literal("any"),
  ]).describe("Which ability scores can be chosen for this increase; 'any' means any ability score"),
  amount: z.number().int().positive().describe("The amount each chosen ability score is increased by"),
  maximum: z.number().int().positive().describe("The maximum the ability score can reach via this increase (20 for General, 30 for Epic Boon)"),
  count: z.number().int().positive().describe(
    "How many distinct ability scores the character selects to increase under this option (usually 1; 2 for the split option of Ability Score Improvement)"
  ),
}).strict();

const AbilityScoreIncreaseSchema = z.object({
  options: z.array(AbilityScoreIncreaseOptionSchema).min(1).describe(
    "Mutually exclusive choices; the character picks exactly one option. Most feats have a single option; Ability Score Improvement has two."
  ),
}).strict();

const BenefitSchema = z.object({
  name: z.string().min(1).describe("The bold-headed name of the benefit, e.g. 'Initiative Proficiency', 'Parry', 'Heavy Weapon Mastery'"),
  description: z.string().min(1).describe("Full rules text of this specific benefit"),
}).strict();

const RepeatableSchema = z.object({
  restriction: z.string().optional().describe(
    "Condition for retaking, e.g. 'you must choose a different spell list each time' or 'you must choose a different damage type each time for Energy Mastery'. Absent if no restriction."
  ),
}).strict().describe("Present only if the feat can be taken more than once");

export const FeatSchema = z.object({
  name: z.string().min(1).describe("The feat's display name, e.g. 'Ability Score Improvement', 'Boon of Combat Prowess'"),

  category: FeatCategory.describe("One of the four feat categories: Origin, General, Fighting Style, or Epic Boon"),

  description: z.string().optional().describe(
    "Optional overall flavor or rules text that appears before any named benefits. Used for simple feats whose entire effect is a single paragraph (e.g. Savage Attacker, Tough, Fighting Style feats)."
  ),

  prerequisites: PrerequisitesSchema.optional().describe(
    "Omitted if the feat has no prerequisites (e.g. Origin feats). All listed conditions must be met (AND logic across fields)."
  ),

  repeatable: RepeatableSchema.optional().describe(
    "Present only if the feat can be taken more than once. Omitted for feats that may only be taken once."
  ),

  abilityScoreIncrease: AbilityScoreIncreaseSchema.optional().describe(
    "Structured representation of the Ability Score Increase benefit granted by the feat, if any. Omitted for feats that grant no ASI (Origin feats, Fighting Style feats)."
  ),

  benefits: z.array(BenefitSchema).describe(
    "Named mechanical benefits of the feat (excluding the Ability Score Increase, which is captured in abilityScoreIncrease). May be empty for feats whose entire effect is captured by description and/or abilityScoreIncrease alone."
  ),
}).strict();

export type Feat = z.infer<typeof FeatSchema>;