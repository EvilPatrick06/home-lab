/**
 * AI DM Renderer Actions — parses and dispatches AI DM action tags
 * that trigger UI overlays in the renderer process.
 *
 * The main process handles data mutations (stat changes, token placement, etc.)
 * via dm-actions.ts and stat-mutations.ts. This module handles a separate set of
 * inline action tags that need to trigger renderer-side UI: roll request prompts,
 * loot award popups, XP notifications, combat start overlays, narration mood
 * styling, map fog reveal, and sound effects.
 *
 * Tag format: [ACTION:type param1=value1 param2="quoted value" param3=[json]]
 */

export type AiRendererAction =
  | { type: 'roll-request'; ability?: string; skill?: string; dc: number; targetPlayerIds?: string[] }
  | { type: 'loot-award'; items: Array<{ name: string; quantity: number }>; gold?: number; targetPlayerIds?: string[] }
  | { type: 'xp-award'; amount: number; reason?: string; targetPlayerIds?: string[] }
  | { type: 'combat-start'; enemies: Array<{ name: string; initiativeModifier: number }> }
  | { type: 'narration'; text: string; mood?: 'dramatic' | 'calm' | 'tense' | 'mysterious' }
  | { type: 'map-reveal'; cells: Array<{ x: number; y: number }> }
  | { type: 'sound-effect'; sound: string }

/**
 * Parse AI DM action tags from a response string.
 * Tags follow the format: [ACTION:type param1=value1 param2=value2]
 *
 * Examples:
 * [ACTION:roll-request skill=Perception dc=15]
 * [ACTION:loot-award items=[{"name":"Gold","quantity":50}] gold=50]
 * [ACTION:xp-award amount=200 reason="Defeated the goblins"]
 * [ACTION:combat-start enemies=[{"name":"Goblin","initiativeModifier":2}]]
 * [ACTION:narration text="The cavern trembles..." mood=dramatic]
 * [ACTION:map-reveal cells=[{"x":5,"y":3},{"x":5,"y":4}]]
 * [ACTION:sound-effect sound=combat-start]
 */
export function parseRendererActions(text: string): AiRendererAction[] {
  const actions: AiRendererAction[] = []
  // Regex to find [ACTION:type ...params]
  const regex = /\[ACTION:(\S+)(.*?)\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const type = match[1]
    const paramStr = match[2].trim()
    const params = parseParams(paramStr)

    try {
      switch (type) {
        case 'roll-request': {
          actions.push({
            type: 'roll-request',
            ability: params.ability || undefined,
            skill: params.skill || undefined,
            dc: parseInt(params.dc, 10) || 10,
            targetPlayerIds: safeParseJsonArray<string>(params.targets)
          })
          break
        }
        case 'loot-award': {
          actions.push({
            type: 'loot-award',
            items: safeParseJsonArray<{ name: string; quantity: number }>(params.items) ?? [],
            gold: params.gold ? parseInt(params.gold, 10) : undefined,
            targetPlayerIds: safeParseJsonArray<string>(params.targets)
          })
          break
        }
        case 'xp-award': {
          const amount = parseInt(params.amount, 10)
          if (Number.isNaN(amount) || amount <= 0) break
          actions.push({
            type: 'xp-award',
            amount,
            reason: params.reason || undefined,
            targetPlayerIds: safeParseJsonArray<string>(params.targets)
          })
          break
        }
        case 'combat-start': {
          const enemies = safeParseJsonArray<{ name: string; initiativeModifier: number }>(params.enemies)
          if (!enemies || enemies.length === 0) break
          actions.push({
            type: 'combat-start',
            enemies
          })
          break
        }
        case 'narration': {
          const moodValue = params.mood as AiRendererAction extends { type: 'narration'; mood?: infer M } ? M : never
          const validMoods = ['dramatic', 'calm', 'tense', 'mysterious'] as const
          actions.push({
            type: 'narration',
            text: params.text || '',
            mood: validMoods.includes(moodValue as (typeof validMoods)[number])
              ? (moodValue as 'dramatic' | 'calm' | 'tense' | 'mysterious')
              : undefined
          })
          break
        }
        case 'map-reveal': {
          const cells = safeParseJsonArray<{ x: number; y: number }>(params.cells)
          if (!cells || cells.length === 0) break
          actions.push({
            type: 'map-reveal',
            cells
          })
          break
        }
        case 'sound-effect': {
          if (!params.sound) break
          actions.push({
            type: 'sound-effect',
            sound: params.sound
          })
          break
        }
        // Unknown action types are silently ignored
      }
    } catch {
      // Skip malformed individual actions — continue parsing the rest
    }
  }

  return actions
}

/**
 * Parse key=value pairs from the parameter string.
 * Handles quoted strings ("..."), JSON arrays ([...]), JSON objects ({...}),
 * and unquoted single-word values.
 */
function parseParams(str: string): Record<string, string> {
  const params: Record<string, string> = {}
  // Match key=value where value can be:
  //   - A double-quoted string: "..."
  //   - A JSON array: [...]
  //   - A JSON object: {...}
  //   - An unquoted word (no spaces)
  const regex = /(\w+)=(?:"([^"]*)"|\[([^\]]*)\]|\{([^}]*)\}|(\S+))/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(str)) !== null) {
    const key = match[1]
    const value =
      match[2] !== undefined
        ? match[2]
        : match[3] !== undefined
          ? `[${match[3]}]`
          : match[4] !== undefined
            ? `{${match[4]}}`
            : match[5]
    params[key] = value
  }
  return params
}

/**
 * Safely parse a JSON array string, returning undefined on failure.
 * Prevents malformed AI output from crashing the renderer.
 */
function safeParseJsonArray<T>(value: string | undefined): T[] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed as T[]
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Strip action tags from text for display purposes.
 * Returns the text with [ACTION:...] tags removed and whitespace cleaned up.
 */
export function stripActionTags(text: string): string {
  return text
    .replace(/\[ACTION:\S+.*?\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Process AI DM actions and dispatch them to the appropriate stores/services.
 * This is called from the AI DM chat handler when a new response arrives.
 *
 * Each dispatch callback is optional — callers only need to provide handlers
 * for the action types they care about.
 */
export function processAiRendererActions(
  actions: AiRendererAction[],
  dispatch: {
    triggerRollRequest?: (ability: string | undefined, skill: string | undefined, dc: number) => void
    awardXP?: (amount: number, reason?: string) => void
    awardLoot?: (items: Array<{ name: string; quantity: number }>, gold?: number) => void
    startCombat?: (enemies: Array<{ name: string; initiativeModifier: number }>) => void
    showNarration?: (text: string, mood?: 'dramatic' | 'calm' | 'tense' | 'mysterious') => void
    revealMap?: (cells: Array<{ x: number; y: number }>) => void
    playSound?: (sound: string) => void
  }
): void {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'roll-request':
          dispatch.triggerRollRequest?.(action.ability, action.skill, action.dc)
          break
        case 'xp-award':
          dispatch.awardXP?.(action.amount, action.reason)
          break
        case 'loot-award':
          dispatch.awardLoot?.(action.items, action.gold)
          break
        case 'combat-start':
          dispatch.startCombat?.(action.enemies)
          break
        case 'narration':
          dispatch.showNarration?.(action.text, action.mood)
          break
        case 'map-reveal':
          dispatch.revealMap?.(action.cells)
          break
        case 'sound-effect':
          dispatch.playSound?.(action.sound)
          break
      }
    } catch {
      // Individual dispatch failure should not block other actions
    }
  }
}
