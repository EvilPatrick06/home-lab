import moderationJson from '@data/5e/game/ai/moderation.json'

export const DEFAULT_BLOCKED_WORDS: string[] = moderationJson.blockedWords

export function filterMessage(message: string, blockedWords: string[]): string {
  let filtered = message
  for (const word of blockedWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    filtered = filtered.replace(regex, '***')
  }
  return filtered
}
