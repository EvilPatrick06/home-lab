// ── DM Action Types & Parser ──
// Mirrors stat-mutations.ts pattern for game board actions

import { logToFile } from '../log'
import { DmActionsBlockSchema, repairJson, type ValidationIssue, validateDmActions } from './ai-schemas'

const DM_ACTIONS_RE = /\[DM_ACTIONS\]\s*([\s\S]*?)\s*\[\/DM_ACTIONS\]/

// ── Discriminated union of all DM actions ──

export type DmAction =
  // Token management
  | {
      action: 'place_token'
      label: string
      entityType: 'player' | 'npc' | 'enemy'
      gridX: number
      gridY: number
      sizeX?: number
      sizeY?: number
      hp?: number
      ac?: number
      speed?: number
      conditions?: string[]
      visibleToPlayers?: boolean
    }
  | { action: 'move_token'; label: string; gridX: number; gridY: number }
  | { action: 'remove_token'; label: string }
  | {
      action: 'update_token'
      label: string
      hp?: number
      ac?: number
      conditions?: string[]
      visibleToPlayers?: boolean
      label_new?: string
    }
  | {
      action: 'place_creature'
      creatureName?: string
      creatureId?: string
      label?: string
      entityType?: 'player' | 'npc' | 'enemy'
      gridX: number
      gridY: number
      visibleToPlayers?: boolean
    }

  // Initiative
  | {
      action: 'start_initiative'
      entries: Array<{ label: string; roll: number; modifier: number; entityType: 'player' | 'npc' | 'enemy' }>
    }
  | {
      action: 'add_to_initiative'
      label: string
      roll: number
      modifier: number
      entityType: 'player' | 'npc' | 'enemy'
    }
  | { action: 'next_turn' }
  | { action: 'end_initiative' }
  | { action: 'remove_from_initiative'; label: string }

  // Fog of war
  | { action: 'reveal_fog'; cells: Array<{ x: number; y: number }> }
  | { action: 'hide_fog'; cells: Array<{ x: number; y: number }> }

  // Environment
  | { action: 'set_ambient_light'; level: 'bright' | 'dim' | 'darkness' }
  | { action: 'set_underwater_combat'; enabled: boolean }
  | { action: 'set_travel_pace'; pace: 'fast' | 'normal' | 'slow' | null }

  // Shop
  | {
      action: 'open_shop'
      name?: string
      items?: Array<{
        name: string
        category: string
        price: { gp?: number; sp?: number; cp?: number }
        quantity: number
        description?: string
      }>
    }
  | { action: 'close_shop' }
  | {
      action: 'add_shop_item'
      name: string
      category: string
      price: { gp?: number; sp?: number; cp?: number }
      quantity: number
      description?: string
    }
  | { action: 'remove_shop_item'; name: string }

  // Map
  | { action: 'switch_map'; mapName: string }

  // Sidebar
  | {
      action: 'add_sidebar_entry'
      category: 'allies' | 'enemies' | 'places'
      name: string
      description?: string
      visibleToPlayers?: boolean
    }
  | { action: 'remove_sidebar_entry'; category: 'allies' | 'enemies' | 'places'; name: string }

  // Timer
  | { action: 'start_timer'; seconds: number; targetName: string }
  | { action: 'stop_timer' }

  // Hidden dice
  | { action: 'hidden_dice_roll'; formula: string; reason: string }

  // Communication
  | { action: 'whisper_player'; playerName: string; message: string }
  | { action: 'system_message'; message: string }

  // Conditions on entities (tokens)
  | {
      action: 'add_entity_condition'
      entityLabel: string
      condition: string
      duration?: number | 'permanent'
      source?: string
      value?: number
    }
  | { action: 'remove_entity_condition'; entityLabel: string; condition: string }

  // Resting
  | { action: 'short_rest'; characterNames: string[] }
  | { action: 'long_rest'; characterNames: string[] }

  // Area effects
  | {
      action: 'apply_area_effect'
      shape: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation'
      originX: number
      originY: number
      radiusOrLength: number
      widthOrHeight?: number
      damageFormula?: string
      damageType?: string
      saveType?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
      saveDC?: number
      halfOnSave?: boolean
      condition?: string
      conditionDuration?: number | 'permanent'
    }

  // Legendary actions & resistances
  | { action: 'use_legendary_action'; entityLabel: string; actionName: string; cost?: number }
  | { action: 'use_legendary_resistance'; entityLabel: string }

  // Recharge abilities
  | { action: 'recharge_roll'; entityLabel: string; abilityName: string; rechargeOn: number }

  // Time management
  | { action: 'advance_time'; seconds?: number; minutes?: number; hours?: number; days?: number }
  | { action: 'set_time'; hour?: number; minute?: number; totalSeconds?: number }
  | { action: 'share_time'; target?: 'all' | 'requester'; message?: string }

  // Sound & Ambient
  | { action: 'sound_effect'; sound: string }
  | { action: 'play_ambient'; loop: string }
  | { action: 'stop_ambient' }

  // Journal
  | { action: 'add_journal_entry'; content: string; label?: string }

  // Weather & Moon
  | {
      action: 'set_weather'
      description: string
      temperature?: number
      temperatureUnit?: 'F' | 'C'
      windSpeed?: string
      mechanicalEffects?: string[]
    }
  | { action: 'clear_weather' }
  | { action: 'set_moon'; phase: string }

  // XP & Leveling
  | { action: 'award_xp'; characterNames: string[]; amount: number; reason?: string }
  | { action: 'trigger_level_up'; characterName: string }

  // Bastion Management
  | { action: 'bastion_advance_time'; bastionOwner: string; days: number }
  | { action: 'bastion_issue_order'; bastionOwner: string; facilityName: string; orderType: string; details?: string }
  | { action: 'bastion_deposit_gold'; bastionOwner: string; amount: number }
  | { action: 'bastion_withdraw_gold'; bastionOwner: string; amount: number }
  | { action: 'bastion_resolve_event'; bastionOwner: string; eventType: string }
  | { action: 'bastion_recruit'; bastionOwner: string; facilityName: string; names: string[] }
  | { action: 'bastion_add_creature'; bastionOwner: string; facilityName: string; creatureName: string }

  // Encounters
  | { action: 'load_encounter'; encounterName: string }

  // NPC Attitude
  | { action: 'set_npc_attitude'; npcName: string; attitude: 'friendly' | 'indifferent' | 'hostile'; reason?: string }

  // NPC Relationship Tracking
  | {
      action: 'log_npc_interaction'
      npcName: string
      summary: string
      attitudeAfter: 'friendly' | 'neutral' | 'hostile'
    }
  | {
      action: 'set_npc_relationship'
      npcName: string
      targetNpcName: string
      relationship: string
      disposition: 'friendly' | 'neutral' | 'hostile'
    }

  // Handouts
  | { action: 'share_handout'; title: string; content: string; contentType?: 'text' | 'image' }

export interface DmActionParseResult {
  actions: DmAction[]
  issues: ValidationIssue[]
  rawJsonError?: string
}

/** Extract and validate DM actions JSON from AI response text. */
export function parseDmActions(response: string): DmAction[] {
  return parseDmActionsDetailed(response).actions
}

/**
 * Extract, repair, and schema-validate DM actions from AI response text.
 * Returns both valid actions and detailed validation issues for logging.
 */
export function parseDmActionsDetailed(response: string): DmActionParseResult {
  const match = response.match(DM_ACTIONS_RE)
  if (!match) return { actions: [], issues: [] }

  const repaired = repairJson(match[1])

  let rawItems: unknown[]
  try {
    const parsed = JSON.parse(repaired)
    const block = DmActionsBlockSchema.safeParse(parsed)
    if (!block.success) {
      const err = `[DM_ACTIONS] block missing "actions" array: ${block.error.issues.map((i) => i.message).join(', ')}`
      logToFile('WARN', `[AI Schema] ${err}`)
      return { actions: [], issues: [], rawJsonError: err }
    }
    rawItems = block.data.actions
  } catch (e) {
    const err = `[DM_ACTIONS] JSON parse failed: ${e instanceof Error ? e.message : String(e)}`
    logToFile('WARN', `[AI Schema] ${err}`)
    return { actions: [], issues: [], rawJsonError: err }
  }

  const { valid, issues } = validateDmActions(rawItems)

  if (issues.length > 0) {
    for (const issue of issues) {
      logToFile(
        'WARN',
        `[AI Schema] DM action [${issue.index}] rejected: ${issue.errors.join('; ')} — input: ${JSON.stringify(issue.input).slice(0, 200)}`
      )
    }
  }

  return { actions: valid as DmAction[], issues }
}

/** Remove the [DM_ACTIONS] block from response text for display. */
export function stripDmActions(response: string): string {
  return response.replace(/\s*\[DM_ACTIONS\][\s\S]*?\[\/DM_ACTIONS\]\s*/g, '').trim()
}
