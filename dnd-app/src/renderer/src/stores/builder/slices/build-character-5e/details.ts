/**
 * Builder character-details merge — D&D 5e 2024
 *
 * Pure computation extracted from build-character-5e. Merges the builder's
 * detail fields over the existing character's details, preferring a non-empty
 * builder value, then the existing value, then undefined. No store get/set
 * closure.
 */
import type { CharacterDetails } from '../../../../types/character-5e'

/** Ordered (key → builder value) pairs, matching the legacy detailPairs list. */
export type BuilderDetailPairs = Array<[string, string | undefined]>

export function computeBuilderDetails5e(
  detailPairs: BuilderDetailPairs,
  existingDetails: CharacterDetails | undefined
): Record<string, string | undefined> {
  const ed = existingDetails
  return Object.fromEntries(detailPairs.map(([k, v]) => [k, v || ed?.[k as keyof typeof ed] || undefined])) as Record<
    string,
    string | undefined
  >
}
