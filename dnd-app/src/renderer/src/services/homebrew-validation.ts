// ---------------------------------------------------------------------------
// Homebrew Validation Service
// ---------------------------------------------------------------------------
// Provides basic validation for homebrew entries to catch common mistakes
// before saving (empty names, invalid types, duplicate names).
// ---------------------------------------------------------------------------

const VALID_HOMEBREW_TYPES = [
  'species',
  'class',
  'subclass',
  'background',
  'feat',
  'spell',
  'item',
  'monster',
  'magic-item',
  'weapon',
  'armor',
  'tool',
  'other'
]

export interface HomebrewValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a homebrew entry for required fields and basic integrity.
 */
export function validateHomebrewEntry(entry: Record<string, unknown>): HomebrewValidationResult {
  const errors: string[] = []

  // Check name
  if (!entry.name || typeof entry.name !== 'string') {
    errors.push('Name is required')
  } else if (entry.name.trim().length === 0) {
    errors.push('Name cannot be empty')
  } else if (entry.name.trim().length > 200) {
    errors.push('Name is too long (max 200 characters)')
  }

  // Check type
  if (!entry.type || typeof entry.type !== 'string') {
    errors.push('Type is required')
  } else if (!VALID_HOMEBREW_TYPES.includes(entry.type)) {
    errors.push(`Invalid type "${entry.type}". Must be one of: ${VALID_HOMEBREW_TYPES.join(', ')}`)
  }

  // Check id
  if (!entry.id || typeof entry.id !== 'string') {
    errors.push('ID is required')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Check if a homebrew entry name is a duplicate within its category.
 */
export function checkDuplicateName(
  name: string,
  category: string,
  existingEntries: Array<{ name?: unknown; type?: unknown }>
): boolean {
  const normalizedName = name.trim().toLowerCase()
  return existingEntries.some((entry) => {
    if (typeof entry.name !== 'string') return false
    const entryCategory = typeof entry.type === 'string' ? entry.type : ''
    return entry.name.trim().toLowerCase() === normalizedName && entryCategory === category
  })
}
