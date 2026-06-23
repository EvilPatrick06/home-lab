/**
 * Campaign-wizard draft persistence.
 *
 * The new-campaign wizard saves its full in-progress state here so a player can leave
 * mid-setup — to create/edit a player character, or to open Global Settings — and come
 * back to the EXACT step they were on instead of losing everything and landing back on
 * the campaign list. Backed by localStorage so it survives both in-app navigation and a
 * reload; cleared when the campaign is actually created (or the user discards it).
 */

const KEY = 'campaign-wizard-draft-v1'

/** Everything the wizard needs to resume: a flat snapshot of its state + the step index. */
export type CampaignWizardDraft = Record<string, unknown> & { step: number }

export function saveWizardDraft(draft: CampaignWizardDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Best-effort: a full/disabled localStorage just means no resume, not a crash.
  }
}

export function loadWizardDraft(): CampaignWizardDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CampaignWizardDraft
    return parsed && typeof parsed === 'object' && typeof parsed.step === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function clearWizardDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
