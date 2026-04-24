import { useGameStore } from '../../stores/use-game-store'
import { revealRoll, rollForDm } from '../dice/dice-service'
import { broadcastDiceResult, getLastRoll, parseDiceFormula, rollDiceFormula, rollSingle, setLastRoll } from './helpers'
import type { ChatCommand, CommandContext } from './types'

function executeHiddenRoll(args: string, ctx: CommandContext) {
  if (!args.trim()) {
    return { handled: false, error: 'Usage: /hdice <formula>  e.g. /hdice 1d20+5' }
  }

  const formula = parseDiceFormula(args.trim())
  if (!formula) {
    return { handled: false, error: `Invalid dice formula: ${args.trim()}` }
  }

  const formulaStr = args.trim()
  const result = rollDiceFormula(formula)
  setLastRoll({ formula: formulaStr, rolls: result.rolls, total: result.total, rollerName: ctx.playerName })

  // Trigger 3D dice locally for DM + send hidden animation to players
  rollForDm(formulaStr, { rollerName: ctx.playerName })

  useGameStore.getState().addHiddenDiceResult({
    id: crypto.randomUUID(),
    formula: formulaStr,
    rolls: result.rolls,
    total: result.total,
    timestamp: Date.now()
  })

  ctx.addSystemMessage(
    `[Hidden Roll] ${ctx.playerName} rolled ${formulaStr}: [${result.rolls.join(', ')}] = ${result.total}`
  )

  return { handled: true, preventBroadcast: true }
}

export const commands: ChatCommand[] = [
  // /roll - Standard dice roll
  {
    name: 'roll',
    aliases: ['r'],
    description: 'Roll dice using standard notation',
    usage: '/roll <formula>',
    examples: ['/roll 1d20+5', '/roll 2d6+3', '/r 1d20', '/roll 4d6kh3'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      if (!args.trim()) {
        return { handled: false, error: 'Usage: /roll <formula>  e.g. /roll 1d20+5' }
      }

      const formulaStr = args.trim()
      const formula = parseDiceFormula(formulaStr)
      if (!formula) {
        return { handled: false, error: `Invalid dice formula: ${formulaStr}` }
      }

      const result = rollDiceFormula(formula)
      setLastRoll({ formula: formulaStr, rolls: result.rolls, total: result.total, rollerName: ctx.playerName })
      broadcastDiceResult(formulaStr, result.rolls, result.total, ctx.playerName)

      return { handled: true }
    }
  },

  // /adv - Roll with advantage (2d20, take highest)
  {
    name: 'adv',
    aliases: ['advantage'],
    description: 'Roll with advantage (2d20, take highest)',
    usage: '/adv [modifier]',
    examples: ['/adv', '/adv +5', '/adv -2', '/advantage +3'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      const modStr = args.trim()
      let modifier = 0
      if (modStr) {
        modifier = parseInt(modStr, 10)
        if (Number.isNaN(modifier)) {
          return { handled: false, error: `Invalid modifier: ${modStr}. Use a number like +5 or -2.` }
        }
      }

      const roll1 = rollSingle(20)
      const roll2 = rollSingle(20)
      const higher = Math.max(roll1, roll2)
      const total = higher + modifier

      const modDisplay = modifier >= 0 && modifier !== 0 ? `+${modifier}` : modifier !== 0 ? `${modifier}` : ''
      const formulaDisplay = `2d20kh1${modDisplay}`

      setLastRoll({ formula: formulaDisplay, rolls: [roll1, roll2], total, rollerName: ctx.playerName })
      broadcastDiceResult(`${formulaDisplay} (advantage)`, [roll1, roll2], total, ctx.playerName)

      return { handled: true }
    }
  },

  // /dis - Roll with disadvantage (2d20, take lowest)
  {
    name: 'dis',
    aliases: ['disadvantage'],
    description: 'Roll with disadvantage (2d20, take lowest)',
    usage: '/dis [modifier]',
    examples: ['/dis', '/dis +3', '/dis -1', '/disadvantage +2'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      const modStr = args.trim()
      let modifier = 0
      if (modStr) {
        modifier = parseInt(modStr, 10)
        if (Number.isNaN(modifier)) {
          return { handled: false, error: `Invalid modifier: ${modStr}. Use a number like +5 or -2.` }
        }
      }

      const roll1 = rollSingle(20)
      const roll2 = rollSingle(20)
      const lower = Math.min(roll1, roll2)
      const total = lower + modifier

      const modDisplay = modifier >= 0 && modifier !== 0 ? `+${modifier}` : modifier !== 0 ? `${modifier}` : ''
      const formulaDisplay = `2d20kl1${modDisplay}`

      setLastRoll({ formula: formulaDisplay, rolls: [roll1, roll2], total, rollerName: ctx.playerName })
      broadcastDiceResult(`${formulaDisplay} (disadvantage)`, [roll1, roll2], total, ctx.playerName)

      return { handled: true }
    }
  },

  // /reroll - Reroll the last dice roll
  {
    name: 'reroll',
    aliases: [],
    description: 'Reroll the last dice roll',
    usage: '/reroll',
    examples: ['/reroll'],
    category: 'player',
    dmOnly: false,
    execute: (_args: string, ctx: CommandContext) => {
      const lastRoll = getLastRoll()
      if (!lastRoll) {
        return { handled: false, error: 'No previous roll to reroll.' }
      }

      const formula = parseDiceFormula(lastRoll.formula)
      if (!formula) {
        return { handled: false, error: 'Could not parse the last roll formula.' }
      }

      const result = rollDiceFormula(formula)
      const formulaStr = lastRoll.formula
      setLastRoll({ formula: formulaStr, rolls: result.rolls, total: result.total, rollerName: ctx.playerName })
      broadcastDiceResult(`${formulaStr} (reroll)`, result.rolls, result.total, ctx.playerName)

      return { handled: true }
    }
  },

  // /multiroll - Roll multiple dice sets
  {
    name: 'multiroll',
    aliases: ['mr'],
    description: 'Roll the same dice formula multiple times',
    usage: '/multiroll <count> <formula>',
    examples: ['/multiroll 4 1d20+5', '/mr 6 3d6', '/multiroll 3 2d8+2'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        return { handled: false, error: 'Usage: /multiroll <count> <formula>  e.g. /multiroll 4 1d20+5' }
      }

      const count = parseInt(parts[0], 10)
      if (Number.isNaN(count) || count < 1) {
        return { handled: false, error: `Invalid count: ${parts[0]}. Must be a positive number.` }
      }
      if (count > 20) {
        return { handled: false, error: 'Maximum of 20 rolls at once.' }
      }

      const formulaStr = parts.slice(1).join('')
      const formula = parseDiceFormula(formulaStr)
      if (!formula) {
        return { handled: false, error: `Invalid dice formula: ${formulaStr}` }
      }

      const results: { rolls: number[]; total: number }[] = []
      for (let i = 0; i < count; i++) {
        results.push(rollDiceFormula(formula))
      }

      const allRolls = results.flatMap((r) => r.rolls)
      const grandTotal = results.reduce((sum, r) => sum + r.total, 0)

      setLastRoll({ formula: formulaStr, rolls: allRolls, total: grandTotal, rollerName: ctx.playerName })
      broadcastDiceResult(`${count}x ${formulaStr}`, allRolls, grandTotal, ctx.playerName)

      return { handled: true }
    }
  },

  // /hdice - Hidden dice roll (DM only)
  {
    name: 'hdice',
    aliases: ['hroll'],
    description: 'Roll dice secretly (only visible to the DM)',
    usage: '/hdice <formula>',
    examples: ['/hdice 1d20+5', '/hroll 2d6+3'],
    category: 'dm',
    dmOnly: true,
    execute: (args: string, ctx: CommandContext) => {
      return executeHiddenRoll(args, ctx)
    }
  },

  // /secretroll - Secret roll (DM only, alternative name for hdice)
  {
    name: 'secretroll',
    aliases: ['sr'],
    description: 'Roll dice secretly (only visible to the DM)',
    usage: '/secretroll <formula>',
    examples: ['/secretroll 1d20+5', '/sr 3d6'],
    category: 'dm',
    dmOnly: true,
    execute: (args: string, ctx: CommandContext) => {
      return executeHiddenRoll(args, ctx)
    }
  },

  // /reveal - Reveal the last hidden roll to all players
  {
    name: 'reveal',
    aliases: ['showroll'],
    description: 'Reveal your last hidden roll to all players',
    usage: '/reveal [label]',
    examples: ['/reveal Attack Roll', '/reveal'],
    category: 'dm',
    dmOnly: true,
    execute: (args: string, ctx: CommandContext) => {
      const last = getLastRoll()
      if (!last) {
        return { handled: false, error: 'No previous roll to reveal.' }
      }
      const label = args.trim() || undefined
      revealRoll(
        { formula: last.formula, rolls: last.rolls, total: last.total, natural20: false, natural1: false },
        label
      )
      ctx.addSystemMessage(
        `[Revealed] ${last.formula}: [${last.rolls.join(', ')}] = ${last.total}${label ? ` (${label})` : ''}`
      )
      return { handled: true }
    }
  },

  // /roll mass - Roll dice for many targets at once
  {
    name: 'massroll',
    aliases: ['rollmass'],
    description: 'Roll once and apply to multiple targets (e.g. AoE saves)',
    usage: '/massroll <count> <formula> [label]',
    examples: ['/massroll 5 1d20+3 DEX save', '/massroll 3 2d6 fireball damage'],
    category: 'dm',
    dmOnly: true,
    execute: (args: string, ctx: CommandContext) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        return { handled: false, error: 'Usage: /massroll <count> <formula> [label]' }
      }
      const count = parseInt(parts[0], 10)
      if (Number.isNaN(count) || count < 1 || count > 50) {
        return { handled: false, error: 'Count must be between 1 and 50.' }
      }
      const formulaStr = parts[1]
      const label = parts.slice(2).join(' ') || 'Mass Roll'
      const formula = parseDiceFormula(formulaStr)
      if (!formula) {
        return { handled: false, error: `Invalid dice formula: ${formulaStr}` }
      }

      const results: string[] = []
      for (let i = 0; i < count; i++) {
        const result = rollDiceFormula(formula)
        results.push(`#${i + 1}: [${result.rolls.join(', ')}] = ${result.total}`)
      }

      ctx.broadcastSystemMessage(
        `${ctx.playerName} mass-rolled ${count}x ${formulaStr} (${label}):\n${results.join('\n')}`
      )
      return { handled: true }
    }
  },

  // /fudge - DM fudge roll (predetermined result, shown as normal roll)
  {
    name: 'fudge',
    aliases: ['rollfudge'],
    description: 'Set a predetermined roll result (DM only, shown as normal roll)',
    usage: '/fudge <formula> <result>',
    examples: ['/fudge 1d20+5 18', '/fudge 2d6 7'],
    category: 'dm',
    dmOnly: true,
    execute: (args: string, ctx: CommandContext) => {
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) {
        return { handled: false, error: 'Usage: /fudge <formula> <result>' }
      }
      const formulaStr = parts[0]
      const targetResult = parseInt(parts[1], 10)
      if (Number.isNaN(targetResult)) {
        return { handled: false, error: `Invalid result: ${parts[1]}` }
      }

      setLastRoll({ formula: formulaStr, rolls: [targetResult], total: targetResult, rollerName: ctx.playerName })
      broadcastDiceResult(formulaStr, [targetResult], targetResult, ctx.playerName)

      ctx.addSystemMessage(`[Fudged] Actual result set to ${targetResult}`)
      return { handled: true, preventBroadcast: true }
    }
  },

  // /rolltable - Roll on a random table
  {
    name: 'rolltable',
    aliases: ['table', 'randomtable'],
    description: 'Roll on a named random table',
    usage: '/rolltable <table-name>',
    examples: ['/rolltable trinkets', '/table wild-magic', '/rolltable npc-traits'],
    category: 'player',
    dmOnly: false,
    execute: async (args: string, ctx: CommandContext) => {
      const tableName = args.trim().toLowerCase()
      if (!tableName) {
        return { handled: false, error: 'Usage: /rolltable <table-name>. Available tables depend on loaded data.' }
      }

      try {
        const { load5eRandomTables } = await import('../../services/data-provider')
        const tables = await load5eRandomTables()
        const table = (tables as unknown as Record<string, unknown>)[tableName] as
          | Array<{ min: number; max: number; result: string }>
          | undefined
        if (!table || !Array.isArray(table)) {
          const available = Object.keys(tables as unknown as Record<string, unknown>).join(', ')
          return { handled: false, error: `Table "${tableName}" not found. Available: ${available || 'none'}` }
        }

        const maxVal = table.reduce((m, e) => Math.max(m, e.max), 0)
        const roll = rollSingle(maxVal)
        const entry = table.find((e) => roll >= e.min && roll <= e.max)
        const result = entry?.result ?? 'No result'

        ctx.broadcastSystemMessage(`${ctx.playerName} rolled on ${tableName}: [${roll}] - ${result}`)
        return { handled: true }
      } catch {
        return { handled: false, error: 'Failed to load random tables.' }
      }
    }
  }
]
