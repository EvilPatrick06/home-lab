import { BrowserWindow } from 'electron'
import { logToFile } from '../log'

// ── Types ──

interface DmTrigger {
  id: string
  name: string
  event:
    | 'initiative_change'
    | 'hp_threshold'
    | 'time_elapsed'
    | 'token_enter_region'
    | 'condition_applied'
    | 'combat_start'
    | 'combat_end'
  condition: {
    entityId?: string
    threshold?: number
    regionId?: string
    conditionName?: string
    elapsed?: number
  }
  action: 'narrate' | 'spawn_creature' | 'play_sound' | 'change_lighting' | 'show_message'
  actionPayload: Record<string, unknown>
  enabled: boolean
  oneShot: boolean
  firedCount?: number
}

interface TokenInfo {
  entityId?: string
  currentHP?: number
  maxHP?: number
  gridX: number
  gridY: number
}

interface MapInfo {
  id: string
  tokens: TokenInfo[]
  regions?: Array<{
    id: string
    cells: Array<{ x: number; y: number }>
  }>
}

interface GameStateSnapshot {
  triggers: DmTrigger[]
  initiative: {
    entries: Array<{ entityId: string; isActive: boolean }>
    currentIndex: number
    round: number
  } | null
  maps: MapInfo[]
  conditions: Array<{
    entityId: string
    condition: string
  }>
  turnMode: 'initiative' | 'free'
  round: number
  ambientLight: 'bright' | 'dim' | 'darkness'
  inGameTime?: { totalSeconds: number } | null
}

interface TriggerFireResult {
  triggerId: string
  triggerName: string
  action: DmTrigger['action']
  actionPayload: Record<string, unknown>
}

// ── State ──

let running = false
let previousState: GameStateSnapshot | null = null
let combatWasActive = false

// ── Core Logic ──

/**
 * Evaluate all enabled triggers against the current game state.
 * Returns an array of triggers that should fire.
 */
export function evaluateTriggers(current: GameStateSnapshot, previous: GameStateSnapshot | null): TriggerFireResult[] {
  const results: TriggerFireResult[] = []

  for (const trigger of current.triggers) {
    if (!trigger.enabled) continue

    let shouldFire = false

    switch (trigger.event) {
      case 'initiative_change': {
        if (current.initiative && previous?.initiative) {
          shouldFire = current.initiative.currentIndex !== previous.initiative.currentIndex
          // If entityId is specified, only fire when that entity becomes active
          if (shouldFire && trigger.condition.entityId) {
            const activeEntry = current.initiative.entries[current.initiative.currentIndex]
            shouldFire = activeEntry?.entityId === trigger.condition.entityId
          }
        }
        break
      }

      case 'hp_threshold': {
        const threshold = trigger.condition.threshold ?? 50
        for (const map of current.maps) {
          for (const token of map.tokens) {
            if (trigger.condition.entityId && token.entityId !== trigger.condition.entityId) continue
            if (token.maxHP && token.maxHP > 0 && token.currentHP !== undefined) {
              const hpPercent = (token.currentHP / token.maxHP) * 100
              if (hpPercent <= threshold) {
                // Check if it was above threshold before
                if (previous) {
                  const prevMap = previous.maps.find((m) => m.id === map.id)
                  const prevToken = prevMap?.tokens.find((t) => t.entityId === token.entityId)
                  if (prevToken?.maxHP && prevToken.maxHP > 0 && prevToken.currentHP !== undefined) {
                    const prevPercent = (prevToken.currentHP / prevToken.maxHP) * 100
                    if (prevPercent > threshold) {
                      shouldFire = true
                    }
                  }
                } else {
                  shouldFire = true
                }
              }
            }
          }
        }
        break
      }

      case 'time_elapsed': {
        const elapsed = trigger.condition.elapsed ?? 0
        if (current.inGameTime && previous?.inGameTime && elapsed > 0) {
          const prevSeconds = previous.inGameTime.totalSeconds
          const currSeconds = current.inGameTime.totalSeconds
          // Fire if we crossed a time boundary
          if (currSeconds >= elapsed && prevSeconds < elapsed) {
            shouldFire = true
          }
        }
        break
      }

      case 'token_enter_region': {
        const regionId = trigger.condition.regionId
        if (!regionId) break
        for (const map of current.maps) {
          const region = map.regions?.find((r) => r.id === regionId)
          if (!region) continue
          const regionCellSet = new Set(region.cells.map((c) => `${c.x},${c.y}`))
          for (const token of map.tokens) {
            if (trigger.condition.entityId && token.entityId !== trigger.condition.entityId) continue
            const inRegionNow = regionCellSet.has(`${token.gridX},${token.gridY}`)
            if (inRegionNow && previous) {
              const prevMap = previous.maps.find((m) => m.id === map.id)
              const prevToken = prevMap?.tokens.find((t) => t.entityId === token.entityId)
              if (prevToken) {
                const wasInRegion = regionCellSet.has(`${prevToken.gridX},${prevToken.gridY}`)
                if (!wasInRegion) {
                  shouldFire = true
                }
              }
            }
          }
        }
        break
      }

      case 'condition_applied': {
        const condName = trigger.condition.conditionName
        if (!condName) break
        const currentHas = current.conditions.some(
          (c) =>
            c.condition.toLowerCase() === condName.toLowerCase() &&
            (!trigger.condition.entityId || c.entityId === trigger.condition.entityId)
        )
        if (currentHas && previous) {
          const prevHad = previous.conditions.some(
            (c) =>
              c.condition.toLowerCase() === condName.toLowerCase() &&
              (!trigger.condition.entityId || c.entityId === trigger.condition.entityId)
          )
          if (!prevHad) {
            shouldFire = true
          }
        }
        break
      }

      case 'combat_start': {
        const combatActiveNow = current.turnMode === 'initiative' && current.initiative !== null
        if (combatActiveNow && !combatWasActive) {
          shouldFire = true
        }
        break
      }

      case 'combat_end': {
        const combatActiveNow = current.turnMode === 'initiative' && current.initiative !== null
        if (!combatActiveNow && combatWasActive) {
          shouldFire = true
        }
        break
      }
    }

    if (shouldFire) {
      results.push({
        triggerId: trigger.id,
        triggerName: trigger.name,
        action: trigger.action,
        actionPayload: trigger.actionPayload
      })
    }
  }

  // Update combat tracking
  combatWasActive = current.turnMode === 'initiative' && current.initiative !== null

  return results
}

/**
 * Execute a trigger's action by sending IPC events to the renderer.
 */
function executeTriggerAction(result: TriggerFireResult): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return

  logToFile('info', `[AI Trigger] Firing trigger "${result.triggerName}" -> ${result.action}`)

  // Send trigger-fired event to renderer so it can update store and execute action
  win.webContents.send('ai:trigger-fired', {
    triggerId: result.triggerId,
    triggerName: result.triggerName,
    action: result.action,
    actionPayload: result.actionPayload
  })
}

/**
 * Process a game state update from the renderer.
 * Called via IPC when the renderer sends its current state.
 */
export function processStateUpdate(state: GameStateSnapshot): TriggerFireResult[] {
  if (!running) return []

  const results = evaluateTriggers(state, previousState)
  previousState = state

  for (const result of results) {
    executeTriggerAction(result)
  }

  return results
}

/**
 * Start the trigger observer. After calling this, state updates will be evaluated.
 */
export function startObserver(): void {
  running = true
  previousState = null
  combatWasActive = false
  logToFile('info', '[AI Trigger] Observer started')
}

/**
 * Stop the trigger observer.
 */
export function stopObserver(): void {
  running = false
  previousState = null
  combatWasActive = false
  logToFile('info', '[AI Trigger] Observer stopped')
}

/**
 * Check if the observer is currently running.
 */
export function isObserverRunning(): boolean {
  return running
}
