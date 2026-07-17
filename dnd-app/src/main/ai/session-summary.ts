/**
 * Session summary + session-start recap — extracted from ai-service.ts on 2026-07-17
 * to keep that module under its file-size-budget ceiling (cohesive end-of-session /
 * start-of-session slice; see scripts/lint/file-size-budget.mjs). Uses only the
 * PUBLIC ai-service surface (getConversationManager, aiChatOnce) — no import cycle:
 * ai-service does not import this module.
 */
import { loadConversation } from '../storage/ai-conversation-storage'
import { aiChatOnce, getConversationManager } from './ai-service'
import { loadCampaignById } from './context/campaign-context'
import { buildSessionStartRecapPrompt, recapInputsEmpty, type SessionStartRecapInputs } from './context/recap-context'
import { getMemoryManager } from './memory/memory-manager'

/**
 * Generate an end-of-session summary for a campaign.
 * Uses the conversation manager's summarize callback.
 */
export async function generateSessionSummary(campaignId: string): Promise<string | null> {
  const conv = getConversationManager(campaignId)
  const summary = await conv.generateSessionSummary()

  // Also save to memory manager
  if (summary) {
    try {
      const memMgr = getMemoryManager(campaignId)
      const sessionId = memMgr.getSessionLogId()
      await memMgr.appendSessionLog(sessionId, `\n--- SESSION SUMMARY ---\n${summary}\n`)
      // The summary closes the sitting — the next session gets a fresh dated log
      // even though the manager singleton lives for the whole process.
      // (ISSUES-LOG-DNDAPP 2026-07-17)
      memMgr.endSessionSitting()
    } catch {
      // Non-fatal
    }
  }

  return summary
}

/** Extract the last 2 AI-authored journal recaps (title + capped content) from a campaign record. */
function extractJournalRecaps(campaign: Record<string, unknown> | null): Array<{ title: string; content: string }> {
  const journal = campaign?.journal as { entries?: Array<Record<string, unknown>> } | undefined
  const entries = journal?.entries ?? []
  return entries
    .filter((e) => e.authorId === 'ai-dm')
    .slice(-2)
    .map((e) => ({ title: String(e.title ?? 'Recap'), content: String(e.content ?? '').slice(0, 2000) }))
}

/**
 * PHASE-31 31B — build a player-facing "Previously on…" recap from the campaign record (conversation
 * summaries + last session log + world summary + saved recaps). Cached on disk; `force` regenerates.
 * Returns null for a brand-new campaign. NEVER mutates the ConversationManager (read-only access).
 */
export async function generateSessionStartRecap(
  campaignId: string,
  force = false
): Promise<{ text: string; generatedAt: string; cached: boolean } | null> {
  const memMgr = getMemoryManager(campaignId)
  if (!force) {
    const cached = await memMgr.getSessionStartRecap()
    if (cached) return { ...cached, cached: true }
  }

  let conversationSummaries = getConversationManager(campaignId)
    .serialize()
    .summaries.map((s) => s.content)
    .filter(Boolean)
  if (conversationSummaries.length === 0) {
    // Disk fallback — READ-ONLY (PHASE-07 owns restore; do not restore() into the manager).
    const disk = await loadConversation(campaignId)
    if (disk.success && disk.data) conversationSummaries = disk.data.summaries.map((s) => s.content).filter(Boolean)
  }

  const dates = await memMgr.listSessionLogDates()
  const latestSessionLog = dates.length > 0 ? await memMgr.getSessionLog(dates[dates.length - 1]) : ''
  const worldSummary = await memMgr.getWorldStateSummary()
  const journalRecaps = extractJournalRecaps(await loadCampaignById(campaignId))

  const inputs: SessionStartRecapInputs = { conversationSummaries, latestSessionLog, worldSummary, journalRecaps }
  if (recapInputsEmpty(inputs)) return null

  const { system, user } = buildSessionStartRecapPrompt(inputs)
  const text = (await aiChatOnce(system, user, 'summary')).trim()
  if (!text) return null
  const generatedAt = new Date().toISOString()
  await memMgr.saveSessionStartRecap({ text, generatedAt })
  return { text, generatedAt, cached: false }
}
