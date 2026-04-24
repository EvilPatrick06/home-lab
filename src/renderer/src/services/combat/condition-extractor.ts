/**
 * Extract conditions that monster actions can apply from action descriptions.
 * Used by combat resolver and DM tools to auto-suggest condition application.
 */

export interface ExtractedCondition {
  condition: string
  saveType?: string // "Strength", "Constitution", etc.
  saveDC?: number
  duration?: string // "1 round", "until end of target's next turn", etc.
  onSave?: string // "half damage", "no effect", etc.
}

const CONDITION_NAMES = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
  'Burning'
]

const CONDITION_PATTERN = new RegExp(`\\b(${CONDITION_NAMES.join('|')})\\b\\s*(condition)?`, 'gi')

const SAVE_PATTERN = /DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw/gi

const SAVE_PATTERN_ALT =
  /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw[^.]*?DC\s+(\d+)/gi

const DURATION_PATTERNS = [
  /until the (?:start|end) of (?:the target's|its|the creature's) next turn/i,
  /for (\d+) (minute|hour|round|day)s?/i,
  /until (?:it|the target) (?:succeeds|makes|passes)/i,
  /until the (?:spell|effect) ends/i
]

/**
 * Extract conditions that a monster action description mentions applying.
 * Returns an array of conditions with save info when available.
 */
export function extractConditionsFromDescription(description: string): ExtractedCondition[] {
  if (!description) return []

  const conditions: ExtractedCondition[] = []
  const seen = new Set<string>()

  // Find all condition mentions
  let match: RegExpExecArray | null
  const condRegex = new RegExp(CONDITION_PATTERN.source, CONDITION_PATTERN.flags)
  while ((match = condRegex.exec(description)) !== null) {
    const condition = match[1]
    // Capitalize first letter for consistency
    const normalized = condition.charAt(0).toUpperCase() + condition.slice(1).toLowerCase()

    if (seen.has(normalized)) continue
    seen.add(normalized)

    const extracted: ExtractedCondition = { condition: normalized }

    // Look for save DC
    const saveMatch = description.match(SAVE_PATTERN) || description.match(SAVE_PATTERN_ALT)
    if (saveMatch) {
      // Parse out the DC and ability from the match
      const dcMatch = description.match(/DC\s+(\d+)/)
      const abilityMatch = description.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving/i)
      if (dcMatch) extracted.saveDC = parseInt(dcMatch[1], 10)
      if (abilityMatch) extracted.saveType = abilityMatch[1]
    }

    // Look for duration
    for (const durationPattern of DURATION_PATTERNS) {
      const durMatch = description.match(durationPattern)
      if (durMatch) {
        extracted.duration = durMatch[0]
        break
      }
    }

    conditions.push(extracted)
  }

  return conditions
}

/**
 * Check if a monster action applies any conditions (fast check without full extraction).
 */
export function actionAppliesConditions(description: string): boolean {
  if (!description) return false
  return CONDITION_PATTERN.test(description)
}
