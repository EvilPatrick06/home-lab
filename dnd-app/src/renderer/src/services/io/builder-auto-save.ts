// ---------------------------------------------------------------------------
// Builder Draft Auto-Save Service
// ---------------------------------------------------------------------------
// Persists in-progress character builder state to localStorage so the user
// can recover unsaved work after accidental page navigation or app crash.
// ---------------------------------------------------------------------------

const DRAFT_KEY_PREFIX = 'builder-draft-'

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 2_000

function draftKey(characterId?: string | null): string {
  return `${DRAFT_KEY_PREFIX}${characterId || 'new'}`
}

/**
 * Serialize and persist the builder draft to localStorage.
 */
export function saveBuilderDraft(state: Record<string, unknown>, characterId?: string | null): void {
  try {
    const key = draftKey(characterId)
    const payload = {
      savedAt: Date.now(),
      state
    }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // localStorage may be full — silently ignore
  }
}

/**
 * Load a previously saved builder draft from localStorage.
 * Returns `null` if no draft exists or if parsing fails.
 */
export function loadBuilderDraft(
  characterId?: string | null
): { savedAt: number; state: Record<string, unknown> } | null {
  try {
    const raw = localStorage.getItem(draftKey(characterId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.savedAt === 'number' && parsed.state) {
      return parsed as { savedAt: number; state: Record<string, unknown> }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Remove a builder draft from localStorage.
 */
export function clearBuilderDraft(characterId?: string | null): void {
  try {
    localStorage.removeItem(draftKey(characterId))
  } catch {
    // Ignore removal errors
  }
}

/**
 * List all stored builder draft keys (useful for cleanup).
 */
export function listBuilderDrafts(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(DRAFT_KEY_PREFIX)) {
      keys.push(key.replace(DRAFT_KEY_PREFIX, ''))
    }
  }
  return keys
}

/**
 * Debounced auto-save. Call this from a store subscriber.
 * Only the last call within the debounce window is persisted.
 */
export function debouncedSaveBuilderDraft(state: Record<string, unknown>, characterId?: string | null): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    saveBuilderDraft(state, characterId)
    debounceTimer = null
  }, DEBOUNCE_MS)
}

/**
 * Cancel any pending debounced save.
 */
export function cancelPendingDraftSave(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}
