/**
 * Leaf module: event bridge for system chat messages.
 * Allows slices (e.g. conditions-slice) to emit chat messages without depending on lobby-store.
 * Lobby store subscribes and adds messages to chat.
 */

export interface SystemChatMessage {
  senderId: string
  senderName: string
  content: string
  timestamp: number
  isSystem: boolean
}

type Handler = (msg: SystemChatMessage) => void

const handlers: Handler[] = []

export function subscribeToSystemChat(handler: Handler): () => void {
  handlers.push(handler)
  return () => {
    const idx = handlers.indexOf(handler)
    if (idx >= 0) handlers.splice(idx, 1)
  }
}

export function publishSystemChat(msg: SystemChatMessage): void {
  for (const h of handlers) {
    try {
      h(msg)
    } catch (e) {
      console.error('[SystemChatBridge] Handler error:', e)
    }
  }
}
