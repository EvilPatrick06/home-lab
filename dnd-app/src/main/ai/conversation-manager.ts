import { logToFile } from '../log'
import { DM_TOOLBOX_CONTEXT, PLANAR_RULES_CONTEXT } from './dm-system-prompt'
import { assembleSystemPrompt } from './prompt-assembler'
import { COMBAT_TACTICS_PROMPT } from './prompt-sections/combat-tactics'
import {
  estimateTokens,
  getActiveContextWindow,
  getEffectiveBudgets,
  OUTPUT_RESERVE,
  trimToTokenBudget
} from './token-budget'
import type { ChatMessage, ConversationData, ConversationMessage, ConversationSummary } from './types'

const MAX_RECENT_MESSAGES = 10

// PHASE-26 — scene-boundary layered-memory tuning (exported for tests).
export const SCENE_CARRYOVER_MESSAGES = 4 // recent messages kept verbatim across a boundary
export const SCENE_SUMMARY_MIN_MESSAGES = 6 // smaller scenes are not worth an LLM call
export const SCENE_ROLLUP_KEEP = 4 // scene summaries kept verbatim after a session roll-up
export const SCENE_ROLLUP_THRESHOLD = 8 // scene-tier count that triggers a session roll-up
export const SESSION_ROLLUP_THRESHOLD = 4 // session-tier count that triggers a campaign roll-up
export const SUMMARY_BLOCK_BUDGET = 1200 // token cap for the assembled [CAMPAIGN MEMORY] block

export type SummarizationMode = 'threshold' | 'scene'

export class ConversationManager {
  private messages: ConversationMessage[] = []
  private summaries: ConversationSummary[] = []
  private activeCharacterIds: string[] = []
  private summarizeCallback: ((text: string) => Promise<string>) | null = null
  /** Whether context was truncated in the last API call preparation */
  private _contextTruncated = false
  /** Total estimated tokens used in the last API call preparation */
  private _lastTokenEstimate = 0
  /** PHASE-26: 'threshold' (default, byte-identical to pre-phase) or 'scene' (layered memory). */
  private summarizationMode: SummarizationMode = 'threshold'
  /** PHASE-26: set in scene mode when the budget loop drops messages; consumed off the request path by 26C. */
  private _overflowSplitNeeded = false

  /** Set the callback used for summarization (provided by AiService). */
  setSummarizeCallback(cb: (text: string) => Promise<string>): void {
    this.summarizeCallback = cb
  }

  /** PHASE-26: switch compaction strategy. */
  setSummarizationMode(mode: SummarizationMode): void {
    this.summarizationMode = mode
  }

  /** PHASE-26: true when the last scene-mode getMessagesForApi dropped messages (overflow backstop). */
  get overflowSplitNeeded(): boolean {
    return this._overflowSplitNeeded
  }

  private tierOf(s: ConversationSummary): 'scene' | 'session' | 'campaign' {
    return s.tier ?? 'scene' // legacy untiered entries are scene-tier
  }

  /** Returns true if the last getMessagesForApi() had to truncate context. */
  get contextWasTruncated(): boolean {
    return this._contextTruncated
  }

  /** Estimated token count from the last API call preparation. */
  get lastTokenEstimate(): number {
    return this._lastTokenEstimate
  }

  addMessage(role: 'user' | 'assistant', content: string, contextChunkIds?: string[]): void {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      contextChunkIds
    })
  }

  getMessages(): ConversationMessage[] {
    return this.messages
  }

  getActiveCharacterIds(): string[] {
    return this.activeCharacterIds
  }

  setActiveCharacterIds(ids: string[]): void {
    this.activeCharacterIds = ids
  }

  getMessageCount(): number {
    return this.messages.length
  }

  clear(): void {
    this.messages = []
    this.summaries = []
    this._overflowSplitNeeded = false
  }

  /** PHASE-26: per-tier summary counts + current un-summarized message count (for AI_SCENE_MEMORY_GET). */
  getSummaryTierCounts(): { scene: number; session: number; campaign: number; currentSceneMessageCount: number } {
    let scene = 0
    let session = 0
    let campaign = 0
    for (const s of this.summaries) {
      const t = this.tierOf(s)
      if (t === 'scene') scene++
      else if (t === 'session') session++
      else campaign++
    }
    return { scene, session, campaign, currentSceneMessageCount: this.messages.length }
  }

  /** Remove the last message iff it is a user message with exactly this content. */
  removeTrailingUserMessage(content: string): boolean {
    const last = this.messages[this.messages.length - 1]
    if (last && last.role === 'user' && last.content === content) {
      this.messages.pop()
      return true
    }
    return false
  }

  /**
   * PHASE-32 32D — pop the trailing assistant message (the X-card rewind). Returns whether one was
   * removed. Only ever touches the un-summarized tail: summaries cover a pruned prefix (see restore()
   * / the post-prune coversUpTo=-1 invariant), so this never desyncs a summary. (Note for PHASE-26.)
   */
  removeLastAssistantMessage(): boolean {
    const last = this.messages[this.messages.length - 1]
    if (last && last.role === 'assistant') {
      this.messages.pop()
      return true
    }
    return false
  }

  /**
   * Clear the conversation iff it consists solely of the scene-prep exchange:
   * [user: prompt] or [user: prompt, assistant: anything]. Never touches a
   * conversation with real history.
   */
  clearScenePrepExchange(prompt: string): boolean {
    const onlyPrep =
      this.messages.length >= 1 &&
      this.messages.length <= 2 &&
      this.messages[0].role === 'user' &&
      this.messages[0].content === prompt
    if (onlyPrep) {
      this.clear()
      return true
    }
    return false
  }

  /**
   * Build the messages array for the API call,
   * including summary prefix and recent messages within token budget.
   */
  async getMessagesForApi(
    contextBlock: string,
    contextTruncated = false
  ): Promise<{
    systemPrompt: string
    messages: ChatMessage[]
  }> {
    // PHASE-26: scene mode never summarizes on the request path (boundaries do it, off-path).
    if (this.summarizationMode !== 'scene') await this.maybeSummarize()

    const includesPlanarContent =
      contextBlock?.includes('planar') ||
      contextBlock?.includes('Astral') ||
      contextBlock?.includes('Ethereal') ||
      contextBlock?.includes('Feywild') ||
      contextBlock?.includes('Shadowfell') ||
      contextBlock?.includes('Elemental Plane') ||
      contextBlock?.includes('Outer Plane') ||
      contextBlock?.includes('Abyss') ||
      contextBlock?.includes('Nine Hells')
    const includesToolboxContent =
      contextBlock?.includes('ACTIVE EFFECTS') ||
      contextBlock?.includes('active_disease') ||
      contextBlock?.includes('active_curse') ||
      contextBlock?.includes('placed_trap') ||
      contextBlock?.includes('chase')
    const hasCombat = contextBlock?.includes('Initiative:')
    const systemPrompt =
      assembleSystemPrompt() +
      (hasCombat ? COMBAT_TACTICS_PROMPT : '') +
      (includesPlanarContent ? PLANAR_RULES_CONTEXT : '') +
      (includesToolboxContent ? DM_TOOLBOX_CONTEXT : '') +
      (contextBlock ? `\n\n${contextBlock}` : '')
    const apiMessages: ChatMessage[] = []

    const latestSummary = this.summaries.length > 0 ? this.summaries[this.summaries.length - 1] : null

    const startIdx = latestSummary ? latestSummary.coversUpTo + 1 : 0
    const recentMessages = this.messages.slice(startIdx)

    let tokenCount = 0
    const withinBudget: ConversationMessage[] = []
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(recentMessages[i].content)
      if (tokenCount + msgTokens > getEffectiveBudgets().conversationHistory && withinBudget.length > 0) break
      tokenCount += msgTokens
      withinBudget.unshift(recentMessages[i])
    }

    // PHASE-26: scene mode flags an overflow (the budget loop dropped messages) so 26C can
    // split off-path. In threshold mode this is never read.
    if (this.summarizationMode === 'scene' && withinBudget.length < recentMessages.length) {
      this._overflowSplitNeeded = true
    }

    // The prefix text differs by mode: threshold keeps the flat single-summary wrapper
    // (byte-identical to pre-phase); scene mode injects the layered [CAMPAIGN MEMORY] block.
    const summaryPrefix =
      this.summarizationMode === 'scene'
        ? this.buildLayeredBlock() || null
        : latestSummary
          ? `[Previous conversation summary: ${latestSummary.content}]`
          : null

    if (summaryPrefix && withinBudget.length > 0 && withinBudget[0].role === 'user') {
      apiMessages.push({
        role: 'user',
        content: `${summaryPrefix}\n\n${withinBudget[0].content}`
      })
      for (let i = 1; i < withinBudget.length; i++) {
        apiMessages.push({ role: withinBudget[i].role, content: withinBudget[i].content })
      }
    } else if (summaryPrefix && (withinBudget.length === 0 || withinBudget[0].role === 'assistant')) {
      apiMessages.push({
        role: 'user',
        content: `${summaryPrefix}\n\nPlease continue from where we left off.`
      })
      for (const msg of withinBudget) {
        apiMessages.push({ role: msg.role, content: msg.content })
      }
    } else {
      for (const msg of withinBudget) {
        apiMessages.push({ role: msg.role, content: msg.content })
      }
    }

    const cleaned = ensureAlternating(apiMessages)

    // Track token usage and truncation for DM alerting
    const totalTokens = estimateTokens(systemPrompt) + cleaned.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    this._lastTokenEstimate = totalTokens
    // True when history messages were actually DROPPED (withinBudget shorter than the
    // candidate set), OR the assembled prompt overflows the context window, OR the caller
    // reported a context-section trim (contextTruncated, from buildContext's breakdown).
    // The old `tokenCount >= conversationHistory` check was a false negative: the budget loop
    // breaks BEFORE adding the message that would exceed the budget, so tokenCount is always
    // strictly below budget exactly when messages were dropped (07B / F3).
    this._contextTruncated =
      withinBudget.length < recentMessages.length ||
      totalTokens > getActiveContextWindow() - OUTPUT_RESERVE ||
      contextTruncated

    return { systemPrompt, messages: cleaned }
  }

  /**
   * Generate an end-of-session summary using the summarize callback.
   * Covers all messages since the last summary (or all messages).
   */
  async generateSessionSummary(): Promise<string | null> {
    if (!this.summarizeCallback) return null

    // PHASE-26 scene mode: roll the scene-tier summaries (since the last session entry) + the
    // remaining message tail into one session-tier entry — better input, same export contract.
    if (this.summarizationMode === 'scene') {
      const sceneContents = this.summaries.filter((s) => this.tierOf(s) === 'scene').map((s) => s.content)
      const transcript = this.messages
        .map((m) => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.content.slice(0, 500)}`)
        .join('\n')
      const inputParts = [...sceneContents]
      if (transcript) inputParts.push(transcript)
      if (inputParts.length === 0) return null
      try {
        const summary = await this.summarizeCallback(
          `Generate an end-of-session recap for the players. Summarize key events, decisions, combat outcomes, NPC interactions, and any unresolved plot threads:\n\n${inputParts.join('\n')}`
        )
        this.summaries = [
          ...this.summaries.filter((s) => this.tierOf(s) === 'campaign'),
          ...this.summaries.filter((s) => this.tierOf(s) === 'session'),
          { content: summary, coversUpTo: -1, tier: 'session', createdAt: new Date().toISOString() }
        ]
        if (this.messages.length > SCENE_CARRYOVER_MESSAGES) {
          this.messages.splice(0, this.messages.length - SCENE_CARRYOVER_MESSAGES)
        }
        return summary
      } catch {
        return null
      }
    }

    if (this.messages.length === 0) return null

    const startIdx = this.summaries.length > 0 ? this.summaries[this.summaries.length - 1].coversUpTo + 1 : 0
    const recentMessages = this.messages.slice(startIdx)
    if (recentMessages.length === 0) return null

    const summaryText = recentMessages
      .map((m) => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    try {
      const summary = await this.summarizeCallback(
        `Generate an end-of-session recap for the players. Summarize key events, decisions, combat outcomes, NPC interactions, and any unresolved plot threads:\n\n${summaryText}`
      )
      // Store as a summary covering all remaining messages
      this.summaries.push({
        content: summary,
        coversUpTo: this.messages.length - 1
      })
      return summary
    } catch {
      return null
    }
  }

  private async maybeSummarize(): Promise<void> {
    if (!this.summarizeCallback) return
    if (this.messages.length < MAX_RECENT_MESSAGES) return

    const halfPoint = Math.floor(this.messages.length / 2)
    const toSummarize = this.messages.slice(0, halfPoint)

    const summaryText = toSummarize
      .map((m) => `${m.role === 'user' ? 'User' : 'DM'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    try {
      const summary = await this.summarizeCallback(summaryText)
      // Prune the summarized half from the active message array. Without this,
      // `this.messages` (and the on-disk JSON) grew monotonically across long
      // campaigns even though the API call already truncated. `coversUpTo = -1`
      // is the new invariant: the latest summary precedes ALL remaining messages.
      this.messages.splice(0, halfPoint)
      this.summaries.push({
        content: summary,
        coversUpTo: -1
      })
    } catch (err) {
      logToFile('WARN', '[ConversationManager] summarize failed:', err instanceof Error ? err.message : String(err))
    }
  }

  /** PHASE-26: assemble the layered [CAMPAIGN MEMORY] block from all tiers (scene mode). */
  private buildLayeredBlock(): string {
    if (this.summaries.length === 0) return ''
    const tier = (t: 'scene' | 'session' | 'campaign'): ConversationSummary[] =>
      this.summaries.filter((s) => this.tierOf(s) === t)
    const lines: string[] = ['[CAMPAIGN MEMORY]']
    const campaign = tier('campaign')
    const session = tier('session')
    const scene = tier('scene')
    if (campaign.length) lines.push(`Campaign so far: ${campaign.map((s) => s.content).join(' ')}`)
    if (session.length) lines.push(`Recent sessions: ${session.map((s) => s.content).join(' ')}`)
    if (scene.length) {
      lines.push(
        `Earlier this session: ${scene.map((s) => (s.label ? `(${s.label}) ${s.content}` : s.content)).join(' ')}`
      )
    }
    lines.push('[/CAMPAIGN MEMORY]')
    return trimToTokenBudget(lines.join('\n'), SUMMARY_BLOCK_BUDGET)
  }

  /**
   * PHASE-26: summarize a completed scene off the request path. Keeps the most recent
   * SCENE_CARRYOVER_MESSAGES verbatim, prunes the rest into a scene-tier summary, then
   * rolls up tiers if thresholds are crossed. No-op (no LLM call) for short scenes.
   */
  async endScene(label?: string): Promise<{ summarized: boolean }> {
    if (!this.summarizeCallback) return { summarized: false }
    // Capture the cut point BEFORE the await: messages appended during the summarize land
    // at indices ≥ cut and survive the splice (avoids the mis-splice class PHASE-07 documented).
    const cut = this.messages.length - SCENE_CARRYOVER_MESSAGES
    if (cut < SCENE_SUMMARY_MIN_MESSAGES) return { summarized: false }

    const transcript = this.messages
      .slice(0, cut)
      .map((m) => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    try {
      const summary = await this.summarizeCallback(
        `Summarize this completed scene of a D&D game. Preserve: outcomes, decisions, NPC names and attitudes, locations, items gained/lost, promises made, and unresolved hooks. Under 150 words.\n\n${transcript}`
      )
      this.messages.splice(0, cut)
      this.summaries.push({
        content: summary,
        coversUpTo: -1,
        tier: 'scene',
        label,
        createdAt: new Date().toISOString()
      })
      this._overflowSplitNeeded = false
      await this.maybeRollUp()
      return { summarized: true }
    } catch (err) {
      logToFile('WARN', '[ConversationManager] endScene failed:', err instanceof Error ? err.message : String(err))
      return { summarized: false }
    }
  }

  /** PHASE-26: consolidate scene→session and session→campaign when thresholds are crossed.
   *  Consolidation combines EXISTING summaries (never raw chat); failures leave tiers untouched. */
  private async maybeRollUp(): Promise<void> {
    if (!this.summarizeCallback) return
    const tier = (t: 'scene' | 'session' | 'campaign'): ConversationSummary[] =>
      this.summaries.filter((s) => this.tierOf(s) === t)

    // Scene → session: roll up all but the newest SCENE_ROLLUP_KEEP scene summaries.
    const scenes = tier('scene')
    if (scenes.length > SCENE_ROLLUP_THRESHOLD) {
      const consume = scenes.slice(0, scenes.length - SCENE_ROLLUP_KEEP)
      const keep = scenes.slice(scenes.length - SCENE_ROLLUP_KEEP)
      try {
        const summary = await this.summarizeCallback(
          `Combine these scene summaries into one session summary. Focus on character development, goals, tensions, resolutions, and persistent changes. Under 200 words.\n\n${consume.map((s) => s.content).join('\n')}`
        )
        this.summaries = [
          ...tier('campaign'),
          ...tier('session'),
          { content: summary, coversUpTo: -1, tier: 'session', createdAt: new Date().toISOString() },
          ...keep
        ]
      } catch (err) {
        logToFile(
          'WARN',
          '[ConversationManager] scene→session roll-up failed:',
          err instanceof Error ? err.message : String(err)
        )
        return
      }
    }

    // Session → campaign: merge existing campaign + all session summaries into one campaign summary.
    const sessions = tier('session')
    if (sessions.length > SESSION_ROLLUP_THRESHOLD) {
      const campaignExisting = tier('campaign')
      const input = [...campaignExisting.map((s) => s.content), ...sessions.map((s) => s.content)].join('\n')
      try {
        const summary = await this.summarizeCallback(
          `Combine these into one campaign summary. Preserve persistent facts, major story arcs, and unresolved threads. Under 200 words.\n\n${input}`
        )
        this.summaries = [
          { content: summary, coversUpTo: -1, tier: 'campaign', createdAt: new Date().toISOString() },
          ...tier('scene')
        ]
      } catch (err) {
        logToFile(
          'WARN',
          '[ConversationManager] session→campaign roll-up failed:',
          err instanceof Error ? err.message : String(err)
        )
      }
    }
  }

  serialize(): ConversationData {
    return {
      messages: this.messages,
      summaries: this.summaries,
      activeCharacterIds: this.activeCharacterIds
    }
  }

  restore(data: ConversationData): void {
    this.messages = data.messages || []
    this.summaries = data.summaries || []
    this.activeCharacterIds = data.activeCharacterIds || []

    // Backward compat: pre-prune format saved `coversUpTo` as an absolute
    // index into messages[]. Splice the now-summarized prefix away so the
    // post-prune invariant (latest summary covers messages BEFORE this.messages)
    // holds for old data on first load.
    const latest = this.summaries[this.summaries.length - 1]
    if (latest && typeof latest.coversUpTo === 'number' && latest.coversUpTo >= 0) {
      const pruneCount = latest.coversUpTo + 1
      if (pruneCount > 0 && pruneCount <= this.messages.length) {
        this.messages.splice(0, pruneCount)
      }
      // Older summaries' coversUpTo are now meaningless; only the latest is used by
      // the API path. Set to -1 so the post-prune invariant holds going forward.
      for (const s of this.summaries) s.coversUpTo = -1
    }
  }
}

function ensureAlternating(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages

  const result: ChatMessage[] = []
  for (const msg of messages) {
    if (result.length === 0) {
      if (msg.role !== 'user') {
        result.push({ role: 'user', content: '[Continuing conversation]' })
      }
      result.push(msg)
    } else {
      const last = result[result.length - 1]
      if (last.role === msg.role) {
        last.content += `\n\n${msg.content}`
      } else {
        result.push(msg)
      }
    }
  }

  return result
}
