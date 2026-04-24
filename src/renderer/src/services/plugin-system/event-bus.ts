// ============================================================================
// Plugin Event Bus
// Typed pub/sub system for plugin hooks.
// Supports notification hooks (void return) and filter hooks (modify payload).
// ============================================================================

import { logger } from '../../utils/logger'

export type EventHandler<T = unknown> = (payload: T) => T | void
export type AsyncEventHandler<T = unknown> = (payload: T) => Promise<T | void> | T | void

interface Subscription<T = unknown> {
  pluginId: string
  handler: EventHandler<T>
  priority: number
}

interface AsyncSubscription<T = unknown> {
  pluginId: string
  handler: AsyncEventHandler<T>
  priority: number
}

class PluginEventBus {
  private syncSubscriptions = new Map<string, Subscription[]>()
  private asyncSubscriptions = new Map<string, AsyncSubscription[]>()

  /**
   * Subscribe to a synchronous event.
   * @param event Event name
   * @param pluginId Plugin that owns this subscription
   * @param handler Handler function — return modified payload for filter hooks, void for notification
   * @param priority Lower = earlier execution. Default 100.
   */
  on<T = unknown>(event: string, pluginId: string, handler: EventHandler<T>, priority = 100): void {
    const subs = this.syncSubscriptions.get(event) ?? []
    subs.push({ pluginId, handler: handler as EventHandler, priority })
    subs.sort((a, b) => a.priority - b.priority)
    this.syncSubscriptions.set(event, subs)
  }

  /**
   * Subscribe to an async event.
   */
  onAsync<T = unknown>(event: string, pluginId: string, handler: AsyncEventHandler<T>, priority = 100): void {
    const subs = this.asyncSubscriptions.get(event) ?? []
    subs.push({ pluginId, handler: handler as AsyncEventHandler, priority })
    subs.sort((a, b) => a.priority - b.priority)
    this.asyncSubscriptions.set(event, subs)
  }

  /**
   * Check if an event has any subscribers (useful for no-op fast path).
   */
  hasSubscribers(event: string): boolean {
    const sync = this.syncSubscriptions.get(event)
    const async_ = this.asyncSubscriptions.get(event)
    return (sync !== undefined && sync.length > 0) || (async_ !== undefined && async_.length > 0)
  }

  /**
   * Emit a synchronous event. For filter hooks, each handler can modify the payload.
   * Returns the final payload (possibly modified).
   */
  emit<T>(event: string, payload: T): T {
    const subs = this.syncSubscriptions.get(event)
    if (!subs || subs.length === 0) return payload

    let current = payload
    for (const sub of subs) {
      try {
        const result = sub.handler(current)
        if (result !== undefined && result !== null) {
          current = result as T
        }
      } catch (err) {
        logger.error(`[PluginEventBus] Error in handler for "${event}" from plugin "${sub.pluginId}":`, err)
      }
    }
    return current
  }

  /**
   * Emit an async event. For filter hooks, each handler can modify the payload sequentially.
   * Returns the final payload.
   */
  async emitAsync<T>(event: string, payload: T): Promise<T> {
    // First run sync handlers
    let current = this.emit(event, payload)

    // Then run async handlers
    const subs = this.asyncSubscriptions.get(event)
    if (!subs || subs.length === 0) return current

    for (const sub of subs) {
      try {
        const result = await sub.handler(current)
        if (result !== undefined && result !== null) {
          current = result as T
        }
      } catch (err) {
        logger.error(`[PluginEventBus] Async error in "${event}" from plugin "${sub.pluginId}":`, err)
      }
    }
    return current
  }

  /**
   * Remove a single handler for an event.
   */
  off(event: string, handler: EventHandler): void {
    const subs = this.syncSubscriptions.get(event)
    if (subs) {
      this.syncSubscriptions.set(
        event,
        subs.filter((s) => s.handler !== handler)
      )
    }
    const asyncSubs = this.asyncSubscriptions.get(event)
    if (asyncSubs) {
      this.asyncSubscriptions.set(
        event,
        asyncSubs.filter((s) => s.handler !== handler)
      )
    }
  }

  /**
   * Remove all subscriptions for a specific plugin (cleanup on unload).
   */
  removePlugin(pluginId: string): void {
    for (const [event, subs] of this.syncSubscriptions) {
      this.syncSubscriptions.set(
        event,
        subs.filter((s) => s.pluginId !== pluginId)
      )
    }
    for (const [event, subs] of this.asyncSubscriptions) {
      this.asyncSubscriptions.set(
        event,
        subs.filter((s) => s.pluginId !== pluginId)
      )
    }
  }

  /**
   * Remove all subscriptions (full reset).
   */
  clear(): void {
    this.syncSubscriptions.clear()
    this.asyncSubscriptions.clear()
  }
}

/** Singleton event bus instance */
export const pluginEventBus = new PluginEventBus()
