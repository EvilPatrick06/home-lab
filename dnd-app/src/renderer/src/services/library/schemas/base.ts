import { z } from 'zod'

export const BaseLibraryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  pluginId: z.string().optional()
})

export type BaseLibraryEntryParsed = z.infer<typeof BaseLibraryEntrySchema>
