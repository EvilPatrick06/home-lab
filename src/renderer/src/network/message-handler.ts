import { logger } from '../utils/logger'
import type { MessageType, NetworkMessage } from './types'

type MessageHandler<T = unknown> = (message: NetworkMessage<T>) => void

interface MessageRouter {
  /**
   * Register a handler for a specific message type.
   * Returns an unsubscribe function.
   */
  on<T = unknown>(type: MessageType, handler: MessageHandler<T>): () => void

  /**
   * Route an incoming message to all registered handlers for its type.
   */
  handle(message: NetworkMessage): void

  /**
   * Remove all registered handlers.
   */
  clear(): void
}

/**
 * Create a message router that dispatches incoming NetworkMessages
 * to type-specific handlers.
 */
export function createMessageRouter(): MessageRouter {
  const handlers = new Map<MessageType, Set<MessageHandler>>()

  return {
    on<T = unknown>(type: MessageType, handler: MessageHandler<T>): () => void {
      if (!handlers.has(type)) {
        handlers.set(type, new Set())
      }
      const handlerSet = handlers.get(type)!
      const wrappedHandler = handler as MessageHandler
      handlerSet.add(wrappedHandler)

      // Return unsubscribe function
      return () => {
        handlerSet.delete(wrappedHandler)
        if (handlerSet.size === 0) {
          handlers.delete(type)
        }
      }
    },

    handle(message: NetworkMessage): void {
      const handlerSet = handlers.get(message.type)
      if (handlerSet) {
        for (const handler of handlerSet) {
          try {
            handler(message)
          } catch (err) {
            logger.error(`[MessageRouter] Error in handler for "${message.type}":`, err)
          }
        }
      } else {
        logger.debug(`[MessageRouter] No handler for message type: ${message.type}`)
      }
    },

    clear(): void {
      handlers.clear()
    }
  }
}
