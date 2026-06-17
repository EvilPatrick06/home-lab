/**
 * PHASE-31 31C — campaign Q&A "archivist". A grounded, out-of-fiction reference assistant that answers
 * questions strictly from recorded campaign data (campaign record, AI memory, entity records, conversation
 * summaries, journal). It is a one-shot `chatOnce` call that NEVER touches the in-fiction ConversationManager
 * history and never triggers the DM-action/stat-change pipeline.
 */

import { loadConversation } from '../storage/ai-conversation-storage'
import { aiChatOnce, getConversationManager } from './ai-service'
import { formatCampaignForContext, loadCampaignById } from './campaign-context'
import { getEntityStore } from './entity-store'
import { getMemoryManager } from './memory-manager'
import { trimToTokenBudget } from './token-budget'

const BLOCK_BUDGET = 1500 // estimated tokens per labeled block
/** The EXACT sentence the archivist must return when the records don't contain the answer. */
export const QA_REFUSAL = 'Not recorded in the campaign log.'

export interface QaAnswer {
  answer: string
  askedAt: string
}

/** Pure prompt assembly — exported for tests. Each block is trimmed to the per-block budget. */
export function buildQaPrompt(
  blocks: { label: string; content: string }[],
  question: string
): { system: string; user: string } {
  const system =
    'You are the campaign archivist, an out-of-character reference assistant for a tabletop RPG. Answer the ' +
    'question using ONLY the labeled campaign records provided. Name the record block(s) your answer came from ' +
    "(e.g. 'per the JOURNAL'). If the records do not contain the answer, reply with EXACTLY this sentence and " +
    `nothing else: "${QA_REFUSAL}" Never invent events, names, or dialogue. Do not narrate or speak in-character; ` +
    'answer plainly and concisely.'

  const rendered = blocks
    .filter((b) => b.content.trim())
    .map((b) => `[${b.label}]\n${trimToTokenBudget(b.content, BLOCK_BUDGET)}`)
    .join('\n\n')

  const user =
    `${rendered}\n\n[QUESTION]\n${question}\n\n` +
    `Answer using ONLY the records above. If they do not contain the answer, reply exactly: "${QA_REFUSAL}"`
  return { system, user }
}

export async function askCampaignQuestion(campaignId: string, question: string): Promise<QaAnswer> {
  const blocks: { label: string; content: string }[] = []

  const campaign = await loadCampaignById(campaignId)
  if (campaign) blocks.push({ label: 'CAMPAIGN', content: formatCampaignForContext(campaign) })

  const memory = await getMemoryManager(campaignId).assembleContext()
  if (memory.trim()) blocks.push({ label: 'AI MEMORY', content: memory })

  // PHASE-25 entity records — keyword-triggered against the question text.
  const entityBlock = await getEntityStore(campaignId).buildEntityContextBlock(question)
  if (entityBlock.trim()) blocks.push({ label: 'ENTITY RECORDS', content: entityBlock })

  // Conversation: latest summaries + last 20 messages. In-memory first, disk fallback (READ-ONLY).
  const conv = getConversationManager(campaignId)
  let summaries = conv
    .serialize()
    .summaries.map((s) => s.content)
    .filter(Boolean)
  let messages = conv.getMessages()
  if (summaries.length === 0 && messages.length === 0) {
    const disk = await loadConversation(campaignId)
    if (disk.success && disk.data) {
      summaries = disk.data.summaries.map((s) => s.content).filter(Boolean)
      messages = disk.data.messages
    }
  }
  const convText = [...summaries, ...messages.slice(-20).map((m) => `${m.role}: ${m.content}`)].join('\n')
  if (convText.trim()) blocks.push({ label: 'CONVERSATION', content: convText })

  // Journal — last 10 entries, content capped.
  const journal = (campaign?.journal as { entries?: Array<Record<string, unknown>> } | undefined)?.entries ?? []
  const journalText = journal
    .slice(-10)
    .map((e) => `${String(e.title ?? 'Entry')}: ${String(e.content ?? '').slice(0, 500)}`)
    .join('\n')
  if (journalText.trim()) blocks.push({ label: 'JOURNAL', content: journalText })

  const { system, user } = buildQaPrompt(blocks, question)
  const answer = (await aiChatOnce(system, user, 'mechanics')).trim()
  return { answer: answer || QA_REFUSAL, askedAt: new Date().toISOString() }
}
