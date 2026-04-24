import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { ConversationData } from '../ai/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getConversationsDir(): string {
  return join(app.getPath('userData'), 'ai-conversations')
}

function getConversationPath(campaignId: string): string {
  return join(getConversationsDir(), `${campaignId}.json`)
}

export async function saveConversation(campaignId: string, data: ConversationData): Promise<void> {
  if (!UUID_RE.test(campaignId)) {
    throw new Error('Invalid campaign ID')
  }

  const dir = getConversationsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const filePath = getConversationPath(campaignId)
  await writeFile(filePath, JSON.stringify(data), 'utf-8')
}

export async function loadConversation(campaignId: string): Promise<ConversationData | null> {
  if (!UUID_RE.test(campaignId)) {
    throw new Error('Invalid campaign ID')
  }

  const filePath = getConversationPath(campaignId)
  if (!existsSync(filePath)) return null

  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as ConversationData
  } catch {
    return null
  }
}

export async function deleteConversation(campaignId: string): Promise<void> {
  if (!UUID_RE.test(campaignId)) {
    throw new Error('Invalid campaign ID')
  }

  const { unlink } = await import('node:fs/promises')
  const filePath = getConversationPath(campaignId)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}
