import { useEffect } from 'react'
import { buildTriggerStateSnapshot } from '../services/game-actions/build-trigger-state-snapshot'
import { executeTriggerAction } from '../services/trigger-action-executor'
import { useGameStore } from '../stores/use-game-store'

/** Debounce for pushing game-state snapshots to the trigger observer (ms). */
const TRIGGER_SYNC_DEBOUNCE_MS = 500

/**
 * Wire the DM trigger system on the DM client only:
 *  - push a DEBOUNCED structured game-state snapshot to the main-process observer
 *    whenever game state changes (but only while the DM has an enabled trigger, so
 *    there is zero IPC traffic otherwise), and
 *  - execute any trigger the observer reports as fired (update firedCount + run the
 *    action).
 * The observer fires each trigger once per state TRANSITION (edge-detected), so this
 * cannot loop on a single change.
 */
export function useDmTriggers(isDM: boolean): void {
  useEffect(() => {
    if (!isDM) return

    window.api.ai.onTriggerFired((data) => {
      useGameStore.getState().fireTrigger(data.triggerId)
      executeTriggerAction(data.action, data.actionPayload)
    })

    let timer: ReturnType<typeof setTimeout> | null = null
    const push = (): void => {
      const snapshot = buildTriggerStateSnapshot(useGameStore.getState())
      if (snapshot.triggers.some((t) => t.enabled)) {
        void window.api.ai.triggerStateUpdate(snapshot as unknown as Record<string, unknown>)
      }
    }
    const unsubscribe = useGameStore.subscribe(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(push, TRIGGER_SYNC_DEBOUNCE_MS)
    })

    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
      window.api.ai.removeTriggerListener()
    }
  }, [isDM])
}
