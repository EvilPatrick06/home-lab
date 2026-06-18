/**
 * PHASE-37 37A — the versioned `.dndseed` pack format: a shareable "campaign seed" (world lore, NPCs,
 * adventure arcs, starter quests, encounter tables, tone instructions, an opening scene) with none of
 * the play-state a full `.dndcamp` snapshot drags along. zod v4 `looseObject` everywhere so unknown /
 * third-party fields survive an import→export round trip.
 */

import { z } from 'zod'

export const SEED_PACK_FORMAT = 'dnd-vtt-seed-pack' as const
export const SEED_PACK_FORMAT_VERSION = 1 as const

const SeedLoreSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.enum(['world', 'faction', 'location', 'item', 'other']),
  isVisibleToPlayers: z.boolean().optional(),
  keywords: z.array(z.string()).max(20).optional() // PHASE-25 world-info forward hook (LoreEntry.keywords)
})

const SeedNpcSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  location: z.string().optional(),
  role: z.enum(['ally', 'enemy', 'neutral', 'patron', 'shopkeeper']).optional(),
  personality: z.string().optional(),
  motivation: z.string().optional(),
  statBlockId: z.string().optional(),
  notes: z.string().optional(),
  isVisible: z.boolean().optional()
})

const SeedAdventureSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().min(1),
  levelTier: z.string().optional(),
  premise: z.string().optional(),
  hook: z.string().optional(),
  villain: z.string().optional(),
  setting: z.string().optional(),
  playerStakes: z.string().optional(),
  encounters: z.string().optional(),
  climax: z.string().optional(),
  resolution: z.string().optional()
})

const SeedQuestSchema = z.looseObject({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  objectives: z.array(z.string().min(1).max(500)).max(8).default([]),
  chapterQuest: z.boolean().default(false)
})

const SeedRollTableSchema = z
  .looseObject({
    id: z.string().min(1),
    name: z.string().min(1),
    diceFormula: z.string().min(2),
    entries: z.array(z.object({ min: z.number().int(), max: z.number().int(), text: z.string().min(1) })).min(1)
  })
  .refine((t) => t.entries.every((e) => e.min <= e.max), { message: 'every table entry must have min <= max' })

const SeedEncounterSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  monsters: z.array(z.looseObject({ monsterId: z.string().min(1), count: z.number().int().min(1) })),
  difficulty: z.enum(['trivial', 'easy', 'moderate', 'hard', 'deadly']),
  levelRange: z.object({ min: z.number().int(), max: z.number().int() }),
  totalXP: z.number()
})

const SeedCustomRuleSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.enum(['combat', 'exploration', 'social', 'rest', 'other'])
})

export const SeedPackSchema = z.looseObject({
  format: z.literal(SEED_PACK_FORMAT),
  formatVersion: z.literal(1),
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  author: z.string().max(120).optional(),
  system: z.string().default('dnd5e'),
  levelRange: z.object({ min: z.number().int().min(1), max: z.number().int().max(20) }).optional(),
  tags: z.array(z.string()).max(12).optional(),
  toneInstructions: z.string().max(4000).optional(),
  openingScene: z
    .looseObject({
      title: z.string().optional(),
      readAloud: z.string().min(1).max(4000),
      dmNotes: z.string().max(2000).optional()
    })
    .optional(),
  lore: z.array(SeedLoreSchema).max(100).optional(),
  npcs: z.array(SeedNpcSchema).max(100).optional(),
  adventures: z.array(SeedAdventureSchema).max(20).optional(),
  quests: z.array(SeedQuestSchema).max(25).optional(),
  encounterTables: z.array(SeedRollTableSchema).max(25).optional(),
  encounters: z.array(SeedEncounterSchema).max(50).optional(),
  customRules: z.array(SeedCustomRuleSchema).max(50).optional(),
  extensions: z.record(z.string(), z.unknown()).optional()
})
export type SeedPack = z.infer<typeof SeedPackSchema>

/**
 * Parse arbitrary data into a SeedPack, distinguishing three user-facing failure modes:
 * not a seed pack, made-with-a-newer-version, and field-level validation errors.
 */
export function parseSeedPack(data: unknown): { ok: true; pack: SeedPack } | { ok: false; error: string } {
  if (!data || typeof data !== 'object') return { ok: false, error: 'This file is not a seed pack.' }
  const obj = data as Record<string, unknown>
  if (obj.format !== SEED_PACK_FORMAT) return { ok: false, error: 'This file is not a seed pack.' }
  if (typeof obj.formatVersion === 'number' && obj.formatVersion > SEED_PACK_FORMAT_VERSION) {
    return { ok: false, error: 'This seed pack was made with a newer app version — update to import it.' }
  }
  const result = SeedPackSchema.safeParse(data)
  if (result.success) return { ok: true, pack: result.data }
  const issue = result.error.issues[0]
  const path = issue?.path.join('.') || '(root)'
  return { ok: false, error: `Invalid seed pack — ${path}: ${issue?.message ?? 'validation failed'}` }
}
