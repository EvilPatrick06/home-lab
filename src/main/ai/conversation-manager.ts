import { DM_SYSTEM_PROMPT, DM_TOOLBOX_CONTEXT, PLANAR_RULES_CONTEXT } from './dm-system-prompt'
import { COMBAT_TACTICS_PROMPT } from './prompt-sections/combat-tactics'
import { estimateTokens, TOKEN_BUDGETS } from './token-budget'
import type { ChatMessage, ConversationData, ConversationMessage, ConversationSummary } from './types'

const MAX_RECENT_MESSAGES = 10

export class ConversationManager {
  private messages: ConversationMessage[] = []
  private summaries: ConversationSummary[] = []
  private activeCharacterIds: string[] = []
  private summarizeCallback: ((text: string) => Promise<string>) | null = null
  /** Whether context was truncated in the last API call preparation */
  private _contextTruncated = false
  /** Total estimated tokens used in the last API call preparation */
  private _lastTokenEstimate = 0

  /** Set the callback used for summarization (provided by AiService). */
  setSummarizeCallback(cb: (text: string) => Promise<string>): void {
    this.summarizeCallback = cb
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
  }

  /**
   * Build the messages array for the API call,
   * including summary prefix and recent messages within token budget.
   */
  async getMessagesForApi(contextBlock: string): Promise<{
    systemPrompt: string
    messages: ChatMessage[]
  }> {
    await this.maybeSummarize()

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
      DM_SYSTEM_PROMPT +
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
      if (tokenCount + msgTokens > TOKEN_BUDGETS.conversationHistory && withinBudget.length > 0) break
      tokenCount += msgTokens
      withinBudget.unshift(recentMessages[i])
    }

    if (latestSummary && withinBudget.length > 0 && withinBudget[0].role === 'user') {
      apiMessages.push({
        role: 'user',
        content: `[Previous conversation summary: ${latestSummary.content}]\n\n${withinBudget[0].content}`
      })
      for (let i = 1; i < withinBudget.length; i++) {
        apiMessages.push({ role: withinBudget[i].role, content: withinBudget[i].content })
      }
    } else if (latestSummary && (withinBudget.length === 0 || withinBudget[0].role === 'assistant')) {
      apiMessages.push({
        role: 'user',
        content: `[Previous conversation summary: ${latestSummary.content}]\n\nPlease continue from where we left off.`
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
    this._contextTruncated = tokenCount >= TOKEN_BUDGETS.conversationHistory

    return { systemPrompt, messages: cleaned }
  }

  /**
   * Generate an end-of-session summary using the summarize callback.
   * Covers all messages since the last summary (or all messages).
   */
  async generateSessionSummary(): Promise<string | null> {
    if (!this.summarizeCallback) return null
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

    const recentStart = this.summaries.length > 0 ? this.summaries[this.summaries.length - 1].coversUpTo + 1 : 0
    const recentMessages = this.messages.slice(recentStart)

    if (recentMessages.length < MAX_RECENT_MESSAGES) return

    const halfPoint = Math.floor(recentMessages.length / 2)
    const toSummarize = recentMessages.slice(0, halfPoint)

    const summaryText = toSummarize
      .map((m) => `${m.role === 'user' ? 'User' : 'DM'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    try {
      const summary = await this.summarizeCallback(summaryText)
      this.summaries.push({
        content: summary,
        coversUpTo: recentStart + halfPoint - 1
      })
    } catch {
      // If summarization fails, continue without
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
