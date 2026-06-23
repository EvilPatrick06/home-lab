/**
 * PHASE-48 F1 — does the builder hold unsaved work worth confirming before exit?
 *
 * `CharacterBuilder5e.handleBack` only prompted when editing an EXISTING
 * character; a brand-new build was reset + navigated away silently, so a
 * substantially-built unsaved character was lost on a single "← Back" click.
 * This predicate lets Back prompt for a new build too, while still letting a
 * pristine, untouched builder exit without a nag.
 */
export function builderHasUnsavedContent(
  characterName: string,
  buildSlots: ReadonlyArray<{ selectedId?: string | null }>
): boolean {
  if (characterName.trim().length > 0) return true
  return buildSlots.some((slot) => slot.selectedId != null)
}
