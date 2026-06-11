import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiProviderType } from '../types/campaign'

export interface AiReadiness {
  /** true = provider affirmatively usable; false = not ready; null = still checking (no result yet). */
  usable: boolean | null
  provider: AiProviderType | null
  /** true when the last probe threw — distinct from "still checking" (usable=null). */
  probeFailed: boolean
  /** Conversation-history budget (PHASE-10 10C); null until the meter IPC resolves / on failure. */
  conversationBudget: number | null
  /** Fire an immediate re-probe (e.g. after a stream error, or on click). */
  recheck: () => void
}

const POLL_INTERVAL_MS = 30_000

/**
 * Honest AI readiness probe (PHASE-10 10B). Replaces ChatPanel's one-shot probe:
 * - distinguishes "still checking" (usable=null, probeFailed=false) from "check failed"
 *   (probeFailed=true) — the old code collapsed both to null and rendered green.
 * - re-probes every 30s while `active` and the document is visible (no point polling a
 *   hidden window; interval timers also freeze during OS suspend — accepted, the next
 *   visible tick corrects).
 * - skips ticks while a probe is already in flight.
 */
export function useAiReadiness(active: boolean): AiReadiness {
  const [usable, setUsable] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<AiProviderType | null>(null)
  const [probeFailed, setProbeFailed] = useState(false)
  const [conversationBudget, setConversationBudget] = useState<number | null>(null)
  const inFlightRef = useRef(false)

  const probe = useCallback(async (signal: { cancelled: boolean }) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      // Readiness + the token meter refresh together (one extra cheap IPC per cadence).
      const [cfg, status, meter] = await Promise.all([
        window.api.ai.getConfig(),
        window.api.ai.checkProviders(),
        window.api.ai.getTokenMeter().catch(() => null)
      ])
      if (signal.cancelled) return
      const p = (cfg?.provider ?? 'ollama') as AiProviderType
      const usableNow =
        p === 'claude'
          ? status.claude
          : p === 'openai'
            ? status.openai
            : p === 'gemini'
              ? status.gemini
              : status.ollamaHasUsableModel
      setProvider(p)
      setUsable(usableNow)
      setProbeFailed(false)
      setConversationBudget(meter?.conversationBudget ?? null)
    } catch {
      if (!signal.cancelled) {
        setProbeFailed(true)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!active) {
      setUsable(null)
      setProvider(null)
      setProbeFailed(false)
      setConversationBudget(null)
      return
    }
    const signal = { cancelled: false }
    void probe(signal)
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void probe(signal)
    }, POLL_INTERVAL_MS)
    return () => {
      signal.cancelled = true
      clearInterval(id)
    }
  }, [active, probe])

  const recheck = useCallback(() => {
    void probe({ cancelled: false })
  }, [probe])

  return { usable, provider, probeFailed, conversationBudget, recheck }
}
