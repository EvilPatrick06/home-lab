import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { ConversationData } from '../ai/types'
import { atomicWriteFile } from './atomic-write'
import type { StorageResult } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getConversationsDir(): string {
  return join(app.getPath('userData'), 'ai-conversations')
}

function getConversationPath(campaignId: string): string {
  return join(getConversationsDir(), `${campaignId}.json`)
}

export async function saveConversation(campaignId: string, data: ConversationData): Promise<StorageResult<void>> {
  if (!UUID_RE.test(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }

  try {
    const dir = getConversationsDir()
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const filePath = getConversationPath(campaignId)
    await atomicWriteFile(filePath, JSON.stringify(data))
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function loadConversation(campaignId: string): Promise<StorageResult<ConversationData | null>> {
  if (!UUID_RE.test(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }

  const filePath = getConversationPath(campaignId)
  if (!existsSync(filePath)) return { success: true, data: null }

  try {
    const content = await readFile(filePath, 'utf-8')
    return { success: true, data: JSON.parse(content) as ConversationData }
  } catch {
    return { success: true, data: null }
  }
}

export async function deleteConversation(campaignId: string): Promise<StorageResult<boolean>> {
  if (!UUID_RE.test(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }

  try {
    const { unlink } = await import('node:fs/promises')
    const filePath = getConversationPath(campaignId)
    if (!existsSync(filePath)) {
      return { success: true, data: false }
    }
    await unlink(filePath)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
