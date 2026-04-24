import { z } from "zod";

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

const EquipmentItemSchema = z.object({
  item: z.string(),
  quantity: z.number().int().min(1).optional(),
  descriptor: z.string().optional(),
  unit: z.string().optional(),
});

const EquipmentOptionSchema = z.object({
  option: z.string(),
  items: z.array(z.union([z.string(), EquipmentItemSchema])),
});

const BackgroundFeatSchema = z.object({
  name: z.string(),
  parenthetical: z.string().optional(),
  reference: z.string().optional(),
});

const ToolProficiencySchema = z.object({
  fixed: z.string().optional(),
  choice: z.string().nullable(),
});

export const BackgroundSchema = z.object({
  name: z.string(),
  description: z.string(),
  abilityScores: z.array(AbilityScoreEnum).min(1),
  skillProficiencies: z.array(SkillEnum).min(1),
  toolProficiency: z.union([z.string(), ToolProficiencySchema]),
  feat: z.union([z.string(), BackgroundFeatSchema]),
  equipment: z.array(EquipmentOptionSchema).min(1),
  source: z.string().optional(),
});

export type Background = z.infer<typeof BackgroundSchema>;