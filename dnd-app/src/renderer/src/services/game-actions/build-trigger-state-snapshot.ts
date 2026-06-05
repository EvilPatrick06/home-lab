import type { GameStoreState } from '../../stores/game/types'
import type { DmTrigger } from '../../types/game-state'

/**
 * Structured game-state snapshot pushed to the main-process trigger observer.
 * Mirrors the observer's `GameStateSnapshot` (main/ai/ai-trigger-observer.ts) — it
 * crosses the IPC boundary as a plain JSON object, so the two are kept structurally
 * in sync rather than via a shared module (avoids a main↔renderer import).
 *
 * NOTE: regions are intentionally omitted — scene regions store geometric shapes,
 * not cell lists, so `token_enter_region` triggers don't fire from this path (scene
 * regions already have their own built-in trigger mechanism). The other six trigger
 * events (initiative_change, hp_threshold, time_elapsed, condition_applied,
 * combat_start, combat_end) are fully driven by this snapshot.
 */
export interface TriggerStateSnapshot {
  triggers: DmTrigger[]
  initiative: {
    entries: Array<{ entityId: string; isActive: boolean }>
    currentIndex: number
    round: number
  } | null
  maps: Array<{
    id: string
    tokens: Array<{ entityId: string; currentHP?: number; maxHP?: number; gridX: number; gridY: number }>
  }>
  conditions: Array<{ entityId: string; condition: string }>
  turnMode: 'initiative' | 'free'
  round: number
  ambientLight: 'bright' | 'dim' | 'darkness'
  inGameTime?: { totalSeconds: number } | null
}

/** Build the structured trigger snapshot from the current game store state. */
export function buildTriggerStateSnapshot(state: GameStoreState): TriggerStateSnapshot {
  return {
    triggers: state.triggers,
    initiative: state.initiative
      ? {
          entries: state.initiative.entries.map((e) => ({ entityId: e.entityId, isActive: e.isActive })),
          currentIndex: state.initiative.currentIndex,
          round: state.initiative.round
        }
      : null,
    maps: state.maps.map((m) => ({
      id: m.id,
      tokens: m.tokens.map((t) => ({
        entityId: t.entityId,
        currentHP: t.currentHP,
        maxHP: t.maxHP,
        gridX: t.gridX,
        gridY: t.gridY
      }))
    })),
    conditions: state.maps.flatMap((m) =>
      m.tokens.flatMap((t) => t.conditions.map((c) => ({ entityId: t.entityId, condition: c })))
    ),
    turnMode: state.turnMode,
    round: state.round,
    ambientLight: state.ambientLight,
    inGameTime: state.inGameTime
  }
}
