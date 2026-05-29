import type { LibraryCategory } from '../types/library'
import { SCHEMA_REGISTRY, safeValidateEntry } from './library/schemas/registry'

/**
 * Phase 25d — save-time validation for homebrew content.
 *
 * Homebrew is intentionally flexible, so this validates only the structural
 * minimum as hard ERRORS (id / name / type) and surfaces everything else
 * (schema mismatches, unknown type) as WARNINGS — creativity must not be
 * blocked. When the item's `type` maps to a Phase-15 `SCHEMA_REGISTRY`
 * category, a failed `safeParse` becomes warnings, never errors.
 */
export interface HomebrewValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/** Best-effort map from a homebrew `type` to a SCHEMA_REGISTRY category. */
function resolveCategory(type: string): LibraryCategory | null {
  const t = type.toLowerCase()
  const candidates = [t, `${t}s`, t.endsWith('y') ? `${t.slice(0, -1)}ies` : ''].filter(Boolean)
  for (const c of candidates) {
    if (c in SCHEMA_REGISTRY) return c as LibraryCategory
  }
  return null
}

export function validateHomebrew(item: unknown): HomebrewValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof item !== 'object' || item === null) {
    return { valid: false, errors: ['Homebrew entry must be an object'], warnings }
  }
  const rec = item as Record<string, unknown>

  // Structural minimum — hard errors.
  if (!rec.id || typeof rec.id !== 'string') errors.push('id is required')
  if (!rec.name || typeof rec.name !== 'string') errors.push('name is required')
  if (!rec.type || typeof rec.type !== 'string') errors.push('type is required')

  // Schema check (warnings only) when the type maps to a known category.
  if (typeof rec.type === 'string') {
    const category = resolveCategory(rec.type)
    if (!category) {
      warnings.push(`Unknown homebrew type "${rec.type}" — saved without schema validation`)
    } else {
      const result = safeValidateEntry(category, item)
      if (!result.success) {
        for (const issue of result.error.issues) {
          warnings.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
