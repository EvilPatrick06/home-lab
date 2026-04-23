import { z } from 'zod'

export const CharacterSaveSchema = z
  .object({
    id: z.string().uuid()
  })
  .passthrough()

export const CampaignSaveSchema = z
  .object({
    id: z.string().uuid()
  })
  .passthrough()

export const GameStateSaveSchema = z
  .object({
    schemaVersion: z.number().int().optional(),
    entities: z.array(z.unknown()).optional(),
    logs: z.array(z.unknown()).optional(),
    maps: z.array(z.unknown()).optional()
  })
  .passthrough()

export const BastionSaveSchema = z
  .object({
    id: z.string().uuid()
  })
  .passthrough()

export const HomebrewSaveSchema = z
  .object({
    id: z.string().uuid()
  })
  .passthrough()

export const CustomCreatureSaveSchema = z
  .object({
    id: z.string().uuid()
  })
  .passthrough()
