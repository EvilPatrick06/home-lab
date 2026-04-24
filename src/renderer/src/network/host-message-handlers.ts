import { FILE_SIZE_LIMIT, MAX_CHAT_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '../constants'
import { DEFAULT_BLOCKED_WORDS, filterMessage } from '../data/moderation'
import { logger } from '../utils/logger'

// Client message type allowlist — only these prefixes are permitted from non-host peers.
// dm: prefixed messages are host-only and must never be accepted from clients.
const CLIENT_ALLOWED_PREFIXES = ['player:', 'chat:', 'game:dice-roll', 'game:token-move', 'combat:', 'ping']

export function isClientAllowedMessageType(type: string): boolean {
  return CLIENT_ALLOWED_PREFIXES.some((prefix) => type.startsWith(prefix))
}

// Blocked executable file extensions for file sharing
const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.msi',
  '.scr',
  '.com',
  '.pif',
  '.vbs',
  '.js',
  '.wsh',
  '.wsf',
  '.html'
]

// MIME allowlist for file sharing — only these types are permitted
const MIME_ALLOWLIST = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/json']

// Magic bytes for file content validation
const MAGIC_BYTES: Record<string, string> = {
  'image/png': '89504e47',
  'image/jpeg': 'ffd8ff',
  'image/gif': '47494638',
  'image/webp': '52494646'
}

function validateMagicBytes(base64Data: string, mimeType: string): boolean {
  const expectedHex = MAGIC_BYTES[mimeType]
  if (!expectedHex) return true
  try {
    const raw = atob(base64Data.slice(0, 16))
    const hex = Array.from(raw, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    return hex.startsWith(expectedHex)
  } catch {
    return false
  }
}

/**
 * Validate an incoming message's structure and content.
 * Returns false if the message should be dropped.
 */
export function validateMessage(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const msg = raw as Record<string, unknown>
  if (typeof msg.type !== 'string') return false

  const p = (msg.payload && typeof msg.payload === 'object' ? msg.payload : {}) as Record<string, unknown>

  switch (msg.type) {
    case 'player:join':
      if (typeof p.displayName !== 'string') return false
      if ((p.displayName as string).trim().length < 1) return false
      if (p.displayName.length > MAX_DISPLAY_NAME_LENGTH) return false
      break
    case 'chat:message':
      if (typeof p.message !== 'string') return false
      if (p.message.length > MAX_CHAT_LENGTH) return false
      break
    case 'chat:file': {
      if (typeof p.fileName !== 'string') return false
      if (typeof p.fileData !== 'string') return false
      if (p.fileData.length > FILE_SIZE_LIMIT) return false
      if (typeof p.mimeType !== 'string') return false
      if (!MIME_ALLOWLIST.includes(p.mimeType as string)) return false
      const fileName = (p.fileName as string).toLowerCase()
      if (BLOCKED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) return false
      if (!validateMagicBytes(p.fileData as string, p.mimeType as string)) return false
      break
    }
    case 'chat:whisper':
      if (typeof p.targetPeerId !== 'string') return false
      if (typeof p.message !== 'string') return false
      if (p.message.length > MAX_CHAT_LENGTH) return false
      break
  }
  return true
}

/**
 * Apply chat moderation to a message if moderation is enabled.
 * Mutates the payload's message field in place with filtered content.
 */
export function applyChatModeration(
  message: { payload: unknown },
  peerId: string,
  chatMutedPeers: Map<string, number>,
  moderationEnabled: boolean,
  customBlockedWords: string[]
): boolean {
  const muteExpiry = chatMutedPeers.get(peerId)
  if (muteExpiry && Date.now() < muteExpiry) {
    logger.debug('[HostManager] Dropping chat from muted peer:', peerId)
    return false
  }
  if (muteExpiry && Date.now() >= muteExpiry) {
    chatMutedPeers.delete(peerId)
  }

  if (moderationEnabled) {
    const payload = message.payload as { message: string }
    if (payload.message) {
      const wordList = customBlockedWords.length > 0 ? customBlockedWords : DEFAULT_BLOCKED_WORDS
      payload.message = filterMessage(payload.message, wordList)
    }
  }
  return true
}
