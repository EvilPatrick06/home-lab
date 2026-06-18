/**
 * PHASE-37 37D — renderer wrapper for seeding a pack's quests into the main-side quest store.
 * A no-op for empty/undefined; any failure is caught into an error envelope so a quest-seeding
 * failure can never abort campaign creation (callers toast and continue).
 */

import type { SeedPack } from './seed-pack-schema'

export async function seedQuestsFromPack(
  campaignId: string,
  quests: SeedPack['quests']
): Promise<{ success: boolean; added?: number; error?: string }> {
  if (!quests || quests.length === 0) return { success: true, added: 0 }
  try {
    return await window.api.ai.seedQuests(
      campaignId,
      quests.map((q) => ({
        name: q.name,
        description: q.description,
        objectives: q.objectives,
        chapterQuest: q.chapterQuest
      }))
    )
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
