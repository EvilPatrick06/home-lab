import moderationJson from '@data/5e/game/ai/moderation.json'
import { load5eModeration } from '../services/data-provider'

export const DEFAULT_BLOCKED_WORDS: string[] = moderationJson.blockedWords

/** Load moderation config from the data store (includes plugin additions). */
export async function loadModerationData(): Promise<unknown> {
  return load5eModeration()
}

export function filterMessage(message: string, blockedWords: string[]): string {
  let filtered = message
  for (const word of blockedWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    filtered = filtered.replace(regex, '***')
  }
  return filtered
}
