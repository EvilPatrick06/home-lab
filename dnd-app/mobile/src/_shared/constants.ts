// ============================================================================
// Shared Constants
// Used by both main and renderer processes.
// ============================================================================

// IPC file size limits
export const MAX_READ_FILE_SIZE = 50 * 1024 * 1024 // 50 MB (maps)
export const MAX_WRITE_CONTENT_SIZE = 10 * 1024 * 1024 // 10 MB (data files)

// How long the main process waits for the DM to approve an AI web-search request
// before hard auto-rejecting it (ai-service.ts waitForWebSearchApproval). Shared so
// the renderer approval prompt can render an accurate countdown.
export const WEB_SEARCH_APPROVAL_TIMEOUT_MS = 30_000

// Canonical opening-scene prompt. Lives in shared/ because the main process
// (ai-service prepareScene + cancelScenePrep) and the renderer fallback
// (use-ai-dm-store setScene) must send the IDENTICAL string — cancel/retry
// cleanup matches on it verbatim.
export const SCENE_PREP_PROMPT =
  'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.'
