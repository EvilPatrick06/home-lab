import { getPluginCommandRegistry } from '../plugin-system/plugin-registry'
import {
  dashCommand,
  delayactionCommand,
  disengageCommand,
  dodgeCommand,
  grappleCommand,
  hideCommand,
  multiattackCommand,
  reactionCommand,
  readyactionCommand,
  searchCommand,
  shoveCommand,
  useobjCommand
} from './action-commands'
import {
  aoeDamageCommand,
  attackCommand,
  offhandAttackCommand,
  torchCommand,
  unarmedAttackCommand
} from './attack-commands'
import { commands as conditionShortcutCommands } from './commands-condition-shortcuts'
import { commands as diceCommands } from './commands-dice'
import { commands as dmAiCommands } from './commands-dm-ai'
import { commands as dmBastionCommands } from './commands-dm-bastion'
import { commands as dmCampaignCommands } from './commands-dm-campaign'
import { commands as dmCombatCommands } from './commands-dm-combat'
import { commands as dmEconomyCommands } from './commands-dm-economy'
import { commands as dmMapCommands } from './commands-dm-map'
import { commands as dmMonsterCommands } from './commands-dm-monsters'
import { commands as dmNarrativeCommands } from './commands-dm-narrative'
import { commands as dmSoundCommands } from './commands-dm-sound'
import { commands as dmTimeCommands } from './commands-dm-time'
import { commands as playerCheckCommands } from './commands-player-checks'
import { commands as playerCombatCommands } from './commands-player-combat'
import { commands as playerCompanionCommands } from './commands-player-companions'
import { commands as playerConditionCommands } from './commands-player-conditions'
import { commands as playerCurrencyCommands } from './commands-player-currency'
import { commands as playerHpCommands } from './commands-player-hp'
import { commands as playerInventoryCommands } from './commands-player-inventory'
import { commands as playerMountCommands } from './commands-player-mount'
import { commands as playerMovementCommands } from './commands-player-movement'
import { commands as playerResourceCommands } from './commands-player-resources'
import { commands as playerSpellCommands } from './commands-player-spells'
import { commands as playerUtilityCommands } from './commands-player-utility'
import { commands as socialCommands } from './commands-social'
import { commands as utilityCommands } from './commands-utility'
import {
  centerCommand,
  darknessCommand,
  elevateCommand,
  fogCommand,
  gridCommand,
  lightCommand,
  sunmoonCommand,
  weatherCommand2,
  zoomCommand
} from './map-environment-commands'
import {
  moveTokenCommand,
  summonCommand,
  tokenCloneCommand,
  tokenCommand,
  tokenHideCommand,
  tokenShowCommand
} from './map-token-commands'
import type { ChatCommand, CommandContext, CommandResult, CommandReturn } from './types'

// ─── Full command registry ───────────────────────────────────────

const allCommands: ChatCommand[] = [
  ...diceCommands,
  ...playerHpCommands,
  ...playerResourceCommands,
  ...playerMovementCommands,
  ...playerCurrencyCommands,
  ...playerConditionCommands,
  ...playerCompanionCommands,
  ...playerUtilityCommands,
  ...playerMountCommands,
  ...playerCombatCommands,
  ...playerSpellCommands,
  ...playerCheckCommands,
  ...playerInventoryCommands,
  ...conditionShortcutCommands,
  ...dmNarrativeCommands,
  ...dmCombatCommands,
  ...dmMapCommands,
  ...dmEconomyCommands,
  ...dmTimeCommands,
  ...dmBastionCommands,
  ...dmAiCommands,
  ...dmMonsterCommands,
  ...dmCampaignCommands,
  ...socialCommands,
  ...utilityCommands,
  ...dmSoundCommands,
  // Action commands (grapple, shove, dash, dodge, hide, etc.)
  grappleCommand,
  shoveCommand,
  readyactionCommand,
  delayactionCommand,
  multiattackCommand,
  reactionCommand,
  useobjCommand,
  dashCommand,
  disengageCommand,
  dodgeCommand,
  hideCommand,
  searchCommand,
  // Attack commands (offhand, unarmed, AoE, full attack, torch)
  offhandAttackCommand,
  unarmedAttackCommand,
  aoeDamageCommand,
  attackCommand,
  torchCommand,
  // Map environment commands (fog, light, elevation, weather, grid, zoom)
  fogCommand,
  lightCommand,
  elevateCommand,
  darknessCommand,
  weatherCommand2,
  sunmoonCommand,
  gridCommand,
  zoomCommand,
  centerCommand,
  // Map token commands (add/remove, summon, clone, hide/show, move)
  tokenCommand,
  summonCommand,
  tokenCloneCommand,
  tokenHideCommand,
  tokenShowCommand,
  moveTokenCommand
]

// ─── Normalize command return ────────────────────────────────────

function normalizeResult(result: CommandReturn | void, ctx: CommandContext): CommandResult {
  if (!result) return { handled: true }

  // Already a proper CommandResult
  if ('handled' in result) return result

  // CommandMessage format: { type, content }
  if ('type' in result && 'content' in result) {
    if (result.type === 'error') {
      ctx.addErrorMessage(result.content)
      return { handled: true, error: result.content }
    }
    if (result.type === 'broadcast') {
      ctx.broadcastSystemMessage(result.content)
    } else {
      ctx.addSystemMessage(result.content)
    }
    return { handled: true }
  }

  return { handled: true }
}

// ─── Execute ─────────────────────────────────────────────────────

export function executeCommand(input: string, ctx: CommandContext): CommandResult | null {
  if (!input.startsWith('/')) return null

  const spaceIdx = input.indexOf(' ')
  const cmdName = (spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx)).toLowerCase()
  const args = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1)

  let cmd: ChatCommand | undefined = allCommands.find((c) => c.name === cmdName || c.aliases.includes(cmdName))

  // Search plugin-registered commands if no built-in match
  if (!cmd) {
    const pluginCmds = getPluginCommandRegistry()
    const pluginCmd = pluginCmds.find((c) => c.name === cmdName || (c.aliases ?? []).includes(cmdName))
    if (pluginCmd) {
      cmd = {
        name: pluginCmd.name,
        aliases: pluginCmd.aliases ?? [],
        description: pluginCmd.description,
        usage: `/${pluginCmd.name}`,
        category: 'player' as const,
        dmOnly: pluginCmd.dmOnly ?? false,
        execute: pluginCmd.execute as ChatCommand['execute']
      }
    }
  }

  if (!cmd) return null

  if (cmd.dmOnly && !ctx.isDM) {
    return { handled: true, error: `/${cmd.name} is a DM-only command.` }
  }

  const result = cmd.execute(args, ctx)

  // Handle async commands
  if (result instanceof Promise) {
    result.then((r) => normalizeResult(r, ctx)).catch((err) => ctx.addErrorMessage(String(err)))
    return { handled: true }
  }

  return normalizeResult(result, ctx)
}

export function getCommands(isDM: boolean): ChatCommand[] {
  const pluginCmds: ChatCommand[] = getPluginCommandRegistry().map((pc) => ({
    name: pc.name,
    aliases: pc.aliases ?? [],
    description: pc.description,
    usage: `/${pc.name}`,
    category: 'player' as const,
    dmOnly: pc.dmOnly ?? false,
    execute: pc.execute as ChatCommand['execute']
  }))
  const combined = [...allCommands, ...pluginCmds]
  if (isDM) return combined
  return combined.filter((c) => !c.dmOnly)
}

export function getFilteredCommands(partial: string, isDM: boolean): ChatCommand[] {
  const search = partial.toLowerCase().replace(/^\//, '')
  return getCommands(isDM).filter((c) => c.name.startsWith(search) || c.aliases.some((a) => a.startsWith(search)))
}

// Re-export types for backward compatibility
export type { ChatCommand, CommandContext, CommandResult }

// Re-export combat types from commands-player-combat barrel
export type {
  AttackOptions,
  AttackResult,
  DeathSaveResult,
  DeathSaveState,
  GrappleResult,
  ShoveResult
} from './commands-player-combat'
